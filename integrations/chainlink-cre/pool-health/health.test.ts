import { describe, expect, test } from 'bun:test';
import registry from '../../../config/deployment.json';
import configJson from './config.json';
import { configSchema, evaluateHealth, parseSnapshot, validateBlock, type ChainAsset, type ChainPool } from './health';
const config = configSchema.parse(configJson);
const now = 1_800_000_000;
function fixture() {
  const pools: ChainPool[] = config.pools.map(p => ({ address: p.address, totalBacking: 1000000000n, reserved: 100000000n, paused: false }));
  const assets: ChainAsset[] = config.assets.map(a => ({ address: a.address, price: 100000000n, stale: false, publishedAt: BigInt(now - 30) }));
  const response = {
    chainId: 10143, blockNumber: '12345', blockTimestamp: String(now), contractsVerified: true,
    markets: config.pools.map((p, i) => ({ ...p, totalBacking: String(pools[i].totalBacking), reserved: String(pools[i].reserved), paused: false })),
    assets: config.assets.map(a => ({ ...a, healthy: true, price: '100000000' })),
  };
  return { pools, assets, response, snapshot: parseSnapshot(response, config) };
}

describe('pool health decisions', () => {
  test('matching fresh observations have healthy status and exact free backing', () => {
    const f = fixture();
    const r = evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now);
    expect(r.status).toBe('healthy');
    expect(r.pools[0].freeBacking).toBe('900000000');
    expect(r.pools[0].freeBackingBps).toBe(9000);
  });
  test('reports over-reservation and API disagreement without negative headroom', () => {
    const f = fixture(); f.pools[0].reserved = 1000000001n;
    const r = evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now);
    expect(r.status).toBe('critical');
    expect(r.pools[0].freeBacking).toBe('0');
    expect(r.alerts.map(a => a.code)).toContain('reserved-exceeds-backing');
    expect(r.alerts.map(a => a.code)).toContain('api-pool-state-mismatch');
  });
  test('paused pool, empty backing and low free backing all require attention', () => {
    const f = fixture(); f.pools[0].paused = true; f.pools[1].totalBacking = 0n; f.pools[1].reserved = 0n;
    const r = evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now);
    expect(r.alerts.map(a => a.code)).toContain('pool-paused');
    expect(r.alerts.map(a => a.code)).toContain('low-free-backing');
  });
  test('checks oracle publication age independently of API and stale flag', () => {
    const f = fixture(); f.assets[0].publishedAt = BigInt(now - 121);
    const r = evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now);
    expect(r.status).toBe('critical');
    expect(r.assets[0].healthy).toBe(false);
    expect(r.alerts.map(a => a.code)).toContain('api-oracle-mismatch');
  });
  test('future oracle timestamps and zero prices cannot be healthy', () => {
    const f = fixture(); f.assets[0].publishedAt = BigInt(now + 1); f.assets[1].price = 0n;
    const r = evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now);
    expect(r.assets.slice(0, 2).map(a => a.healthy)).toEqual([false, false]);
  });
  test('API contract verification failure propagates even when observations agree', () => {
    const f = fixture(); f.snapshot.contractsVerified = false;
    expect(evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now).status).toBe('critical');
  });
  test('fixed test unit feeds need not have a publication timestamp', () => {
    const f = fixture(); f.assets[2].publishedAt = 0n;
    expect(evaluateHealth(config, f.snapshot, f.pools, f.assets, BigInt(now), now).assets[2].healthy).toBe(true);
  });
});

describe('fail-closed input validation', () => {
  test('rejects wrong chain, duplicate pools and swapped tokens', () => {
    const f = fixture();
    expect(() => parseSnapshot({ ...f.response, chainId: 143 }, config)).toThrow();
    expect(() => parseSnapshot({ ...f.response, markets: [...f.response.markets, f.response.markets[0]] }, config)).toThrow();
    f.response.markets[0].backingToken = config.pools[0].shieldedToken;
    expect(() => parseSnapshot(f.response, config)).toThrow('Pool token mismatch');
  });
  test('rejects swapped feeds and malformed integer balances', () => {
    const f = fixture(); f.response.assets[0].feed = config.assets[2].feed;
    expect(() => parseSnapshot(f.response, config)).toThrow('Feed mismatch');
    const f2 = fixture(); f2.response.markets[0].reserved = '-1';
    expect(() => parseSnapshot(f2.response, config)).toThrow();
  });
  test('rejects stale, future and mismatched API blocks', () => {
    const f = fixture();
    expect(() => validateBlock(f.snapshot, 12345n, BigInt(now), now + 121, config)).toThrow('stale');
    expect(() => validateBlock(f.snapshot, 12345n, BigInt(now), now - 6, config)).toThrow('future');
    expect(() => validateBlock(f.snapshot, 12344n, BigInt(now), now, config)).toThrow('does not match');
    expect(() => validateBlock(f.snapshot, 12345n, BigInt(now - 1), now, config)).toThrow('does not match');
    validateBlock(f.snapshot, 12345n, BigInt(now), now, config);
  });
  test('bounds configuration to the intended chain, endpoint and read quota', () => {
    expect(() => configSchema.parse({ ...config, apiUrl: 'http://localhost/metadata' })).toThrow();
    expect(() => configSchema.parse({ ...config, pools: [...config.pools, config.pools[0]] })).toThrow();
    expect(() => configSchema.parse({ ...config, assets: config.assets.slice(1) })).toThrow();
  });
  test('committed addresses and feeds agree with the deployment registry', () => {
    for (const pool of config.pools) {
      const deployed = registry.pools.find((p: { id: string }) => p.id === pool.id);
      if (!deployed) throw new Error("Configured pool missing from registry");
      expect(deployed.address).toBe(pool.address);
      expect(deployed.shieldedToken).toBe(pool.shieldedToken);
      expect(deployed.backingToken).toBe(pool.backingToken);
    }
    for (const asset of config.assets) expect(registry.assets.find((a: { address: string }) => a.address === asset.address)?.feed).toBe(asset.feed);
  });
});
