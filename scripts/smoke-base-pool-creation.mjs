#!/usr/bin/env node
/** One resumable creator-configured pool using the dedicated signer and valueless Sepolia assets. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createPublicClient, http, fallback, parseEther, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ROOT, SequentialDeployment, acquireDeploymentLock } from "./deploy-base-sepolia.mjs";
import { demoEnvironment, demoArtifact, DEPLOYER } from "./deploy-base-demo.mjs";
import { readPoolCreationOptions } from "../packages/adapter-evm/dist/pool-creation.js";
import { planIntent } from "../packages/adapter-evm/dist/intents.js";
import { createReader } from "../packages/adapter-evm/dist/reader.js";
import { CRYPTO_EXTENSION } from "../packages/adapter-evm/dist/crypto-deployment.js";
const broadcast = process.argv.includes("--broadcast");
assert(process.argv.slice(2).every((a) => ["--prepare", "--broadcast"].includes(a)));
if (!broadcast) {
  console.log(
    "Prepared: one tWETH/vUSDC pool, 7% junior gain share, 0.5% creator fee, 175% collateral, current minimum creation bond; fund junior collateral and verify a senior deposit/asset exit. Base Sepolia test assets only.",
  );
  process.exit(0);
}
const env = demoEnvironment(),
  account = privateKeyToAccount(env.BASE_SEPOLIA_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address.toLowerCase(), DEPLOYER.toLowerCase());
const client = createPublicClient({
  chain: baseSepolia,
  transport: fallback(
    ["https://base-sepolia-rpc.publicnode.com", "https://sepolia.base.org"].map((url) =>
      http(url, { timeout: 15000, retryCount: 1 }),
    ),
  ),
});
assert.equal(await client.getChainId(), 84532);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.base-sepolia-deployment.lock"));
process.once("exit", release);
const path = resolve(ROOT, "contracts/deployments/base-sepolia-custom-pool-smoke-v1.json");
const hash = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex");
const j = existsSync(path)
  ? JSON.parse(readFileSync(path))
  : {
      kind: "base-sepolia-custom-pool-smoke-v1",
      chainId: 84532,
      deployer: account.address,
      recipeHash: hash,
      status: "running",
      contracts: {},
      transactions: {},
      values: {},
    };
assert.equal(j.recipeHash, hash);
assert.equal(j.chainId, 84532);
assert.equal(j.deployer, account.address);
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: path,
  manifest: j,
  nonce: 0,
  maxFeePerGas: 100000000n,
  spendLimit: parseEther("0.001"),
});
try {
  const options = await readPoolCreationOptions(client);
  const shield = options.protectedAssets.find((a) => a.symbol === "tWETH"),
    backing = options.backingAssets.find((a) => a.symbol === "vUSDC");
  assert(shield && backing);
  if (j.values.bond === undefined) {
    j.values.bond = String(backing.minimumBondAmount);
    run.save();
  }
  const params = {
    ...options.fixed,
    shieldedToken: shield.token,
    backingToken: backing.token,
    commissionRateBp: 700,
    poolFeeBp: 50,
    collateralRatioBp: 17500,
    creationBondAmount: BigInt(j.values.bond),
  };
  if (!j.pool) {
    const plan = await planIntent(
      client,
      account.address,
      { factory: CRYPTO_EXTENSION.factory, creationFactory: CRYPTO_EXTENSION.factory },
      { kind: "createPool", params },
    );
    // Stable keys are based on exact calls, so a resumed allowance change cannot duplicate creation.
    let receipt;
    for (const step of plan.steps) {
      await plan.beforeStep();
      receipt = await run.write(
        step.functionName === "createPool" ? "create:custom-pool" : `create:approve:${step.args[1]}`,
        step.address,
        step.functionName === "createPool" ? "SplitRiskPoolFactory" : "BaseSepoliaAlphaToken",
        step.functionName,
        step.args,
      );
    }
    j.pool = plan.extract(receipt).poolId;
    j.creationTx = receipt.transactionHash;
    j.terms = {
      juniorShareBps: 700,
      creatorFeeBps: 50,
      protocolFeeBps: 100,
      collateralRatioBps: 17500,
      creationBond: String(params.creationBondAmount),
      backingSymbol: backing.symbol,
    };
    run.save();
  }
  const pool = j.pool,
    amount = 5000n * 10n ** BigInt(backing.decimals);
  await run.write("junior:approve", backing.token, "BaseSepoliaAlphaToken", "approve", [pool, amount]);
  await run.write("junior:fund", pool, "SplitRiskPool", "depositBackingAsset", [backing.token, amount, amount]);
  const seniorAmount = 10n ** 17n;
  await run.write("senior:approve", shield.token, "BaseSepoliaAlphaToken", "approve", [pool, seniorAmount]);
  const receipt = await run.write("senior:deposit", pool, "SplitRiskPool", "depositShieldedAsset", [
    shield.token,
    seniorAmount,
    seniorAmount,
  ]);
  const event = parseEventLogs({
    abi: demoArtifact("SplitRiskPool").abi,
    logs: receipt.logs,
    eventName: "ShieldedAssetDeposited",
  }).find((log) => log.address.toLowerCase() === pool.toLowerCase());
  assert(event);
  await run.write("senior:asset-exit", pool, "SplitRiskPool", "shieldedWithdraw", [
    event.args.receiptTokenId,
    shield.token,
    (seniorAmount * 90n) / 100n,
  ]);
  const pools = await createReader(client, CRYPTO_EXTENSION).loadPools();
  const discovered = pools.find((p) => p.address.toLowerCase() === pool.toLowerCase());
  assert(discovered);
  assert.equal(discovered.stats.premiumRateBp, 700n);
  assert.equal(discovered.stats.poolFeeBp, 50n);
  assert.equal(discovered.stats.collateralRatioBp, 17500n);
  assert.equal(discovered.stats.protocolFeeBp, 100n);
  assert(discovered.availability.openPosition.state === "available");
  j.status = "complete";
  j.discovered = true;
  j.checkedAt = new Date().toISOString();
  run.save();
  console.log(
    JSON.stringify({
      status: j.status,
      pool: j.pool,
      creationTx: j.creationTx,
      terms: j.terms,
      confirmedTransactions: Object.keys(j.transactions).length,
      discovered: true,
    }),
  );
} finally {
  release();
}
