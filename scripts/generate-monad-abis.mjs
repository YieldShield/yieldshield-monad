import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** Regenerate interfaces from local artifacts without publishing deployment records. */
export function generateMonadAbis(root = new URL("../", import.meta.url)) {
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
    "MonadRedstoneReferenceFeed",
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
        abis[name].filter(
          (item) => item.type === "error" || (item.type === "function" && functions.includes(item.name)),
        ),
      ];
    }),
  );
  writeFileSync(new URL("config/browser-abis.json", root), JSON.stringify(browserAbis) + "\n");
  console.log(`Generated ${names.length} contract ABIs and ${Object.keys(browserAbis).length} browser ABIs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateMonadAbis();
}
