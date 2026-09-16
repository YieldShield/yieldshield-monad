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
    assert.throws(() => request(change), /slippage/);
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
    { amountInUsed: 9999999n },
    { minAmountOut: 1n },
    { amountOut: quote.minAmountOut - 1n },
  ])
    assert.throws(() => confirmedKuruSwap({ status: "success", logs: [swapLog(change)] }, quote, account), /match/);
});
const mockAccountClient = (reverse = account, id = 7) => ({
  getChainId: async () => 10143,
  readContract: async ({ functionName, args }) => {
    if (functionName === "userRegistry") return id;
    if (functionName === "userAddressById") return reverse;
    if (functionName === "balanceOf") return 33n;
    if (functionName === "getBalance") return args[1] === KURU.native ? 22n : 11n;
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
  assert.equal((await readKuruAccount(mockAccountClient(zeroAddress, 0), account)).userId, 0n);
  await assert.rejects(readKuruAccount({ getChainId: async () => 143 }, account), /testnet/);
});
