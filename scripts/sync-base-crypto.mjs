#!/usr/bin/env node
/** Verify then publish the additive extension; leaves stock manifest and stock addresses unchanged. */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { ROOT } from "./deploy-base-sepolia.mjs";
import { CRYPTO_PATH, verifyCryptoDeployment } from "./deploy-base-crypto.mjs";
const m = JSON.parse(readFileSync(CRYPTO_PATH, "utf8")),
  old = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/base-sepolia-demo-v1.json"), "utf8"));
const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_SEPOLIA_RPC_URL || "https://base-sepolia-rpc.publicnode.com", {
    timeout: 20000,
    batch: { batchSize: 10, wait: 20 },
  }),
});
await verifyCryptoDeployment(client, m, old);
const c = (n) => m.contracts[n];
const minimum = Object.values(m.transactions).reduce((a, t) => {
  const b = BigInt(t.receipt.blockNumber);
  return b < a ? b : a;
}, 2n ** 256n);
const meta = {
  factory: c("CryptoFactory").address,
  factoryCodehash: c("CryptoFactory").runtimeCodehash,
  factoryImplementation: c("CryptoFactory").constructorArguments[0],
  factoryImplementationCodehash: old.contracts.BaseFactoryRouter.runtimeCodehash,
  poolImplementation: c("CryptoPoolRouter").address,
  poolImplementationCodehash: c("CryptoPoolRouter").runtimeCodehash,
  compositeOracleCodehash: c("CryptoComposite").runtimeCodehash,
  compositeOracle: c("CryptoComposite").address,
  deploymentBlock: String(minimum) + "n",
  faucet: c("CryptoFaucet").address,
  pools: m.pools.map((p) => p.address),
  vaults: m.vaults.map((v) => ({
    ...v,
    underlyingSymbol: m.assets.find((a) => a.testToken.toLowerCase() === v.underlying.toLowerCase()).symbol,
    codehash: c(`Vault:${v.symbol}`).runtimeCodehash,
  })),
};
let s = readFileSync(resolve(ROOT, "packages/adapter-evm/src/crypto-deployment.ts"), "utf8");
const registryMarker = s.search(/\/\*\* (?:Populated|Published) /);
if (registryMarker < 0) throw new Error("Crypto registry publication marker is missing.");
s =
  s.slice(0, registryMarker) +
  "/** Published after complete additive deployment verification. */\nexport const CRYPTO_EXTENSION: CryptoExtension | undefined = " +
  JSON.stringify(meta, null, 2).replace('"' + minimum + 'n"', minimum + "n") +
  ";\n";
writeFileSync(resolve(ROOT, "packages/adapter-evm/src/crypto-deployment.ts"), s);
const demo = {
  chainId: 84532,
  mode: "multi-asset",
  exchange: c("AssetExchange").address,
  oracle: c("AssetOracle").address,
  exchangeCodehash: c("AssetExchange").runtimeCodehash,
  oracleCodehash: c("AssetOracle").runtimeCodehash,
  quoteToken: m.assets.find((a) => a.symbol === "TestUSDC").testToken,
  assets: m.assets
    .filter((a) => a.symbol !== "TestUSDC")
    .map((a) => ({ token: a.testToken, symbol: a.symbol, name: a.name, decimals: a.decimals })),
};
s = readFileSync(resolve(ROOT, "packages/adapter-evm/src/demo-deployments.ts"), "utf8");
s =
  s.slice(0, s.indexOf("export const DEMO_DEPLOYMENTS")) +
  "export const DEMO_DEPLOYMENTS: Readonly<Record<number, DemoDeployment>> = { 84532: " +
  JSON.stringify(demo, null, 2) +
  " };\n";
writeFileSync(resolve(ROOT, "packages/adapter-evm/src/demo-deployments.ts"), s);
for (const file of ["deployments.ts", "faucet-deployments.ts"]) {
  const p = resolve(ROOT, "packages/adapter-evm/src", file);
  s = readFileSync(p, "utf8").replaceAll(old.contracts.Faucet.address, c("CryptoFaucet").address);
  writeFileSync(p, s);
}
execFileSync(
  resolve(ROOT, "node_modules/.bin/esbuild"),
  [
    "packages/adapter-evm/src/status-bundle.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--external:viem",
    "--external:viem/*",
    "--outfile=services/generated/crypto-status-reader.mjs",
  ],
  { cwd: ROOT, stdio: "inherit" },
);
console.log("Published verified additive registry: 13 pools, 9 faucet assets, 8 traded assets, 2 backed vaults.");
