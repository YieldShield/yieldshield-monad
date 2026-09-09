#!/usr/bin/env node
/** Public Monad testnet evidence. Explicit broadcast only; resumes exact persisted transaction hashes. */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { createPublicClient, http, encodeFunctionData, parseAbi, parseEventLogs, parseEther, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  loadEnv,
  artifact,
  atomicJson,
  acquireDeploymentLock,
} from "./monad-deployment-lib.mjs";
import { fetchPythUpdate } from "../services/monad/pyth.mjs";
assert(process.argv.includes("--broadcast"), "Use --broadcast only after deployment verification");
assert(
  process.argv.slice(2).every((a) => ["--broadcast", "--reference"].includes(a)),
  "Unknown option",
);
const env = loadEnv(),
  dep = JSON.parse(readFileSync(resolve(ROOT, "contracts/deployments/monad-testnet.json"))),
  config = JSON.parse(readFileSync(resolve(ROOT, "config/monad.json")));
assert(["scenario-complete", "complete"].includes(dep.status), "Finish scenario deployment first");
const reference = process.argv.includes("--reference");
if (reference) {
  assert.equal(dep.referenceStatus, "active");
  assert(env.PYTH_API_KEY, "Authenticated Pyth access is required");
}
const proof = JSON.parse(readFileSync(resolve(ROOT, "docs/evidence/deployment-verification.json")));
assert(proof.scenarioReady && (!reference || proof.referenceReady), "Run deployment verification first");
const account = privateKeyToAccount(env.MONAD_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address, dep.deployer);
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(env.MONAD_RPC_URL || config.rpcUrl, { timeout: 20000, retryCount: 2 }),
  pollingInterval: 1000,
});
assert.equal(await client.getChainId(), 10143);
const path = resolve(ROOT, `contracts/deployments/monad-smoke-${reference ? "reference" : "scenario"}.json`);
const identity = createHash("sha256")
  .update(JSON.stringify({ contracts: dep.contracts, pools: dep.pools }))
  .digest("hex");
const journal = existsSync(path)
  ? JSON.parse(readFileSync(path))
  : { chainId: 10143, deploymentIdentity: identity, transactions: {}, calls: {}, observations: {}, status: "running" };
assert.equal(
  journal.deploymentIdentity,
  identity,
  "Deployment changed since this smoke run; review the previous journal",
);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.monad-deployment.lock"));
process.once("exit", release);
const run = new SequentialDeployment({
  client,
  account,
  broadcast: true,
  manifestPath: path,
  manifest: journal,
  nonce: await client.getTransactionCount({ address: account.address }),
  maxFeePerGas: 200000000000n,
  spendLimit: parseEther("3"),
});
const c = (n) => dep.contracts[n].address;
const read = (address, name, fn, args = [], blockNumber) =>
  client.readContract({ address, abi: artifact(name).abi, functionName: fn, args, blockNumber });
const erc20 = parseAbi(["function balanceOf(address) view returns(uint256)"]);
const balance = (token, blockNumber) =>
  client.readContract({ address: token, abi: erc20, functionName: "balanceOf", args: [account.address], blockNumber });
async function step(id, build) {
  if (!journal.calls[id]) {
    const s = await build();
    journal.calls[id] = {
      to: s.address,
      data: encodeFunctionData({ abi: s.abi || artifact(s.name).abi, functionName: s.fn, args: s.args || [] }),
      value: String(s.value || 0n),
    };
    run.save();
  }
  const s = journal.calls[id],
    r = await run.transaction(id, { ...s, value: BigInt(s.value) });
  return r;
}
const write = (id, address, name, fn, args = []) => step(id, () => ({ address, name, fn, args }));
async function gained(id, receipt, token, min = 1n) {
  const before = await balance(token, receipt.blockNumber - 1n),
    after = await balance(token, receipt.blockNumber),
    received = after - before;
  assert(received >= min, `${id}: recipient balance did not increase by its minimum`);
  journal.observations[id] = {
    token,
    before: String(before),
    after: String(after),
    received: String(received),
    txHash: receipt.transactionHash,
    blockNumber: String(receipt.blockNumber),
  };
  run.save();
  return received;
}
const mint = (r, nft) => {
  const events = parseEventLogs({
    abi: parseAbi(["event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)"]),
    logs: r.logs,
    eventName: "Transfer",
  }).filter(
    (e) =>
      e.address.toLowerCase() === nft.toLowerCase() &&
      e.args.from === zeroAddress &&
      e.args.to.toLowerCase() === account.address.toLowerCase(),
  );
  assert.equal(events.length, 1);
  return events[0].args.tokenId;
};
async function until(timestamp, label) {
  while (Number((await client.getBlock()).timestamp) < timestamp) {
    console.log(`Waiting for ${label}; on-chain deadline ${timestamp}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
const pythAbi = parseAbi([
  "function updatePriceFeeds(bytes[]) payable",
  "function getUpdateFee(bytes[]) view returns(uint256)",
]);
async function refresh() {
  const update = await fetchPythUpdate(env.PYTH_API_KEY, config.pyth.monUsdFeedId);
  const fee = await client.readContract({
    address: config.pyth.address,
    abi: pythAbi,
    functionName: "getUpdateFee",
    args: [update.updateData],
  });
  await step(`pyth:${update.price.publish_time}`, () => ({
    address: config.pyth.address,
    abi: pythAbi,
    fn: "updatePriceFeeds",
    args: [update.updateData],
    value: fee,
  }));
}
async function marketJourney(p) {
  const id = p.id,
    pool = p.address,
    seniorNft = await read(pool, "SplitRiskPool", "shieldReceiptNFT"),
    juniorNft = await read(pool, "SplitRiskPool", "protectorReceiptNFT");
  const shieldAmount = parseEther(p.symbol === "shMON" ? "0.01" : "0.1");
  const assetAmount = p.environment === "reference" && p.symbol === "WMON" ? parseEther("0.01") : shieldAmount;
  const backingName = p.backingSymbol === "vTestUSDC" ? "MonadYieldVault" : "MonadTestToken";
  const shieldAbi = parseAbi(["function approve(address,uint256) returns(bool)"]);
  if (p.environment === "reference") await refresh();
  await write(`${id}:junior-approve`, p.backingToken, backingName, "approve", [pool, 1000n * 10n ** 6n]);
  const jr = await write(`${id}:junior-deposit`, pool, "SplitRiskPool", "depositBackingAsset", [
    p.backingToken,
    1000n * 10n ** 6n,
    1000n * 10n ** 6n,
  ]);
  const junior = mint(jr, juniorNft);
  await step(`${id}:senior-approve`, () => ({
    address: p.shieldedToken,
    abi: shieldAbi,
    fn: "approve",
    args: [pool, assetAmount * 2n],
  }));
  if (p.environment === "reference") await refresh();
  const first = await write(`${id}:senior-deposit`, pool, "SplitRiskPool", "depositShieldedAsset", [
    p.shieldedToken,
    assetAmount,
    assetAmount,
  ]);
  let senior = mint(first, seniorNft);
  if (p.environment === "scenario") {
    const receipt = await write(`${id}:partial`, pool, "SplitRiskPool", "partialWithdrawShielded", [
      senior,
      parseEther("0.02"),
      p.shieldedToken,
      parseEther("0.02"),
    ]);
    await gained(`${id}:partial`, receipt, p.shieldedToken, parseEther("0.02"));
    senior = mint(receipt, seniorNft);
  }
  if (p.environment === "reference") await refresh();
  const exit = await write(`${id}:asset-exit`, pool, "SplitRiskPool", "shieldedWithdraw", [
    senior,
    p.shieldedToken,
    (assetAmount * 70n) / 100n,
  ]);
  await gained(`${id}:asset-exit`, exit, p.shieldedToken, (assetAmount * 70n) / 100n);
  if (p.environment === "reference") await refresh();
  const second = await write(`${id}:protected-deposit`, pool, "SplitRiskPool", "depositShieldedAsset", [
    p.shieldedToken,
    assetAmount,
    assetAmount,
  ]);
  const protectedId = mint(second, seniorNft);
  const depositBlock = await client.getBlock({ blockNumber: second.blockNumber });
  await until(Number(depositBlock.timestamp) + 60, `${id} protected exit`);
  if (p.environment === "reference") await refresh();
  const protect = await step(`${id}:backing-exit`, async () => {
    const pos = await read(seniorNft, "ShieldReceiptNFT", "getPosition", [protectedId]);
    const backing = dep.assets.find((a) => a.address.toLowerCase() === p.backingToken.toLowerCase());
    const oracleAbi = parseAbi(["function getPrice(address) view returns(uint256)"]);
    const price = await client.readContract({
      address: backing.feed,
      abi: oracleAbi,
      functionName: "getPrice",
      args: [backing.address],
    });
    let expected = (pos.valueAtDeposit * 10n ** 6n) / price;
    if (expected > pos.collateralAmount) expected = pos.collateralAmount;
    return {
      address: pool,
      name: "SplitRiskPool",
      fn: "shieldedWithdraw",
      args: [protectedId, p.backingToken, (expected * 995n) / 1000n || 1n],
    };
  });
  await gained(`${id}:backing-exit`, protect, p.backingToken);
  await write(`${id}:claim-junior`, pool, "SplitRiskPool", "claimCommission", [junior]);
  const notice = await write(`${id}:notice`, pool, "SplitRiskPool", "startUnlockProcess", [junior]);
  const noticeBlock = await client.getBlock({ blockNumber: notice.blockNumber });
  await until(Number(noticeBlock.timestamp) + 120, `${id} junior notice`);
  if (p.environment === "reference") await refresh();
  const withdrawal = await step(`${id}:junior-exit`, async () => {
    const n = await read(pool, "SplitRiskPool", "getAvailableForWithdrawal", [junior]);
    assert(n > 0n);
    return { address: pool, name: "SplitRiskPool", fn: "protectorWithdraw", args: [junior, n, p.backingToken, n] };
  });
  await gained(`${id}:junior-exit`, withdrawal, p.backingToken);
}
try {
  if (reference) {
    const wrapped = await step("native:wrap", () => ({
      address: c("WMON"),
      name: "MonadWrappedNative",
      fn: "deposit",
      value: parseEther("0.1"),
    }));
    await gained("native:wrap", wrapped, c("WMON"), parseEther("0.1"));
    const staked = await step("native:stake", () => ({
      address: c("StakingRouter"),
      name: "MonadStakingRouter",
      fn: "stake",
      args: [parseEther("0.025"), BigInt(Math.floor(Date.now() / 1000) + 600)],
      value: parseEther("0.4"),
    }));
    await gained("native:stake", staked, config.externalTokens.shMON, parseEther("0.025"));
  } else {
    await step("exchange:approve", () => ({
      address: c("TestUSDC"),
      name: "MonadTestToken",
      fn: "approve",
      args: [c("ScenarioExchange"), 100n * 10n ** 6n],
    }));
    const bought = await step("exchange:buy", () => ({
      address: c("ScenarioExchange"),
      name: "MonadAssetExchange",
      fn: "swap",
      args: [c("ScenarioMON"), true, parseEther("0.2"), 100n * 10n ** 6n, BigInt(Math.floor(Date.now() / 1000) + 600)],
    }));
    await gained("exchange:buy", bought, c("ScenarioMON"), parseEther("0.2"));
    await write("vault:approve", c("TestUSDC"), "MonadTestToken", "approve", [c("TestUSDVault"), 11n * 10n ** 6n]);
    const deposited = await write("vault:deposit", c("TestUSDVault"), "MonadYieldVault", "depositWithMin", [
      10n * 10n ** 6n,
      9800000n,
      account.address,
    ]);
    const shares = await gained("vault:deposit", deposited, c("TestUSDVault"), 9800000n);
    await write("vault:fund-yield", c("TestUSDVault"), "MonadYieldVault", "fundTestYield", [1000000n]);
    const redeemed = await write("vault:redeem", c("TestUSDVault"), "MonadYieldVault", "redeemWithMin", [
      shares,
      10n * 10n ** 6n,
      account.address,
    ]);
    await gained("vault:redeem", redeemed, c("TestUSDC"), 10n * 10n ** 6n);
  }
  for (const p of dep.pools.filter((p) => p.environment === (reference ? "reference" : "scenario")))
    await marketJourney(p);
  journal.status = "complete";
  journal.completedAt = new Date().toISOString();
  run.save();
  atomicJson(resolve(ROOT, `docs/evidence/${reference ? "reference" : "scenario"}-journey.json`), {
    chainId: 10143,
    account: account.address,
    completedAt: journal.completedAt,
    observations: journal.observations,
    transactions: Object.fromEntries(
      Object.entries(journal.transactions).map(([id, t]) => [
        id,
        { hash: t.hash, blockNumber: t.receipt?.blockNumber, status: t.status },
      ]),
    ),
  });
  console.log("Journey verified against confirmed recipient balance changes.");
} finally {
  release();
}
