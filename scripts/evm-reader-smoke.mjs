/**
 * Live smoke test for @yieldshield/adapter-evm against the seeded Robinhood testnet deployment
 * (chain 46630). Read-only — exercises the ChainReader port surface end-to-end over public RPC.
 *
 *   node scripts/evm-reader-smoke.mjs [ownerAddress]
 */
import { createEvmAdapter, robinhoodTestnet } from "@yieldshield/adapter-evm";

const adapter = createEvmAdapter({ chain: robinhoodTestnet, label: "Robinhood" });
console.log(`chain: ${adapter.info.label} (${adapter.info.network})  factory: ${adapter.info.protocolId}`);

const tokens = await adapter.reader.listWhitelistedTokens();
console.log(`\nwhitelisted tokens (${tokens.length}):`);
for (const t of tokens)
  console.log(
    `  ${t.symbol.padEnd(6)} ${t.name.padEnd(28)} dec=${t.decimals} minCR=${t.minCollateralRatioBp}bp ${t.tranche}`,
  );

const pools = await adapter.reader.loadPools();
console.log(`\npools (${pools.length}):`);
for (const p of pools) {
  const s = p.stats;
  console.log(
    `  ${p.shielded.symbol}/${p.backing.symbol}`.padEnd(14) +
      ` premium=${s.premiumRateBp}bp fee=${s.poolFeeBp}bp CR=${s.collateralRatioBp}bp` +
      ` cover=${s.coverageBps ?? "—"} util=${s.utilizationBps ?? "—"} tvlUsd=${s.shieldTvlUsd}` +
      ` protectors=${s.protectorPositionCount} oracle=${p.oracle.status}${p.oracle.paused ? " PAUSED" : ""}` +
      ` active=${s.active}`,
  );
}

const owner = process.argv[2];
if (owner) {
  const [positions, balances, activity] = await Promise.all([
    adapter.reader.getOwnerPositions(owner),
    adapter.reader.getBalances(owner),
    adapter.reader.getActivity(owner),
  ]);
  console.log(`\npositions for ${owner}: shield=${positions.shield.length} protector=${positions.protector.length}`);
  for (const s of positions.shield) console.log(`  shield ${s.id} deposited=${s.deposited} usd=${s.currentValueUsd}`);
  for (const pr of positions.protector)
    console.log(`  protector ${pr.id} collateral=${pr.collateral} unlocking=${pr.isUnlocking}`);
  console.log(
    `balances: ${
      balances
        .filter((b) => b.amount > 0n)
        .map((b) => `${b.token.symbol}=${b.amount}`)
        .join(" ") || "none"
    }`,
  );
  console.log(`activity entries: ${activity.length}`);
}
console.log("\nsmoke OK");
