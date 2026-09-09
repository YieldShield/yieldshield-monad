#!/usr/bin/env node
/** Read-only deployment cross-check. Never loads a private key, signs or broadcasts. */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAddress, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";

const SYMBOLS = ["tAAPLc", "tNVDAc", "tMETAc", "tGOOGLc"];
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const now = () => Math.floor(Date.now() / 1000);

async function readLiveStatus() {
  const response = await fetch("https://base.yieldshield.ai/api/protection-status", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  assert(response.ok, `Live protection status returned HTTP ${response.status}`);
  const status = await response.json();
  assert.equal(status.schemaVersion, 2, "The continuous demo is not published yet");
  assert.equal(status.chainId, 84532);
  assert.equal(status.deploymentKind, "base-sepolia-continuous-demo-v1");
  assert.equal(status.policy.kind, "continuous-demo");
  assert.equal(status.sourceChainId, null);
  assert.equal(status.deployment.status, "complete", "Pool deployment remains incomplete");
  assert.equal(status.deployment.verified, true);
  assert.equal(status.deployment.poolsReady, 4);
  assert.equal(status.session.state, "continuous");
  assert(status.evaluatedAt <= now() && now() < status.validUntil, "Live availability expired");
  return status;
}

export async function verifyJourney(owner) {
  owner = getAddress(owner);
  const [{ createEvmAdapter }, { planIntent }, { readFaucetStatus }, { DEMO_DEPLOYMENTS }] = await Promise.all([
    import("../packages/adapter-evm/dist/adapter.js"),
    import("../packages/adapter-evm/dist/intents.js"),
    import("../packages/adapter-evm/dist/faucet.js"),
    import("../packages/adapter-evm/dist/demo-deployments.js"),
  ]);
  const adapter = createEvmAdapter({ chain: baseSepolia });
  const demo = DEMO_DEPLOYMENTS[84532];
  assert(demo, "Build packages after publishing the independently verified demo addresses");
  assert.equal(await adapter.publicClient.getChainId(), 84532);
  const status = await readLiveStatus();
  assert(same(status.faucet.address, adapter.addresses.faucet), "API and app use different faucets");
  assert(same(status.exchange.address, demo.exchange), "API and app use different demo exchanges");
  assert.equal(status.faucet.ready, true);
  const [pools, balances, nativeBalance, faucet] = await Promise.all([
    adapter.reader.loadPools(),
    adapter.reader.getBalances(owner),
    adapter.publicClient.getBalance({ address: owner }),
    readFaucetStatus(adapter.publicClient, adapter.addresses.faucet, owner, [
      ...demo.assets.map((asset) => asset.token),
      demo.quoteToken,
    ]),
  ]);
  assert(nativeBalance > 0n, "The selected wallet needs Base Sepolia test ETH");
  assert.equal(pools.length, 4, "The app reader must discover all four published pools");
  assert.equal(faucet.chainId, 84532);
  assert(same(faucet.address, adapter.addresses.faucet) && same(faucet.recipient, owner));
  assert(faucet.configured && faucet.tokens.length === 5, "The current faucet inventory is incomplete");
  const quoteBalance = balances.find((balance) => same(balance.token.token, demo.quoteToken));
  assert(quoteBalance && quoteBalance.amount > 0n, "Wallet lacks current demo TestUSDC");
  assert(
    status.faucet.tokens.some((token) => same(token.address, demo.quoteToken)),
    "API faucet lacks current TestUSDC",
  );
  const verified = [];
  for (const symbol of SYMBOLS) {
    const pool = pools.find((p) => p.shielded.symbol === symbol);
    const publicAsset = status.assets.find((a) => a.symbol === symbol);
    const token = demo.assets.find((a) => a.symbol === symbol);
    assert(pool && publicAsset && token, `${symbol}: missing from a deployment surface`);
    assert.equal(pool.shielded.decimals, 8);
    assert.equal(pool.backing.decimals, 6);
    assert(same(pool.shielded.token, token.token), `${symbol}: wrong pool token version`);
    assert(same(pool.backing.token, demo.quoteToken), `${symbol}: wrong backing token version`);
    assert(same(publicAsset.faucet.address, token.token), `${symbol}: faucet and pool token mismatch`);
    assert(
      faucet.tokens.some((t) => same(t.address, token.token)),
      `${symbol}: missing from onchain faucet`,
    );
    assert.equal(publicAsset.actions.openPosition.state, "available", `${symbol}: API blocks opening`);
    assert.equal(pool.availability?.openPosition.state, "available", `${symbol}: adapter blocks opening`);
    const balance = balances.find((b) => same(b.token.token, token.token));
    assert(balance && balance.amount >= 10n ** 8n, `${symbol}: wallet lacks one CURRENT demo token`);
    assert(pool.availability.maxShieldedDeposit >= 10n ** 8n, `${symbol}: insufficient collateral capacity`);
    assert.equal(pool.stats.minimumPoolTime, 60n, `${symbol}: unexpected demo exit delay`);
    assert.equal(pool.stats.unlockDuration, 120n, `${symbol}: unexpected collateral notice`);
    assert.equal(pool.stats.minimumPoolTime, BigInt(publicAsset.pool.terms.protectedExitDelaySeconds));
    verified.push({
      symbol,
      token: token.token,
      pool: pool.address,
      walletBalance: formatUnits(balance.amount, balance.token.decimals),
      protectedExitDelaySeconds: Number(pool.stats.minimumPoolTime),
    });
  }
  const apple = pools.find((p) => p.shielded.symbol === "tAAPLc");
  const amount = 10n ** 8n,
    minimum = (amount * 9950n) / 10000n;
  const plan = await planIntent(adapter.publicClient, owner, adapter.addresses, {
    kind: "depositShielded",
    pool: apple.address,
    shieldedToken: apple.shielded.token,
    backingToken: apple.backing.token,
    amount,
    minReceived: minimum,
  });
  const deposit = plan.steps.at(-1);
  assert(same(deposit.address, apple.address));
  assert.equal(deposit.functionName, "depositShieldedAsset");
  assert.deepEqual(deposit.args, [apple.shielded.token, amount, minimum]);
  for (const approval of plan.steps.slice(0, -1)) {
    assert(same(approval.address, apple.shielded.token) && approval.functionName === "approve");
    assert(same(approval.args[0], apple.address));
    assert(approval.args[1] === 0n || approval.args[1] === amount, "Unexpected spending approval amount");
  }
  await plan.beforeStep?.();
  return {
    verifiedAt: new Date().toISOString(),
    chainId: 84532,
    owner,
    kind: "read-only-live-protection-preflight",
    checks: [
      "published identities agree",
      "four funded pools available",
      "current tokens held by wallet",
      "test ETH available",
      "current faucet inventory matches pools",
      "one-token deposit preflight passed",
      "approval targets and amounts checked",
    ],
    faucet: adapter.addresses.faucet,
    factory: adapter.addresses.factory,
    nativeBalance: formatUnits(nativeBalance, 18),
    quoteToken: demo.quoteToken,
    quoteBalance: formatUnits(quoteBalance.amount, quoteBalance.token.decimals),
    assets: verified,
    depositSteps: plan.steps.map((s) => ({ target: s.address, action: s.functionName })),
    note: "Read-only evidence: this check does not prove a signed deposit or withdrawal. Verify their confirmed transaction receipts separately.",
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      "Usage: node scripts/verify-base-protection-journey.mjs --owner 0xAddress\nRead-only live API, current token balances and app deposit preflight. Requires built packages. No secrets or transactions.",
    );
  } else {
    try {
      assert(args.length === 2 && args[0] === "--owner", "Unknown arguments; use --help");
      console.log(JSON.stringify(await verifyJourney(args[1]), null, 2));
    } catch (error) {
      console.error(`Protection journey check failed: ${error.shortMessage ?? error.message}`);
      process.exitCode = 1;
    }
  }
}
