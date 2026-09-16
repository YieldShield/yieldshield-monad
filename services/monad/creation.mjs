import { factoryVersions } from "../../scripts/monad-factories.mjs";
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function creationBond(minimumUsd, price, decimals) {
  if (minimumUsd < 0n || price <= 0n || !Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error("Creation valuation unavailable");
  return (minimumUsd * 10n ** BigInt(decimals) + price - 1n) / price;
}
/** Read at one block, fail closed per version, never turn a source failure into a zero-price quote. */
export async function creationOptions(registry, get, code, blockNumber) {
  return Promise.all(
    factoryVersions(registry).map(async (v) => {
      const factory = registry.contracts[v.contract].address;
      const base = {
        ...v,
        factory,
        collateralBps: "15000",
        juniorFeeBps: "1000",
        creatorFeeBps: "100",
        protocolFeeBps: "100",
        minimumPoolTime: 60,
        unlockDuration: 120,
        limits: {
          minCollateralBps: "10000",
          maxCollateralBps: "50000",
          minJuniorFeeBps: "100",
          maxJuniorFeeBps: "5000",
          minCreatorFeeBps: "0",
          maxCreatorFeeBps: "2000",
        },
      };
      try {
        const [paused, minimumUsd, whitelist, router, pending, pools, configuredLimit, composite, defaultLimit] =
          await Promise.all(
            [
              "paused",
              "minimumCreationBondUsd",
              "getWhitelistedTokens",
              "splitRiskPoolImplementation",
              "pendingGovernanceTimelock",
              "getActivePools",
              "maxActivePools",
              "compositeOracle",
              "MAX_POOLS",
            ].map((f) => get(factory, "SplitRiskPoolFactory", f, [], blockNumber)),
          );
        if (
          paused ||
          pools.length >= Number(configuredLimit || defaultLimit) ||
          !same(pending, "0x0000000000000000000000000000000000000000")
        )
          throw new Error("Pool creation is paused or at capacity.");
        if (!code[v.contract] || !code[v.router] || !same(router, registry.contracts[v.router].address))
          throw new Error("Factory verification failed.");
        const protectedAssets = v.protectedAssets.filter((id) =>
          registry.assets.some((a) => a.id === id && whitelist.some((t) => same(t, a.address))),
        );
        const backing = await Promise.all(
          v.backingAssets.map(async (id) => {
            const asset = registry.assets.find((a) => a.id === id);
            if (!asset || !whitelist.some((t) => same(t, asset.address)))
              return { id, available: false, reason: "Token unavailable." };
            try {
              const [price, tokenInfo] = await Promise.all([
                get(composite, "", "getValue", [asset.address, 10n ** BigInt(asset.decimals)], blockNumber),
                get(factory, "SplitRiskPoolFactory", "tokenInfo", [asset.address], blockNumber),
              ]);
              const tokenMinimum = tokenInfo[5];
              if (typeof tokenMinimum !== "bigint" || tokenMinimum < 0n || tokenMinimum > 50000n)
                throw new Error("Collateral requirement unavailable");
              return {
                id,
                available: true,
                price: String(price),
                minCollateralBps: String(tokenMinimum > 10000n ? tokenMinimum : 10000n),
                bond: String(creationBond(minimumUsd, price, asset.decimals)),
                reason: null,
              };
            } catch {
              return { id, available: false, reason: "Backing valuation or collateral requirement unavailable." };
            }
          }),
        );
        return { ...base, protectedAssets, minimumUsd: String(minimumUsd), backing, available: true, reason: null };
      } catch (error) {
        return {
          ...base,
          backing: [],
          available: false,
          reason: error.message?.startsWith("Pool creation") ? error.message : "Creation settings unavailable.",
        };
      }
    }),
  );
}
