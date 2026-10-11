import test from "node:test";
import assert from "node:assert/strict";
import { encodeAbiParameters, encodeEventTopics, zeroAddress } from "viem";
import {
  KURU,
  kuruMarketAbi,
  isKuruTarget,
  verifyKuruTarget,
  readKuruAccount,
  validateKuruInput,
  buildKuruSwapRequest,
  confirmedKuruSwap,
  KURU_LEGACY,
  buildKuruDepositRequest,
  buildKuruWithdrawalRequest,
  buildLegacyKuruWithdrawalRequest,
  kuruRoundingLimit,
  validateKuruFill,
} from "./kuru-contracts.mjs";
const account = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const now = 1789570000000;
const quote = {
  chainId: 10143,
  market: KURU.market,
  account,
  userId: 7n,
  amountIn: 10000000n,
  amountInUsed: 10000000n,
  inputRoundingLimit: 101n,
  amountOut: 200n * 10n ** 18n,
  minAmountOut: 199n * 10n ** 18n,
  quotedAt: now,
  expiresAt: now + 60000,
  blockNumber: 1n,
  timestamp: BigInt(now / 1000),
};
const request = (overrides = {}, selected = account, id = 7n, time = now) =>
  buildKuruSwapRequest({ ...quote, ...overrides }, selected, id, time);
test("funding is restricted to the canonical testnet contracts", async () => {
  assert.equal(isKuruTarget(KURU.account.toLowerCase()), true);
  assert.equal(isKuruTarget(other), false);
  await assert.rejects(verifyKuruTarget({ getChainId: async () => 143 }, KURU.account), /testnet/);
  await assert.rejects(verifyKuruTarget({ getChainId: async () => 10143 }, other), /Unrecognized/);
  await assert.rejects(
    verifyKuruTarget({ getChainId: async () => 10143, getCode: async () => "0x6000" }, KURU.account),
    /changed/,
  );
});
test("only bounded whole raw Kuru USDC inputs are accepted", () => {
  assert.equal(validateKuruInput(10000000n), 10000000n);
  assert.equal(validateKuruInput(100000000n), 100000000n);
  for (const input of [0n, -1n, 9999999n, 100000001n, 10000000, "10000000"])
    assert.throws(() => validateKuruInput(input), /10–100/);
});
test("request cannot redirect assets, add builder fees, or remove output/deadline bounds", () => {
  const result = request();
  assert.equal(result.address, KURU.market);
  assert.equal(result.functionName, "swap");
  assert.deepEqual(result.args, [7, true, 10000000n, 199n * 10n ** 18n, BigInt((now + 60000) / 1000)]);
  assert.equal(result.value, undefined);
});
test("changed wallet, user ID, market and chain invalidate a quote", () => {
  for (const change of [{ chainId: 143 }, { market: other }, { account: other }, { userId: 8n }])
    assert.throws(() => request(change), /changed/);
  assert.throws(() => request({}, other), /changed/);
  for (const id of [0n, 8n, 2n ** 40n]) assert.throws(() => request({}, account, id), /changed/);
  assert.throws(() => request({}, zeroAddress), /wallet/);
});
test("expired, future, and extended quotes cannot be signed", () => {
  assert.throws(() => request({}, account, 7n, now + 60000), /expired/);
  assert.throws(() => request({}, account, 7n, now - 1), /expired/);
  assert.throws(() => request({ expiresAt: now + 60001 }), /expired/);
  assert.throws(() => request({ quotedAt: NaN }), /expired/);
});
test("slippage cannot be silently widened or set to zero", () => {
  for (const change of [
    { minAmountOut: 0n },
    { minAmountOut: 198n * 10n ** 18n },
    { amountOut: 2n ** 128n },
    { amountOut: 0n },
  ])
    assert.throws(() => request(change), /slippage|fill/);
});
function swapLog(overrides = {}) {
  const args = {
    userId: 7,
    executor: account,
    isBuy: true,
    amountInUsed: 10000000n,
    amountOut: 200n * 10n ** 18n,
    minAmountOut: quote.minAmountOut,
    ...overrides,
  };
  return {
    address: KURU.market,
    topics: encodeEventTopics({ abi: kuruMarketAbi, eventName: "SpotSwap", args }),
    data: encodeAbiParameters(
      [{ type: "uint128" }, { type: "uint128" }, { type: "uint128" }],
      [args.amountInUsed, args.amountOut, args.minAmountOut],
    ),
  };
}
test("settlement proof requires the successful canonical market event", () => {
  const receipt = { status: "success", logs: [swapLog()] };
  assert.equal(confirmedKuruSwap(receipt, quote, account).amountOut, quote.amountOut);
  assert.throws(() => confirmedKuruSwap({ ...receipt, status: "reverted" }, quote, account), /succeed/);
  assert.throws(
    () => confirmedKuruSwap({ ...receipt, logs: [{ ...swapLog(), address: other }] }, quote, account),
    /verified/,
  );
  assert.throws(() => confirmedKuruSwap({ ...receipt, logs: [swapLog(), swapLog()] }, quote, account), /verified/);
});
test("wrong recipient account, executor, side, fill or limit fails receipt verification", () => {
  for (const change of [
    { userId: 8 },
    { executor: other },
    { isBuy: false },
    { amountInUsed: 9999000n },
    { minAmountOut: 1n },
    { amountOut: quote.minAmountOut - 1n },
  ])
    assert.throws(() => confirmedKuruSwap({ status: "success", logs: [swapLog(change)] }, quote, account), /match/);
});

test("one executable lot bounds input rounding without accepting material partial fills", () => {
  // Current MON precision: one base lot = 10^-6 MON. At 100 USDC/MON,
  // its quote quantum is 100 atoms plus at most one atom of taker fee.
  const limit = kuruRoundingLimit(100000000, 7000n, 10000000n);
  assert.equal(limit, 101n);
  assert.doesNotThrow(() => validateKuruFill(10000000n, 9999996n, 99930000000000000n, limit));
  assert.throws(() => validateKuruFill(20000000n, 10007000n, 100000000000000000n, limit), /fill/);
  for (const used of [0n, 9999899n, 10000001n])
    assert.throws(() => validateKuruFill(10000000n, used, quote.amountOut, limit), /fill/);
  assert.throws(() => kuruRoundingLimit(0, 7000n, 10000000n), /ask/);
  assert.ok(kuruRoundingLimit(4294967295, 7000n, 10000000n) <= 1000n);
});

test("settlement respects the signed input/output bounds and hard remainder cap", () => {
  assert.equal(
    confirmedKuruSwap({ status: "success", logs: [swapLog({ amountInUsed: 9999996n })] }, quote, account).amountInUsed,
    9999996n,
  );
  assert.throws(
    () => confirmedKuruSwap({ status: "success", logs: [swapLog({ amountInUsed: 10000001n })] }, quote, account),
    /match/,
  );
});

test("a higher execution price within slippage may leave more dust than the quote-time lot cost", () => {
  // Quote at 100 USDC/MON, execute at 100.3 (+0.3%) with the 7 bp taker fee.
  // Both fills are valid size increments. Execution leaves 101 atoms rather
  // than the quoted 94, meeting the output minimum but exceeding the old check.
  const reviewed = {
    ...quote,
    amountIn: 10001290n,
    amountInUsed: 10001196n,
    amountOut: 99942000000000000n,
    minAmountOut: 99442290000000000n,
  };
  const executed = { amountInUsed: 10001189n, amountOut: 99643000000000000n };
  assert.doesNotThrow(() => buildKuruSwapRequest(reviewed, account, 7n, now));
  assert.equal(reviewed.amountIn - executed.amountInUsed, reviewed.inputRoundingLimit);
  const receipt = { status: "success", logs: [swapLog({ ...executed, minAmountOut: reviewed.minAmountOut })] };
  assert.deepEqual(confirmedKuruSwap(receipt, reviewed, account), executed);
});

test("meeting minimum output does not permit material partial input consumption", () => {
  for (const remaining of [1000n, 10000n, 1000000n]) {
    const receipt = { status: "success", logs: [swapLog({ amountInUsed: quote.amountIn - remaining })] };
    assert.throws(() => confirmedKuruSwap(receipt, quote, account), /match/);
    assert.throws(() => confirmedKuruSwap(receipt, { ...quote, inputRoundingLimit: 10000000n }, account), /match/);
  }
});
const mockAccountClient = (reverse = account, id = 7, rootId = id) => ({
  getChainId: async () => 10143,
  readContract: async ({ functionName, args }) => {
    if (functionName === "rootAccountIdOf") return id;
    if (functionName === "getAccountOwner") return reverse;
    if (functionName === "getAccountRootId") return rootId;
    if (functionName === "balanceOf") return 33n;
    if (functionName === "getBalance") {
      assert.equal(args[0], id, "balances must use the root ID, never the wallet address");
      assert.notEqual(id, 0, "unregistered users have no custody balance to query");
      return args[1] === KURU.native ? 22n : 11n;
    }
    throw new Error("Unexpected contract read");
  },
});
test("free balances retain custody location and require reverse account ownership", async () => {
  assert.deepEqual(await readKuruAccount(mockAccountClient(), account), {
    account,
    userId: 7n,
    usdc: 11n,
    mon: 22n,
    walletUsdc: 33n,
  });
  await assert.rejects(readKuruAccount(mockAccountClient(other), account), /ownership/);
  await assert.rejects(readKuruAccount(mockAccountClient(account, 7, 6), account), /root account/);
  assert.deepEqual(await readKuruAccount(mockAccountClient(zeroAddress, 0), account), {
    account,
    userId: 0n,
    usdc: 0n,
    mon: 0n,
    walletUsdc: 33n,
  });
  await assert.rejects(readKuruAccount({ getChainId: async () => 143 }, account), /testnet/);
});

test("current deposits name the root owner and current token explicitly", () => {
  const request = buildKuruDepositRequest(account, 10000000n);
  assert.equal(request.address, KURU.account);
  assert.deepEqual(request.args, [account, KURU.usdc, 10000000n]);
  assert.notEqual(KURU.usdc, KURU_LEGACY.usdc);
  assert.notEqual(KURU.account, KURU_LEGACY.account);
  for (const amount of [0n, -1n, KURU.maxInput + 1n])
    assert.throws(() => buildKuruDepositRequest(account, amount), /amount/);
});

test("current withdrawals use the verified root ID and pay the same wallet", () => {
  const state = { account, userId: 7n, usdc: 10000000n, mon: 10n ** 18n, walletUsdc: 0n };
  assert.deepEqual(buildKuruWithdrawalRequest(state, KURU.native, 1n).args, [7, KURU.native, 1n, account]);
  assert.throws(() => buildKuruWithdrawalRequest(state, KURU_LEGACY.usdc, 1n), /balance/);
  assert.throws(() => buildKuruWithdrawalRequest(state, KURU.usdc, state.usdc + 1n), /balance/);
  assert.throws(() => buildKuruWithdrawalRequest({ ...state, userId: 0n }, KURU.usdc, 1n), /balance/);
});

test("legacy recovery keeps its old target and token without enabling new legacy deposits", () => {
  const state = { account, usdc: 10n, mon: 20n };
  const request = buildLegacyKuruWithdrawalRequest(state, KURU_LEGACY.usdc, 10n);
  assert.equal(request.address, KURU_LEGACY.account);
  assert.equal(request.functionName, "withdraw");
  assert.deepEqual(request.args, [KURU_LEGACY.usdc, 10n]);
  assert.throws(() => buildLegacyKuruWithdrawalRequest(state, KURU.usdc, 1n), /balance/);
  assert.throws(() => buildLegacyKuruWithdrawalRequest(state, KURU.native, 21n), /balance/);
  assert.equal(isKuruTarget(KURU_LEGACY.account), true);
  assert.equal(isKuruTarget(KURU_LEGACY.usdc), false);
});
