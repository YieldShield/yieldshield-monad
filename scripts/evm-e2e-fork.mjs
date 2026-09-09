/**
 * End-to-end QA of every EVM tx intent against a LOCAL FORK of Robinhood testnet.
 *
 * Requires anvil (Foundry). Start the fork, impersonate the seeded deployer (who holds test
 * tokens), then drive each `TxIntent` through the adapter's real `planIntent` — approvals,
 * protocol calls, receipt extraction — and assert the reader's views update. Time-warps cover
 * the protected-exit gate and the protector notice period; mock Chainlink feeds are re-pinned
 * after each warp so prices don't go stale.
 *
 *   anvil --fork-url https://rpc.testnet.chain.robinhood.com --port 8545 --silent &
 *   node scripts/evm-e2e-fork.mjs
 */
import { createTestClient, createWalletClient, http } from "viem";
import { minReceived, toBaseUnits } from "@yieldshield/core";
import { createEvmAdapter, planIntent, robinhoodTestnet } from "@yieldshield/adapter-evm";

const RPC = process.env.FORK_RPC ?? "http://127.0.0.1:8545";
const OWNER = "0x508e98C391fFb0a11af2F23A311E8CB324f52A20"; // testnet seed deployer (tokens + positions)

// Mock Chainlink aggregators from smart-contracts/deployments/46630.json (2026-07-10 redeploy) —
// re-pinned after warps.
const MOCK_FEEDS = [
  "0x264E49fF51c763eb1226136De585bd8f10D7A90f", // USDG
  "0x7A1b58f9338886169AB3eC53bF042458bC0897C4", // WETH
  "0xb10b3Dd440A0aE22152de0cF8b73ED02EEbB5Af9", // SGOV
  "0xEDf08f770135db33cEC87f00E415c2ae39A3A885", // SPY
  "0xEe5785e51D7e8A4438Dc029A3C642BaC2D558bC4", // QQQ
  "0xCEDdb0b2E34D3d332F347fe76FC5efcb9Df5ae03", // TSLA
  "0xa7c2Ff0c7729870dF6ED2f74f3aF0DE31883a222", // AMZN
  "0xD7F92C03c07Addea25C2e3B5f97f523a52fC6ce1", // PLTR
  "0x82f506B8Df120344cB69aF781dFDE2128447687A", // NFLX
  "0x3d5aEd8e523eec8Fd3A45e1D80096A8EEFC88282", // AMD
];
const AGGREGATOR_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }],
  },
  { type: "function", name: "setAnswer", stateMutability: "nonpayable", inputs: [{ type: "int256" }], outputs: [] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const adapter = createEvmAdapter({ chain: robinhoodTestnet, rpcUrl: RPC, label: "Robinhood" });
const pub = adapter.publicClient;
const testClient = createTestClient({ chain: robinhoodTestnet, mode: "anvil", transport: http(RPC) });
const wallet = createWalletClient({ chain: robinhoodTestnet, transport: http(RPC) });

let passed = 0;
let failed = 0;
const check = (cond, label) => {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}`);
  }
};

async function sendAs(from, step) {
  // Simulate first so reverts surface with their reason (anvil otherwise fills gas with the
  // fork's huge block limit and fails on balance instead).
  await pub.simulateContract({
    address: step.address,
    abi: step.abi,
    functionName: step.functionName,
    args: step.args,
    account: from,
  });
  const hash = await wallet.writeContract({
    address: step.address,
    abi: step.abi,
    functionName: step.functionName,
    args: step.args,
    account: from,
    chain: robinhoodTestnet,
    gas: 15_000_000n,
  });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`step "${step.label ?? step.functionName}" reverted (${hash})`);
  return receipt;
}

/** Execute a TxIntent exactly like useIntentSender does: plan → steps → extract from final receipt. */
async function exec(intent, from = OWNER) {
  const deps = { factory: adapter.addresses.factory, faucet: adapter.addresses.faucet };
  const plan = await planIntent(pub, from, deps, intent);
  let last = null;
  for (const step of plan.steps) {
    last = await sendAs(from, step);
    console.log(`    · ${step.label}`);
  }
  return { receipt: last, ...(plan.extract?.(last) ?? {}) };
}

/** Advance chain time, then re-pin every mock feed so Chainlink prices stay fresh. */
async function warp(seconds) {
  await testClient.increaseTime({ seconds: Number(seconds) });
  await testClient.mine({ blocks: 1 });
  for (const feed of MOCK_FEEDS) {
    const feedOwner = await pub.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "owner" });
    await testClient.impersonateAccount({ address: feedOwner });
    const [, answer] = await pub.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "latestRoundData" });
    await sendAs(feedOwner, {
      address: feed,
      abi: AGGREGATOR_ABI,
      functionName: "setAnswer",
      args: [answer],
      label: "re-pin feed",
    });
  }
  console.log(`  (warped ${seconds}s, feeds re-pinned)`);
}

// --- setup -------------------------------------------------------------------
await testClient.impersonateAccount({ address: OWNER });
await testClient.setBalance({ address: OWNER, value: 10n ** 27n });

const pools = await adapter.reader.loadPools();
const sgov = pools.find((p) => p.shielded.symbol === "SGOV");
if (!sgov) throw new Error("SGOV pool not found on fork");
const positions0 = await adapter.reader.getOwnerPositions(OWNER);
console.log(
  `fork ready: ${pools.length} pools; owner has ${positions0.shield.length} shield / ${positions0.protector.length} protector positions\n`,
);

// --- 1. depositShielded --------------------------------------------------------
console.log("1. depositShielded (5 SGOV)");
const depAmount = toBaseUnits("5", sgov.shielded.decimals);
const r1 = await exec({
  kind: "depositShielded",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  backingToken: sgov.backing.token,
  amount: depAmount,
  minReceived: minReceived(depAmount),
});
check(!!r1.positionId, `positionId extracted from receipt (${r1.positionId})`);
let after = await adapter.reader.getOwnerPositions(OWNER);
const created = after.shield.find((s) => s.id === r1.positionId);
check(!!created && created.deposited === depAmount, "reader shows the new shield position with the deposited amount");

// --- 2. partialWithdrawShielded ------------------------------------------------
console.log("2. partialWithdrawShielded (2 SGOV)");
const partAmount = toBaseUnits("2", sgov.shielded.decimals);
const r2 = await exec({
  kind: "partialWithdrawShielded",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  position: r1.positionId,
  amount: partAmount,
  minOut: minReceived(partAmount),
});
check(!!r2.positionId && r2.positionId !== r1.positionId, `remainder re-minted as a NEW position (${r2.positionId})`);
after = await adapter.reader.getOwnerPositions(OWNER);
const remainder = after.shield.find((s) => s.id === r2.positionId);
check(!!remainder && remainder.deposited === depAmount - partAmount, "reader shows the remainder position (3 SGOV)");
check(!after.shield.some((s) => s.id === r1.positionId), "old position id is gone");

// --- 3. withdrawShielded (full, same-asset) -------------------------------------
console.log("3. withdrawShielded (full exit of the remainder)");
await exec({
  kind: "withdrawShielded",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  position: r2.positionId,
  minOut: minReceived(remainder.deposited),
});
after = await adapter.reader.getOwnerPositions(OWNER);
check(!after.shield.some((s) => s.id === r2.positionId), "position closed and gone from the reader");

// --- 4. depositBacking -----------------------------------------------------------
console.log("4. depositBacking (100 USDG)");
const backAmount = toBaseUnits("100", sgov.backing.decimals);
const r4 = await exec({
  kind: "depositBacking",
  pool: sgov.address,
  backingToken: sgov.backing.token,
  amount: backAmount,
  minReceived: minReceived(backAmount),
});
check(!!r4.positionId, `protector positionId extracted (${r4.positionId})`);
after = await adapter.reader.getOwnerPositions(OWNER);
const prot = after.protector.find((s) => s.id === r4.positionId);
check(!!prot && prot.collateral === backAmount, "reader shows the new protector position");

// --- 5. claimCommission -----------------------------------------------------------
console.log("5. claimCommission (may be zero — must not revert)");
await exec({
  kind: "claimCommission",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  position: r4.positionId,
});
check(true, "claimCommission succeeded");

// --- 6. startUnlock / cancelUnlock -------------------------------------------------
console.log("6. startUnlock → cancelUnlock → startUnlock");
await exec({ kind: "startUnlock", position: r4.positionId });
after = await adapter.reader.getOwnerPositions(OWNER);
check(after.protector.find((s) => s.id === r4.positionId)?.isUnlocking === true, "reader shows notice started");
await exec({ kind: "cancelUnlock", position: r4.positionId });
after = await adapter.reader.getOwnerPositions(OWNER);
check(after.protector.find((s) => s.id === r4.positionId)?.isUnlocking === false, "reader shows notice cancelled");
await exec({ kind: "startUnlock", position: r4.positionId });

// --- 7. warp past the notice, then withdraw protector ------------------------------
console.log("7. warp unlockDuration, partial + full protectorWithdraw");
await warp(sgov.stats.unlockDuration + 60n);
const partBack = toBaseUnits("40", sgov.backing.decimals);
await exec({
  kind: "partialWithdrawProtector",
  pool: sgov.address,
  backingToken: sgov.backing.token,
  position: r4.positionId,
  amount: partBack,
  minOut: minReceived((partBack * 9n) / 10n),
});
after = await adapter.reader.getOwnerPositions(OWNER);
const protAfter = after.protector.find((s) => s.id === r4.positionId);
check(!!protAfter && protAfter.collateral < backAmount, "reader shows reduced collateral after partial withdraw");
if (!protAfter.isUnlocking) {
  // Partial withdrawal consumed the notice — start a fresh one for the full exit.
  console.log("  (partial withdrawal reset the notice — starting a new one)");
  await exec({ kind: "startUnlock", position: r4.positionId });
  await warp(sgov.stats.unlockDuration + 60n);
}
await exec({
  kind: "withdrawProtector",
  pool: sgov.address,
  backingToken: sgov.backing.token,
  position: r4.positionId,
  minOut: minReceived((protAfter.collateral * 9n) / 10n),
});
after = await adapter.reader.getOwnerPositions(OWNER);
check(!after.protector.some((s) => s.id === r4.positionId), "protector position closed after full withdraw");

// --- 8. activateShielded (protected exit to backing) --------------------------------
console.log("8. depositShielded then activate after minimumPoolTime");
const r8 = await exec({
  kind: "depositShielded",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  backingToken: sgov.backing.token,
  amount: depAmount,
  minReceived: minReceived(depAmount),
});
await warp(sgov.stats.minimumPoolTime + 60n);
after = await adapter.reader.getOwnerPositions(OWNER);
const toActivate = after.shield.find((s) => s.id === r8.positionId);
// `protectedExitUnlocked` is computed against WALL-CLOCK time (correct in production, where
// chain time ≈ wall time); on a warped fork chain time runs ~2 months ahead, so assert against
// the fork's block timestamp instead.
const chainNow = (await pub.getBlock()).timestamp;
check(chainNow >= toActivate.protectedExitUnlockTime, "protected exit unlocked (vs fork chain time)");
const estBacking = (toActivate.valueAtDepositUsd * 10n ** BigInt(sgov.backing.decimals)) / 10n ** 8n;
const capped = estBacking < toActivate.collateralAmount ? estBacking : toActivate.collateralAmount;
await exec({
  kind: "activateShielded",
  pool: sgov.address,
  shieldedToken: sgov.shielded.token,
  backingToken: sgov.backing.token,
  position: r8.positionId,
  minOut: minReceived((capped * 9n) / 10n),
});
after = await adapter.reader.getOwnerPositions(OWNER);
check(!after.shield.some((s) => s.id === r8.positionId), "activated position closed (paid out in backing)");

// --- 9. claimRewards -----------------------------------------------------------------
console.log("9. claimRewards on a pre-seeded shield position (must not revert)");
const seeded = after.shield.find((s) => s.pool === sgov.address);
if (seeded) {
  await exec({ kind: "claimRewards", pool: sgov.address, shieldedToken: sgov.shielded.token, position: seeded.id });
  check(true, "claimRewards succeeded");
} else {
  console.log("  (no remaining shield position in SGOV pool — skipped)");
}

// --- 10. createPool --------------------------------------------------------------------
console.log("10. createPool (TSLA/WETH, 1 WETH bond)");
try {
  const tsla = pools.find((p) => p.shielded.symbol === "TSLA");
  const weth = pools.find((p) => p.backing.symbol === "WETH")?.backing ?? null;
  const wethToken = weth?.token ?? pools.find((p) => p.shielded.symbol === "USDG")?.shielded.token;
  const r10 = await exec({
    kind: "createPool",
    params: {
      shieldedToken: tsla.shielded.token,
      backingToken: wethToken,
      collateralRatioBp: 30_000,
      commissionRateBp: 500,
      poolFeeBp: 200,
      protocolFeeBp: 0,
      maxTvlUsd: 0n,
      minimumPoolTime: 0,
      unlockDuration: 0,
      shieldTransferLock: 0,
      protectorTransferLock: 0,
      creationBondAmount: toBaseUnits("1", 18),
    },
  });
  check(!!r10.poolId, `poolId extracted from PoolCreated (${r10.poolId})`);
} catch (e) {
  failed++;
  console.log(`  ✗ createPool failed: ${e.shortMessage ?? e.message}`);
}

// --- 11. faucetDrip as a brand-new user --------------------------------------------------
console.log("11. faucetDrip for a fresh address (on-chain ConfigurableTokenFaucet)");
const FRESH = "0x1111111111111111111111111111111111111111";
await testClient.impersonateAccount({ address: FRESH });
await testClient.setBalance({ address: FRESH, value: 10n ** 20n });
const before = await adapter.reader.getBalances(FRESH);
await exec({ kind: "faucetDrip" }, FRESH);
const afterDrip = await adapter.reader.getBalances(FRESH);
const gained = afterDrip.filter((b, i) => b.amount > (before[i]?.amount ?? 0n));
check(gained.length > 0, `fresh wallet received ${gained.map((g) => g.token.symbol).join(", ") || "nothing"}`);

console.log(`\ndone: ${passed} passed, ${failed} failed`);
process.exitCode = failed > 0 ? 1 : 0;
