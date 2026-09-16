import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createMonadReadClient } from "../services/monad/read-client.mjs";

// Read-only benchmark: compare the same getters at one fixed public testnet block.
const config = JSON.parse(readFileSync(new URL("../config/monad.json", import.meta.url)));
const registry = JSON.parse(readFileSync(new URL("../config/deployment.json", import.meta.url)));
const abis = JSON.parse(readFileSync(new URL("../config/abis.json", import.meta.url)));
const url = process.env.MONAD_RPC_URL || config.rpcUrl;
const direct = createMonadReadClient(url, { aggregate: false });
const batched = createMonadReadClient(url);
assert.equal(await direct.getChainId(), 10143);
const blockNumber = await direct.getBlockNumber();
const methods = [
  "poolConfig",
  "totalProtectorTokens",
  "totalShieldedTokens",
  "totalShieldCollateralAmount",
  "totalValueAtDeposit",
  "totalProtectorShares",
  "paused",
  "shieldReceiptNFT",
  "protectorReceiptNFT",
  "COLLATERAL_RATIO",
  "COMMISSION_RATE",
  "POOL_FEE",
];
async function measure(client) {
  const start = performance.now();
  const values = await Promise.all(
    registry.pools.flatMap((pool) =>
      methods.map((functionName) =>
        client.readContract({ address: pool.address, abi: abis.SplitRiskPool, functionName, blockNumber }),
      ),
    ),
  );
  return { values, milliseconds: Math.round(performance.now() - start) };
}
const original = await measure(direct);
const aggregated = await measure(batched);
assert.deepEqual(aggregated.values, original.values);
const evidence = {
  observedAt: new Date().toISOString(),
  chainId: 10143,
  blockNumber: String(blockNumber),
  pools: registry.pools.length,
  comparedValues: original.values.length,
  resultsMatch: true,
  directMilliseconds: original.milliseconds,
  aggregatedMilliseconds: aggregated.milliseconds,
  note: "Single read-only sample. Fixed-block values match; this does not measure full-page load or guarantee future latency.",
};
const json = JSON.stringify(evidence, null, 2) + "\n";
if (process.argv[2]) writeFileSync(process.argv[2], json);
console.log(json);
