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
const m = read("contracts/deployments/monad-testnet.json");
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
  assets: m.assets,
  pools: m.pools,
  referenceStatus: m.referenceStatus,
  updatedAt: new Date().toISOString(),
};
writeFileSync(new URL("config/deployment.json", root), JSON.stringify(r, null, 2) + "\n");
console.log(`Synced ${r.pools.length} verified deployment records; no signer data included.`);
