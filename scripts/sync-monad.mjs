import { generateMonadAbis } from "./generate-monad-abis.mjs";
import { factoryVersions } from "./monad-factories.mjs";
import assert from "node:assert/strict";
import { deploymentAssets } from "./monad-assets.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
generateMonadAbis(root);
const m = read("contracts/deployments/monad-testnet.json");
const evidence = read("docs/evidence/deployment-verification.json");
assert.equal(evidence.chainId, 10143);
assert(evidence.allDeclaredContractsVerified, "Verify deployment before publishing");
for (const [name, c] of Object.entries(m.contracts)) {
  const checked = evidence.contracts.find((x) => x.name === name);
  assert(
    checked &&
      checked.address === c.address &&
      checked.runtimeCodehash === c.runtimeCodehash &&
      checked.txHash === c.txHash,
    `Unverified ${name}`,
  );
}
for (const p of m.pools)
  assert(
    evidence.pools.some((x) => x.id === p.id && x.address === p.address && x.configurationVerified),
    `Unverified pool ${p.id}`,
  );
const r = {
  schemaVersion: 1,
  chainId: m.chainId,
  status: m.status,
  contracts: Object.fromEntries(
    Object.entries(m.contracts).map(([n, c]) => [
      n,
      { address: c.address, runtimeCodehash: c.runtimeCodehash, artifact: c.artifact, txHash: c.txHash },
    ]),
  ),
  expandedFactories: m.expandedFactories || [],
  assets: deploymentAssets(m, read("config/monad.json")),
  pools: m.pools,
  referenceStatus: m.referenceStatus,
  referenceOracle: m.referenceOracle || "pyth",
  updatedAt: evidence.checkedAt,
};
r.factories = factoryVersions(r);
writeFileSync(new URL("config/deployment.json", root), JSON.stringify(r, null, 2) + "\n");
console.log(`Synced ${r.pools.length} verified deployment records; no signer data included.`);
