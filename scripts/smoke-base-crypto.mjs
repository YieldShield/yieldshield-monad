#!/usr/bin/env node
/** Bounded, resumable tests of valueless assets on Base Sepolia. No mainnet path. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createPublicClient, http, fallback, parseEventLogs, parseEther, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { ROOT, SequentialDeployment, acquireDeploymentLock, atomicJson } from "./deploy-base-sepolia.mjs";
import { demoEnvironment, demoArtifact, DEPLOYER } from "./deploy-base-demo.mjs";
import { CRYPTO_PATH, CRYPTO_KIND, verifyCryptoDeployment } from "./deploy-base-crypto.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const path = resolve(ROOT, "contracts/deployments/base-sepolia-crypto-smoke-v1.json");
const m = JSON.parse(readFileSync(CRYPTO_PATH));
assert.equal(m.deploymentKind, CRYPTO_KIND);
assert.equal(m.status, "complete");
const broadcast = process.argv.includes("--broadcast");
assert(process.argv.slice(2).every((a) => ["--broadcast", "--prepare"].includes(a)));
if (!broadcast) {
  console.log(
    "Prepared: WETH/BTC buy and sell; both vault deposits/redemptions and funded yield; both senior exits across crypto, vault-share and stock/vault pairs; junior notice and withdrawal. Base Sepolia test assets only.",
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
const digest = sha(readFileSync(CRYPTO_PATH));
const recipeHash = sha(readFileSync(new URL(import.meta.url)));
const j = existsSync(path)
  ? JSON.parse(readFileSync(path))
  : {
      kind: "base-sepolia-crypto-smoke-v1",
      chainId: 84532,
      deployer: account.address,
      manifestDigest: digest,
      recipeHash,
      status: "running",
      contracts: {},
      transactions: {},
      values: {},
      positions: {},
      evidence: [],
    };
assert.equal(j.manifestDigest, digest);
assert.equal(j.recipeHash, recipeHash);
assert.equal(j.kind, "base-sepolia-crypto-smoke-v1");
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
  spendLimit: parseEther("0.003"),
});
const asset = (s) => {
  const a = m.assets.find((a) => a.symbol === s);
  assert(a);
  return a;
};
const c = (n) => m.contracts[n].address;
const read = (address, artifact, functionName, args = []) =>
  client.readContract({ address, abi: demoArtifact(artifact).abi, functionName, args });
const val = async (k, make) => {
  if (j.values[k] === undefined) {
    j.values[k] = String(await make());
    run.save();
  }
  return BigInt(j.values[k]);
};
const flow = (receipt, token) =>
  parseEventLogs({
    abi: erc20Abi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === token.toLowerCase()),
    eventName: "Transfer",
    strict: true,
  }).reduce((n, l) => n + (l.args.to.toLowerCase() === account.address.toLowerCase() ? l.args.value : 0n), 0n);
const evidence = (id, result) => {
  if (!j.evidence.some((e) => e.id === id)) {
    j.evidence.push({ id, ...result });
    run.save();
  }
};
async function position(id, pool, token, amount, junior = false) {
  await run.write(id.startsWith("tcbBTC:TestUSDC:") ? `${id}:approve:minimum-v2` : `${id}:approve`, token, "BaseSepoliaAlphaToken", "approve", [pool, amount]);
  const receipt = await run.write(id, pool, "SplitRiskPool", junior ? "depositBackingAsset" : "depositShieldedAsset", [
    token,
    amount,
    amount,
  ]);
  const event = junior ? "ProtectorAssetDeposited" : "ShieldedAssetDeposited";
  const logs = parseEventLogs({
    abi: demoArtifact("SplitRiskPool").abi,
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === pool.toLowerCase()),
    eventName: event,
    strict: true,
  });
  assert.equal(logs.length, 1);
  const tokenId = logs[0].args.receiptTokenId;
  j.positions[id] = {
    pool,
    tokenId: String(tokenId),
    blockTimestamp: String((await client.getBlock({ blockNumber: receipt.blockNumber })).timestamp),
  };
  run.save();
  return tokenId;
}
async function waitUntil(timestamp) {
  while (BigInt(Math.floor(Date.now() / 1000)) < timestamp) {
    await new Promise((r) =>
      setTimeout(r, Math.min(10000, Number(timestamp - BigInt(Math.floor(Date.now() / 1000))) * 1000)),
    );
  }
}
try {
  await verifyCryptoDeployment(
    client,
    m,
    JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/base-sepolia-demo-v1.json"))),
  );
  for (const symbol of ["tWETH", "tcbBTC"]) {
    const a = asset(symbol),
      amount = symbol === "tWETH" ? 10n ** 17n : 100000n;
    const limit = await val(`${symbol}:buy-limit`, async () => {
      const q = await read(c("AssetExchange"), "AlphaAssetExchange", "quote", [a.testToken, true, amount]);
      return (q[0] * 101n) / 100n;
    });
    const deadline = await val(`${symbol}:deadline`, async () => BigInt(Math.floor(Date.now() / 1000)) + 600n);
    await run.write(`${symbol}:buy-approve`, asset("TestUSDC").testToken, "BaseSepoliaAlphaToken", "approve", [
      c("AssetExchange"),
      limit,
    ]);
    const buy = await run.write(`${symbol}:buy`, c("AssetExchange"), "AlphaAssetExchange", "swap", [
      a.testToken,
      true,
      amount,
      limit,
      deadline,
    ]);
    assert.equal(flow(buy, a.testToken), amount);
    await run.write(`${symbol}:sell-approve`, a.testToken, "BaseSepoliaAlphaToken", "approve", [
      c("AssetExchange"),
      amount,
    ]);
    const sell = await run.write(`${symbol}:sell`, c("AssetExchange"), "AlphaAssetExchange", "swap", [
      a.testToken,
      false,
      amount,
      1n,
      deadline,
    ]);
    assert(flow(sell, asset("TestUSDC").testToken) > 0n);
    evidence(`${symbol}:trade`, { buy: buy.transactionHash, sell: sell.transactionHash, amount: String(amount) });
  }
  for (const v of m.vaults) {
    const amount = v.symbol === "vUSDC" ? 100n * 10n ** 6n : 10n ** 17n;
    await run.write(`${v.symbol}:deposit-approve`, v.underlying, "BaseSepoliaAlphaToken", "approve", [
      v.address,
      amount,
    ]);
    const min = await val(
      `${v.symbol}:deposit-min`,
      async () => ((await read(v.address, "AlphaYieldVault", "previewDeposit", [amount])) * 995n) / 1000n,
    );
    const receipt = await run.write(`${v.symbol}:deposit`, v.address, "AlphaYieldVault", "depositWithMin", [
      amount,
      min,
      account.address,
    ]);
    const shares = flow(receipt, v.address);
    assert(shares >= min);
    const before = await val(`${v.symbol}:rate-before`, () =>
      read(v.address, "AlphaYieldVault", "convertToAssets", [10n ** BigInt(v.decimals)]),
    );
    const contribution = v.symbol === "vUSDC" ? 100n * 10n ** 6n : 10n ** 18n;
    await run.write(`${v.symbol}:yield-approve`, v.underlying, "BaseSepoliaAlphaToken", "approve", [
      v.address,
      contribution,
    ]);
    await run.write(`${v.symbol}:fund-yield`, v.address, "AlphaYieldVault", "fundTestYield", [contribution]);
    const after = await read(v.address, "AlphaYieldVault", "convertToAssets", [10n ** BigInt(v.decimals)]);
    assert(after > before);
    const redeemed = await run.write(`${v.symbol}:redeem`, v.address, "AlphaYieldVault", "redeemWithMin", [
      shares,
      (amount * 995n) / 1000n,
      account.address,
    ]);
    assert(flow(redeemed, v.underlying) >= (amount * 995n) / 1000n);
    evidence(`${v.symbol}:vault`, {
      rateBefore: String(before),
      rateAfter: String(after),
      deposit: receipt.transactionHash,
      redeem: redeemed.transactionHash,
    });
  }
  const juniorPool = m.pools.find((p) => p.id === "tWETH:vUSDC");
  assert(juniorPool);
  const junior = await position("junior", juniorPool.address, asset("vUSDC").testToken, 100n * 10n ** 6n, true);
  const unlock = await run.write("junior:notice", juniorPool.address, "SplitRiskPool", "startUnlockProcess", [junior]);
  const unlockAt = BigInt((await client.getBlock({ blockNumber: unlock.blockNumber })).timestamp) + 120n;
  const cases = [
    ["tWETH:vUSDC", 10n ** 17n],
    ["tcbBTC:TestUSDC", 1000000n],
    ["vWETH:TestUSDC", 10n ** 17n],
    ["tAAPLc:vUSDC", 100000000n],
  ];
  for (const [id, amount] of cases) {
    const p = m.pools.find((p) => p.id === id);
    assert(p);
    await position(`${id}:return`, p.address, p.shieldedToken, amount);
    await position(`${id}:protected`, p.address, p.shieldedToken, amount);
  }
  for (const [id, amount] of cases) {
    const p = m.pools.find((p) => p.id === id),
      keep = j.positions[`${id}:return`],
      protectedPosition = j.positions[`${id}:protected`];
    const returned = await run.write(`${id}:return-exit`, p.address, "SplitRiskPool", "shieldedWithdraw", [
      BigInt(keep.tokenId),
      p.shieldedToken,
      (amount * 90n) / 100n,
    ]);
    assert(flow(returned, p.shieldedToken) >= (amount * 90n) / 100n);
    await waitUntil(BigInt(protectedPosition.blockTimestamp) + 62n);
    const paid = await run.write(`${id}:protected-exit`, p.address, "SplitRiskPool", "shieldedWithdraw", [
      BigInt(protectedPosition.tokenId),
      p.backingToken,
      1n,
    ]);
    assert(flow(paid, p.backingToken) > 0n);
    evidence(`${id}:senior`, {
      returnTx: returned.transactionHash,
      protectedTx: paid.transactionHash,
      payoutToken: p.backingToken,
      payoutAmount: String(flow(paid, p.backingToken)),
    });
  }
  await waitUntil(unlockAt + 2n);
  const juniorExit = await run.write("junior:withdraw", juniorPool.address, "SplitRiskPool", "protectorWithdraw", [
    junior,
    99n * 10n ** 6n,
    asset("vUSDC").testToken,
    98n * 10n ** 6n,
  ]);
  assert(flow(juniorExit, asset("vUSDC").testToken) >= 98n * 10n ** 6n);
  evidence("junior:lifecycle", {
    deposit: j.transactions.junior.hash,
    notice: unlock.transactionHash,
    withdraw: juniorExit.transactionHash,
  });
  j.status = "complete";
  j.completedAt = new Date().toISOString();
  run.save();
  console.log(
    `Verified ${j.evidence.length} internal crypto/vault lifecycle checks using ${Object.keys(j.transactions).length} confirmed test transactions.`,
  );
} catch (e) {
  console.error(String(e.shortMessage || e.message).replace(/https?:\/\/[^\s)]+/g, "<rpc>"));
  process.exitCode = 1;
} finally {
  release();
}
