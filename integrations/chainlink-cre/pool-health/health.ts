import { z } from 'zod';

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const uint = z.string().regex(/^(0|[1-9][0-9]*)$/).max(78);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const configSchema = z.object({
  schedule: z.string().min(1),
  chainName: z.literal('monad-testnet'),
  chainId: z.literal(10143),
  apiUrl: z.literal('https://monad-api.yieldshield.ai/api/status'),
  maxSnapshotAgeSeconds: z.number().int().min(10).max(300),
  maxOracleAgeSeconds: z.number().int().min(10).max(120),
  minFreeBackingBps: z.number().int().min(0).max(10000),
  // Two pools and three feeds keep this workflow within CRE's 15 EVM-read quota.
  pools: z.array(z.object({ id: z.string(), address, shieldedToken: address, backingToken: address })).min(1).max(2),
  assets: z.array(z.object({ address, symbol: z.string(), feed: address, checkPublishedAt: z.boolean() })).min(1).max(3),
}).superRefine((config, ctx) => {
  if (new Set(config.pools.map(p => p.address.toLowerCase())).size !== config.pools.length ||
      new Set(config.assets.map(a => a.address.toLowerCase())).size !== config.assets.length) {
    ctx.addIssue({ code: 'custom', message: 'Duplicate pool or asset' });
  }
  for (const pool of config.pools) {
    for (const token of [pool.shieldedToken, pool.backingToken]) {
      if (!config.assets.some(a => same(a.address, token))) ctx.addIssue({ code: 'custom', message: 'Missing configured feed' });
    }
  }
});
export type Config = z.infer<typeof configSchema>;

const apiSchema = z.object({
  chainId: z.literal(10143),
  blockNumber: uint,
  blockTimestamp: uint,
  contractsVerified: z.boolean(),
  markets: z.array(z.object({
    address, shieldedToken: address, backingToken: address,
    totalBacking: uint, reserved: uint, paused: z.boolean(),
  }).passthrough()).max(200),
  assets: z.array(z.object({ address, feed: address, healthy: z.boolean(), price: uint.nullable() }).passthrough()).max(50),
});
export type ApiSnapshot = {
  blockNumber: string; blockTimestamp: string; contractsVerified: boolean;
  pools: { address: string; totalBacking: string; reserved: string; paused: boolean }[];
  assets: { address: string; healthy: boolean; price: string }[];
};

/** Reduce the API to a bounded consensus observation, keeping all comparisons at one block. */
export function parseSnapshot(value: unknown, config: Config): ApiSnapshot {
  const parsed = apiSchema.parse(value);
  return {
    blockNumber: parsed.blockNumber,
    blockTimestamp: parsed.blockTimestamp,
    contractsVerified: parsed.contractsVerified,
    pools: config.pools.map(pool => {
      const candidates = parsed.markets.filter(p => same(p.address, pool.address));
      if (candidates.length !== 1) throw new Error(`Missing or duplicate pool: ${pool.id}`);
      const p = candidates[0];
      if (!same(p.shieldedToken, pool.shieldedToken) || !same(p.backingToken, pool.backingToken)) throw new Error(`Pool token mismatch: ${pool.id}`);
      return { address: pool.address, totalBacking: p.totalBacking, reserved: p.reserved, paused: p.paused };
    }),
    assets: config.assets.map(asset => {
      const candidates = parsed.assets.filter(a => same(a.address, asset.address));
      if (candidates.length !== 1 || !same(candidates[0].feed, asset.feed)) throw new Error(`Feed mismatch: ${asset.symbol}`);
      return { address: asset.address, healthy: candidates[0].healthy, price: candidates[0].price ?? "" };
    }),
  };
}

export type ChainPool = { address: string; totalBacking: bigint; reserved: bigint; paused: boolean };
export type ChainAsset = { address: string; price: bigint; stale: boolean; publishedAt: bigint };
export type Alert = { severity: 'warning' | 'critical'; code: string; subject: string };

export function validateBlock(snapshot: ApiSnapshot, chainBlock: bigint, timestamp: bigint, nowSeconds: number, config: Config) {
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds <= 0) throw new Error('Invalid execution time');
  if (chainBlock !== BigInt(snapshot.blockNumber) || timestamp !== BigInt(snapshot.blockTimestamp)) throw new Error('API block does not match Monad');
  const age = BigInt(nowSeconds) - timestamp;
  if (age < -5n || age > BigInt(config.maxSnapshotAgeSeconds)) throw new Error('API snapshot is stale or future-dated');
}

export function evaluateHealth(config: Config, snapshot: ApiSnapshot, pools: ChainPool[], assets: ChainAsset[], blockTimestamp: bigint, observedAt: number) {
  const alerts: Alert[] = [];
  const alert = (severity: Alert['severity'], code: string, subject: string) => alerts.push({ severity, code, subject });
  if (!snapshot.contractsVerified) alert('critical', 'api-contract-verification-failed', 'deployment');
  const poolReports = config.pools.map(pool => {
    const chain = pools.find(p => same(p.address, pool.address));
    const api = snapshot.pools.find(p => same(p.address, pool.address));
    if (!chain || !api) throw new Error(`Missing pool observation: ${pool.id}`);
    if (chain.totalBacking < 0n || chain.reserved < 0n) throw new Error('Negative onchain balance');
    const agreement = chain.totalBacking === BigInt(api.totalBacking) && chain.reserved === BigInt(api.reserved) && chain.paused === api.paused;
    if (!agreement) alert('critical', 'api-pool-state-mismatch', pool.id);
    if (chain.paused) alert('warning', 'pool-paused', pool.id);
    if (chain.reserved > chain.totalBacking) alert('critical', 'reserved-exceeds-backing', pool.id);
    const free = chain.totalBacking > chain.reserved ? chain.totalBacking - chain.reserved : 0n;
    const freeBps = chain.totalBacking > 0n ? Number(free * 10000n / chain.totalBacking) : 0;
    if (freeBps < config.minFreeBackingBps || chain.totalBacking === 0n) alert('warning', 'low-free-backing', pool.id);
    return { id: pool.id, address: pool.address, totalBacking: chain.totalBacking.toString(), reserved: chain.reserved.toString(), freeBacking: free.toString(), freeBackingBps: freeBps, paused: chain.paused, apiMatches: agreement };
  });
  const assetReports = config.assets.map(asset => {
    const chain = assets.find(a => same(a.address, asset.address));
    const api = snapshot.assets.find(a => same(a.address, asset.address));
    if (!chain || !api) throw new Error(`Missing feed observation: ${asset.symbol}`);
    const age = blockTimestamp - chain.publishedAt;
    const fresh = !chain.stale && chain.price > 0n && (!asset.checkPublishedAt || (chain.publishedAt > 0n && age >= 0n && age <= BigInt(config.maxOracleAgeSeconds)));
    const agreement = api.healthy === fresh && api.price === chain.price.toString();
    if (!fresh) alert('critical', 'oracle-unhealthy', asset.symbol);
    if (!agreement) alert('critical', 'api-oracle-mismatch', asset.symbol);
    return { symbol: asset.symbol, address: asset.address, price: chain.price.toString(), publishedAt: asset.checkPublishedAt ? chain.publishedAt.toString() : null, healthy: fresh, apiMatches: agreement };
  });
  return {
    schemaVersion: 1, integration: 'chainlink-cre', network: 'Monad Testnet', chainId: 10143,
    observedAt, blockNumber: snapshot.blockNumber, blockTimestamp: blockTimestamp.toString(),
    status: alerts.some(a => a.severity === 'critical') ? 'critical' : alerts.length ? 'warning' : 'healthy',
    pools: poolReports, assets: assetReports, alerts,
    scope: 'Read-only monitoring of configured pools; free backing is not a protection quote or solvency guarantee.',
  };
}
