import assert from "node:assert/strict";
import { deploymentAssets } from "./monad-assets.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root)));
const names = [
  "SplitRiskPool",
  "SplitRiskPoolFactory",
  "ShieldReceiptNFT",
  "ProtectorReceiptNFT",
  "MonadTestToken",
  "MonadWrappedNative",
  "MonadYieldVault",
  "MonadStakingRouter",
  "MonadReferenceFeed",
  "MonadScenarioOracle",
  "MonadAssetExchange",
  "ConfigurableTokenFaucet",
];
const abis = Object.fromEntries(names.map((n) => [n, read(`contracts/out/${n}.sol/${n}.json`).abi]));
writeFileSync(new URL("config/abis.json", root), JSON.stringify(abis) + "\n");
const browserFunctions = {
  SplitRiskPool: [
    "depositShieldedAsset",
    "depositBackingAsset",
    "shieldedWithdraw",
    "partialWithdrawShielded",
    "protectorWithdraw",
    "claimCommission",
    "startUnlockProcess",
    "cancelUnlockProcess",
  ],
  SplitRiskPoolFactory: ["createPool"],
  MonadWrappedNative: ["deposit", "withdraw"],
  MonadYieldVault: ["previewDeposit", "previewRedeem", "depositWithMin", "redeemWithMin", "fundTestYield"],
  MonadStakingRouter: ["stake"],
  MonadAssetExchange: ["swap"],
  ConfigurableTokenFaucet: ["canDrip", "dripAll"],
};
const browserAbis = Object.fromEntries(
  Object.entries(browserFunctions).map(([name, functions]) => {
    for (const fn of functions)
      assert(
        abis[name].some((item) => item.type === "function" && item.name === fn),
        `Missing browser function ${name}.${fn}`,
      );
    return [
      name,
      abis[name].filter((item) => item.type === "error" || (item.type === "function" && functions.includes(item.name))),
    ];
  }),
);
writeFileSync(new URL("config/browser-abis.json", root), JSON.stringify(browserAbis) + "\n");
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
  assets: deploymentAssets(m, read("config/monad.json")),
  pools: m.pools,
  referenceStatus: m.referenceStatus,
  updatedAt: evidence.checkedAt,
};
writeFileSync(new URL("config/deployment.json", root), JSON.stringify(r, null, 2) + "\n");
console.log(`Synced ${r.pools.length} verified deployment records; no signer data included.`);
