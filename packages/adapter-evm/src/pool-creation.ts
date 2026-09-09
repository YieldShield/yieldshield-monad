import { zeroAddress, type Address, type PublicClient } from "viem";
import type { CreatePoolIntentParams, PoolCreationOptions, SeedToken } from "@yieldshield/core";
import { DEMO_DEPLOYMENTS } from "./demo-deployments.js";
import { splitRiskPoolFactoryAbi as factoryAbi } from "./abis/splitRiskPoolFactory.js";
import { compositeOracleAbi } from "./abis/compositeOracle.js";
import { erc20Abi } from "./abis/erc20.js";
import { readSnapshot } from "./snapshot.js";
import { assertCreationFactory } from "./pool-registry.js";
export { assertCreationFactory, assertCreatedPools } from "./pool-registry.js";

const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
export const CREATION_BOUNDS = Object.freeze({
  commissionMinBp: 100,
  commissionMaxBp: 5000,
  poolFeeMinBp: 0,
  poolFeeMaxBp: 2000,
  collateralMinBp: 10000,
  collateralMaxBp: 50000,
});
export const CREATION_FIXED = Object.freeze({
  protocolFeeBp: 100,
  maxTvlUsd: 1_000_000_000_000_000n,
  minimumPoolTime: 60,
  unlockDuration: 120,
  shieldTransferLock: 86400,
  protectorTransferLock: 2419200,
});

export function minimumCreationBond(minimumUsd: bigint, decimals: number, priceUsd8: bigint): bigint {
  if (minimumUsd < 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18 || priceUsd8 <= 0n)
    throw new Error("Creation bond valuation is unavailable.");
  return (minimumUsd * 10n ** BigInt(decimals) + priceUsd8 - 1n) / priceUsd8;
}

export async function readPoolCreationOptions(client: PublicClient): Promise<PoolCreationOptions> {
  const snapshot = await readSnapshot(client, "Pool creation");
  const blockNumber = snapshot.block.number;
  const d = await assertCreationFactory(client, blockNumber);
  const factory = { address: d.factory, abi: factoryAbi, blockNumber } as const;
  const [paused, pending, bootstrap, active, limit, minimumBondUsd] = await Promise.all([
    client.readContract({ ...factory, functionName: "paused" }),
    client.readContract({ ...factory, functionName: "pendingGovernanceTimelock" }),
    client.readContract({ ...factory, functionName: "bootstrapModeEnabled" }),
    client.readContract({ ...factory, functionName: "activePoolCount" }),
    client.readContract({ ...factory, functionName: "maxActivePools" }),
    client.readContract({ ...factory, functionName: "minimumCreationBondUsd" }),
  ]);
  const maxActivePools = limit === 0n ? 1000n : limit;
  if (paused || bootstrap || !same(pending, zeroAddress)) throw new Error("Pool creation is temporarily unavailable.");
  if (active >= maxActivePools) throw new Error("The factory's active pool limit has been reached.");
  const demo = DEMO_DEPLOYMENTS[84532]!;
  const usdVault = d.vaults.find((v) => v.underlyingSymbol === "TestUSDC")!;
  const assets = [...demo.assets, { token: demo.quoteToken, symbol: "TestUSDC", name: "Test USDC", decimals: 6 }];
  const tokens = await Promise.all(
    assets.map(async (a) => {
      const [info, listed, decimals] = await Promise.all([
        client.readContract({ ...factory, functionName: "tokenInfo", args: [a.token] }),
        client.readContract({ ...factory, functionName: "isWhitelisted", args: [a.token] }),
        client.readContract({ address: a.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
      ]);
      if (!listed || !same(info[2], a.token) || info[1] !== a.symbol || decimals !== a.decimals)
        throw new Error("Pool asset whitelist changed. Refresh before continuing.");
      return {
        token: a.token,
        name: info[0],
        symbol: info[1],
        decimals,
        minCollateralRatioBp: info[5],
        tranche: info[5] >= 15000n ? "volatile" : "stable",
      } as SeedToken;
    }),
  );
  const backingTokens = tokens.filter((t) => same(t.token, demo.quoteToken) || same(t.token, usdVault.address));
  const backingAssets = await Promise.all(
    backingTokens.map(async (t) => {
      const price = await client.readContract({
        address: d.compositeOracle,
        abi: compositeOracleAbi,
        functionName: "getPrice",
        args: [t.token as Address],
        blockNumber,
      });
      return { ...t, minimumBondAmount: minimumCreationBond(minimumBondUsd, t.decimals, price) };
    }),
  );
  return snapshot.finish({
    chainId: 84532,
    factory: d.factory,
    protectedAssets: tokens.filter((t) => !backingTokens.includes(t)),
    backingAssets,
    minimumBondUsd,
    bounds: { ...CREATION_BOUNDS },
    fixed: { ...CREATION_FIXED },
    activePools: Number(active),
    maxActivePools: Number(maxActivePools),
    evaluatedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
  });
}

export function validateCreationParams(p: CreatePoolIntentParams, options: PoolCreationOptions) {
  const shielded = options.protectedAssets.find((t) => same(t.token, p.shieldedToken));
  const backing = options.backingAssets.find((t) => same(t.token, p.backingToken));
  if (!shielded || !backing || same(p.shieldedToken, p.backingToken))
    throw new Error("Choose a supported protected asset and backing asset.");
  const b = options.bounds;
  const floor = Math.max(b.collateralMinBp, Number(backing.minCollateralRatioBp));
  for (const [value, min, max, label] of [
    [p.commissionRateBp, b.commissionMinBp, b.commissionMaxBp, "Junior gain share"],
    [p.poolFeeBp, b.poolFeeMinBp, b.poolFeeMaxBp, "Creator gain fee"],
    [p.collateralRatioBp, floor, b.collateralMaxBp, "Collateral ratio"],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`${label} is outside the allowed range.`);
  }
  for (const key of Object.keys(options.fixed) as Array<keyof typeof options.fixed>)
    if (p[key] !== options.fixed[key])
      throw new Error(`${key} is a protocol setting and cannot be changed by a pool creator.`);
  if ((p.creationBondAmount ?? 0n) < backing.minimumBondAmount)
    throw new Error("The creation bond is below the current minimum.");
  return { shielded, backing };
}
