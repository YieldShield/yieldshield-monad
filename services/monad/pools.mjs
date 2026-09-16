import { factoryVersions } from "../../scripts/monad-factories.mjs";

const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/** Custom terms do not change pool provenance or the supported asset policy. */
export async function discoverPools(registry, get, getStorageAt, blockNumber) {
  const found = [...registry.pools];
  for (const version of factoryVersions(registry)) {
    const factory = registry.contracts[version.contract].address;
    const pools = await get(factory, "SplitRiskPoolFactory", "getActivePools", [], blockNumber);
    if (pools.length > 200) throw new Error("Pool index requires pagination");
    for (const poolAddress of pools) {
      if (found.some((p) => same(p.address, poolAddress))) continue;
      const info = await get(factory, "SplitRiskPoolFactory", "getPoolInfo", [poolAddress], blockNumber);
      const shield = registry.assets.find((a) => same(a.address, info.shieldedToken));
      const backing = registry.assets.find((a) => same(a.address, info.backingToken));
      if (!shield || !backing) continue;
      if (!version.protectedAssets.includes(shield.id) || !version.backingAssets.includes(backing.id)) continue;
      const origin = await get(poolAddress, "SplitRiskPool", "POOL_FACTORY", [], blockNumber);
      if (!same(origin, factory)) throw new Error("Pool provenance mismatch");
      const implementation = await getStorageAt({
        address: poolAddress,
        slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        blockNumber,
      });
      if (!implementation || !same("0x" + implementation.slice(-40), registry.contracts[version.router].address))
        throw new Error("Pool router mismatch");
      found.push({
        id: poolAddress.toLowerCase(),
        address: poolAddress,
        shieldedToken: shield.address,
        backingToken: backing.address,
        symbol: shield.symbol,
        backingSymbol: backing.symbol,
        environment: version.environment,
        priceKind: shield.kind,
        discovered: true,
        factory,
        factoryVersion: version.id,
      });
    }
  }
  return found;
}

/** Invert the contract's USD ceilings and native-token floors, without floating point. */
export function protectionCapacity({
  totalBacking,
  totalShielded,
  reserved,
  entryValue,
  backingPrice,
  shieldPrice,
  backingDecimals,
  shieldDecimals,
  collateralBps,
  maxDeposit,
  maxTvl,
}) {
  if (backingPrice <= 0n || shieldPrice <= 0n || collateralBps < 10000n || collateralBps > 50000n) return 0n;
  const backingScale = 10n ** BigInt(backingDecimals),
    shieldScale = 10n ** BigInt(shieldDecimals);
  const backingUsd = (totalBacking * backingPrice) / backingScale;
  const nativeCapacity = totalBacking > reserved ? totalBacking - reserved : 0n;
  const usdLimit = (backingUsd * 10000n) / collateralBps - entryValue;
  // floor(requiredUsd * backingScale / price) <= remaining backing.
  const reserveUsdLimit = ((nativeCapacity + 1n) * backingPrice - 1n) / backingScale;
  const nativeLimit = (reserveUsdLimit * 10000n) / collateralBps;
  const tvlLimit = maxTvl - backingUsd - (totalShielded * shieldPrice) / shieldScale;
  const limit = [usdLimit, nativeLimit, tvlLimit].reduce((a, b) => (a < b ? a : b));
  if (limit <= 0n) return 0n;
  const units = ((limit + 1n) * shieldScale - 1n) / shieldPrice;
  const result = units < maxDeposit ? units : maxDeposit;
  const value = (result * shieldPrice) / shieldScale;
  const collateral = (((value * collateralBps + 9999n) / 10000n) * backingScale) / backingPrice;
  return value > 0n && collateral > 0n ? result : 0n;
}
