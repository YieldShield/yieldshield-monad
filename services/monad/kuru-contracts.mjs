import { decodeEventLog, getAddress, keccak256, parseAbi, zeroAddress } from "viem";
import registry from "../../config/kuru-testnet.json" with { type: "json" };
import legacyRegistry from "../../config/kuru-testnet-legacy.json" with { type: "json" };

// Independently authored narrow interfaces from Kuru's published contract reference.
// No Kuru SDK implementation is vendored or executed.
export const KURU = Object.freeze({
  chainId: 10143,
  account: registry.contracts.account.address,
  router: registry.contracts.router.address,
  market: registry.contracts.market.address,
  usdc: registry.contracts.usdc.address,
  limiter: registry.contracts.limiter.address,
  native: zeroAddress,
  minInput: 10_000_000n,
  maxInput: 100_000_000n,
  slippageBps: 50n,
  quoteLifetimeMs: 60_000,
});
export const KURU_LEGACY = Object.freeze({
  account: legacyRegistry.contracts.account.address,
  usdc: legacyRegistry.contracts.usdc.address,
  native: zeroAddress,
});
export const kuruAccountAbi = parseAbi([
  "function deposit(address rootOwner,address token,uint256 amount) payable",
  "function withdraw(uint40 rootAccountId,address token,uint256 amount,address recipient)",
  "function rootAccountIdOf(address owner) view returns(uint40)",
  "function getAccountOwner(uint40 id) view returns(address)",
  "function getAccountRootId(uint40 id) view returns(uint40)",
  "function getBalance(uint40 id,address token) view returns(uint256)",
  "function verifiedSpotOrderBook(address market) view returns(bool)",
  "function spotRouterAddress() view returns(address)",
  "function protocolPaused() view returns(bool)",
  "function withdrawalLimiter() view returns(address)",
  "function withdrawalsFrozen() view returns(bool)",
  "function tokenWithdrawalsFrozen(address token) view returns(bool)",
  "function spotTokenEnabled(address token) view returns(bool)",
  "function effectiveSpotTakerFeePps(uint40 id,uint256 marketFee) view returns(uint256)",
]);
export const kuruLegacyAccountAbi = parseAbi([
  "function withdraw(address token,uint256 amount)",
  "function getBalance(address user,address token) view returns(uint256)",
]);
export const kuruLimiterAbi = parseAbi([
  "function previewWithdrawal(address token,uint256 amount) view returns(uint256 requiredUsd36,uint256 availableUsd36,bool withinLimit)",
  "function requireFreshPrice(address token) view",
]);
export const kuruMarketAbi = parseAbi([
  "function baseToken() view returns(address)",
  "function quoteToken() view returns(address)",
  "function spotBalanceAccountAddress() view returns(address)",
  "function marketState() view returns(uint8)",
  "function pricePrecision() view returns(uint256)",
  "function sizePrecision() view returns(uint256)",
  "function baseSizeMultiplier() view returns(uint256)",
  "function minQuoteNotional() view returns(uint96)",
  "function bestBidAsk() view returns(uint32 bid,uint32 ask)",
  "function takerFeePps() view returns(uint256)",
  "function estimateSwap(bool isBuy,uint128 amountIn) view returns((uint128 amountInUsed,uint128 amountOut))",
  "function estimateSwap(uint40 userId,bool isBuy,uint128 amountIn) view returns((uint128 amountInUsed,uint128 amountOut))",
  "function swap(uint40 userId,bool isBuy,uint128 amountIn,uint128 minAmountOut,uint64 deadline) returns((uint128 amountInUsed,uint128 amountOut))",
  "event SpotSwap(uint40 indexed userId,address indexed executor,bool indexed isBuy,uint128 amountInUsed,uint128 amountOut,uint128 minAmountOut)",
]);
export const kuruTokenAbi = parseAbi([
  "function decimals() view returns(uint8)",
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
]);
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const read = (client, address, abi, functionName, args = [], blockNumber) =>
  client.readContract({ address, abi, functionName, args, blockNumber });
const holder = (value) => {
  const result = getAddress(value);
  if (result === zeroAddress) throw new Error("Connect a wallet first.");
  return result;
};
export function isKuruTarget(address) {
  return [...Object.values(registry.contracts), legacyRegistry.contracts.account].some((pin) =>
    same(address, pin.address),
  );
}
export async function verifyKuruTarget(client, address, blockNumber) {
  if ((await client.getChainId()) !== KURU.chainId) throw new Error("Kuru requires Monad testnet.");
  const pin = [...Object.values(registry.contracts), legacyRegistry.contracts.account].find((item) =>
    same(item.address, address),
  );
  if (!pin) throw new Error("Unrecognized Kuru contract.");
  const code = await client.getCode({ address: pin.address, blockNumber });
  if (!code || keccak256(code) !== pin.runtimeCodehash) throw new Error("Kuru contract changed. Review required.");
  if (pin.implementation) {
    const [slot, code] = await Promise.all([
      client.getStorageAt({ address: pin.address, slot: registry.implementationSlot, blockNumber }),
      client.getCode({ address: pin.implementation, blockNumber }),
    ]);
    if (
      !slot ||
      !same(`0x${slot.slice(-40)}`, pin.implementation) ||
      !code ||
      keccak256(code) !== pin.implementationCodehash
    )
      throw new Error("Kuru implementation changed. Review required.");
  }
}
export async function readKuruIdentity(client, now = Date.now()) {
  const block = await client.getBlock();
  const age = now - Number(block.timestamp) * 1000;
  if (age < -5000 || age > 60000 || block.number === null) throw new Error("Fresh Monad state is required.");
  await Promise.all(
    [KURU.account, KURU.router, KURU.market, KURU.usdc, KURU.limiter].map((address) =>
      verifyKuruTarget(client, address, block.number),
    ),
  );
  const [
    base,
    quote,
    account,
    marketState,
    verified,
    paused,
    router,
    decimals,
    multiplier,
    pricePrecision,
    sizePrecision,
    minInput,
    limiter,
  ] = await Promise.all([
    ...["baseToken", "quoteToken", "spotBalanceAccountAddress", "marketState"].map((name) =>
      read(client, KURU.market, kuruMarketAbi, name, [], block.number),
    ),
    read(client, KURU.account, kuruAccountAbi, "verifiedSpotOrderBook", [KURU.market], block.number),
    read(client, KURU.account, kuruAccountAbi, "protocolPaused", [], block.number),
    read(client, KURU.account, kuruAccountAbi, "spotRouterAddress", [], block.number),
    read(client, KURU.usdc, kuruTokenAbi, "decimals", [], block.number),
    ...["baseSizeMultiplier", "pricePrecision", "sizePrecision", "minQuoteNotional"].map((name) =>
      read(client, KURU.market, kuruMarketAbi, name, [], block.number),
    ),
    read(client, KURU.account, kuruAccountAbi, "withdrawalLimiter", [], block.number),
  ]);
  if (
    !same(base, KURU.native) ||
    !same(quote, KURU.usdc) ||
    !same(account, KURU.account) ||
    !same(router, KURU.router) ||
    !same(limiter, KURU.limiter) ||
    !verified ||
    Number(decimals) !== 6 ||
    multiplier !== 1_000_000_000_000n ||
    pricePrecision !== 1_000_000n ||
    sizePrecision !== 1_000_000n ||
    minInput !== KURU.minInput
  )
    throw new Error("Kuru market identity or units changed. Review required.");
  if (paused || Number(marketState) !== 0) throw new Error("Kuru trading is paused.");
  return { chainId: KURU.chainId, market: KURU.market, blockNumber: block.number, timestamp: block.timestamp };
}
export async function readKuruAccount(client, address, blockNumber) {
  const account = holder(address);
  if ((await client.getChainId()) !== KURU.chainId) throw new Error("Kuru requires Monad testnet.");
  const userId = BigInt(await read(client, KURU.account, kuruAccountAbi, "rootAccountIdOf", [account], blockNumber));
  const [usdc, mon, walletUsdc] = await Promise.all([
    userId ? read(client, KURU.account, kuruAccountAbi, "getBalance", [Number(userId), KURU.usdc], blockNumber) : 0n,
    userId ? read(client, KURU.account, kuruAccountAbi, "getBalance", [Number(userId), KURU.native], blockNumber) : 0n,
    read(client, KURU.usdc, kuruTokenAbi, "balanceOf", [account], blockNumber),
  ]);
  if (userId) {
    const [owner, rootId] = await Promise.all([
      read(client, KURU.account, kuruAccountAbi, "getAccountOwner", [Number(userId)], blockNumber),
      read(client, KURU.account, kuruAccountAbi, "getAccountRootId", [Number(userId)], blockNumber),
    ]);
    if (!same(owner, account) || BigInt(rootId) !== userId) throw new Error("Kuru root account ownership mismatch.");
  }
  return { account, userId, usdc, mon, walletUsdc };
}

export function buildKuruDepositRequest(account, amount) {
  holder(account);
  if (typeof amount !== "bigint" || amount <= 0n || amount > KURU.maxInput)
    throw new Error("Invalid Kuru deposit amount.");
  return { address: KURU.account, abi: kuruAccountAbi, functionName: "deposit", args: [account, KURU.usdc, amount] };
}

export function buildKuruWithdrawalRequest(state, token, amount) {
  holder(state.account);
  const available = same(token, KURU.native) ? state.mon : same(token, KURU.usdc) ? state.usdc : 0n;
  if (state.userId <= 0n || state.userId >= 2n ** 40n || amount <= 0n || amount > available)
    throw new Error("Kuru balance changed. Refresh before withdrawing.");
  return {
    address: KURU.account,
    abi: kuruAccountAbi,
    functionName: "withdraw",
    args: [Number(state.userId), token, amount, state.account],
  };
}

export async function readKuruWithdrawalReadiness(client, token, amount, blockNumber) {
  if ((!same(token, KURU.native) && !same(token, KURU.usdc)) || amount <= 0n)
    throw new Error("Invalid Kuru withdrawal.");
  await Promise.all([
    verifyKuruTarget(client, KURU.account, blockNumber),
    verifyKuruTarget(client, KURU.limiter, blockNumber),
  ]);
  const [limiter, paused, frozen, tokenFrozen, enabled] = await Promise.all([
    read(client, KURU.account, kuruAccountAbi, "withdrawalLimiter", [], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "protocolPaused", [], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "withdrawalsFrozen", [], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "tokenWithdrawalsFrozen", [token], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "spotTokenEnabled", [token], blockNumber),
  ]);
  if (!same(limiter, KURU.limiter)) throw new Error("Kuru withdrawal limiter changed. Review required.");
  if (paused || frozen || tokenFrozen || !enabled)
    throw new Error("Kuru withdrawals are currently unavailable for this token.");
  let preview;
  try {
    await read(client, KURU.limiter, kuruLimiterAbi, "requireFreshPrice", [token], blockNumber);
    preview = await read(client, KURU.limiter, kuruLimiterAbi, "previewWithdrawal", [token, amount], blockNumber);
  } catch {
    throw new Error("Kuru withdrawal pricing is unavailable. Wait for a fresh price before funding or trading.");
  }
  if (!preview[2]) throw new Error("Kuru withdrawal capacity is currently insufficient. Try again later.");
  return { requiredUsd36: preview[0], availableUsd36: preview[1] };
}

export async function readLegacyKuruAccount(client, address) {
  const account = holder(address);
  await verifyKuruTarget(client, KURU_LEGACY.account);
  const [usdc, mon, walletUsdc] = await Promise.all([
    read(client, KURU_LEGACY.account, kuruLegacyAccountAbi, "getBalance", [account, KURU_LEGACY.usdc]),
    read(client, KURU_LEGACY.account, kuruLegacyAccountAbi, "getBalance", [account, KURU.native]),
    read(client, KURU_LEGACY.usdc, kuruTokenAbi, "balanceOf", [account]),
  ]);
  return { account, usdc, mon, walletUsdc };
}

export function buildLegacyKuruWithdrawalRequest(state, token, amount) {
  holder(state.account);
  const available = same(token, KURU_LEGACY.native) ? state.mon : same(token, KURU_LEGACY.usdc) ? state.usdc : 0n;
  if (amount <= 0n || amount > available) throw new Error("Legacy Kuru balance changed. Refresh before withdrawing.");
  return { address: KURU_LEGACY.account, abi: kuruLegacyAccountAbi, functionName: "withdraw", args: [token, amount] };
}
export function validateKuruInput(amountIn) {
  if (typeof amountIn !== "bigint" || amountIn < KURU.minInput || amountIn > KURU.maxInput)
    throw new Error("Choose 10–100 Kuru test USDC.");
  return amountIn;
}

// A buy can leave less than one executable base-size increment unspent. Use
// the best ask (a conservative lower bound for later asks) and its fee quantum;
// never turn materially partial liquidity into an apparently complete quote.
export function kuruRoundingLimit(bestAsk, takerFeePps, amountIn) {
  const price = BigInt(bestAsk);
  if (price <= 0n || price >= 2n ** 32n || takerFeePps < 0n || takerFeePps >= 10_000_000n)
    throw new Error("Kuru has no usable ask price or fee.");
  const quoteQuantum = (price + 999999n) / 1000000n;
  const feeQuantum = (quoteQuantum * takerFeePps + 9999999n) / 10000000n;
  const limit = quoteQuantum + feeQuantum;
  const cap = amountIn / 10000n; // At most one basis point, even for a very coarse book.
  return limit < cap ? limit : cap;
}

export function validateKuruFill(amountIn, amountInUsed, amountOut, roundingLimit) {
  if (
    typeof amountInUsed !== "bigint" ||
    amountInUsed <= 0n ||
    amountInUsed > amountIn ||
    typeof roundingLimit !== "bigint" ||
    roundingLimit <= 0n ||
    roundingLimit > amountIn / 10000n ||
    amountIn - amountInUsed >= roundingLimit ||
    typeof amountOut !== "bigint" ||
    amountOut <= 0n ||
    amountOut >= 2n ** 128n
  )
    throw new Error("Kuru cannot fill this amount. Try a smaller amount or wait for more liquidity.");
}
export async function quoteKuruBuy(client, { account, amountIn, now = Date.now() }) {
  validateKuruInput(amountIn);
  const identity = await readKuruIdentity(client, now);
  const state = await readKuruAccount(client, account, identity.blockNumber);
  const args = state.userId ? [Number(state.userId), true, amountIn] : [true, amountIn];
  const [result, bbo, marketFee] = await Promise.all([
    read(client, KURU.market, kuruMarketAbi, "estimateSwap", args, identity.blockNumber),
    read(client, KURU.market, kuruMarketAbi, "bestBidAsk", [], identity.blockNumber),
    read(client, KURU.market, kuruMarketAbi, "takerFeePps", [], identity.blockNumber),
  ]);
  const fee = state.userId
    ? await read(
        client,
        KURU.account,
        kuruAccountAbi,
        "effectiveSpotTakerFeePps",
        [Number(state.userId), marketFee],
        identity.blockNumber,
      )
    : marketFee;
  const inputRoundingLimit = kuruRoundingLimit(bbo[1], fee, amountIn);
  validateKuruFill(amountIn, result.amountInUsed, result.amountOut, inputRoundingLimit);
  const minAmountOut = (result.amountOut * (10000n - KURU.slippageBps)) / 10000n;
  if (minAmountOut <= 0n) throw new Error("Kuru output is too small.");
  return {
    ...identity,
    account: state.account,
    userId: state.userId,
    amountIn,
    amountInUsed: result.amountInUsed,
    inputRoundingLimit,
    amountOut: result.amountOut,
    minAmountOut,
    quotedAt: now,
    expiresAt: now + KURU.quoteLifetimeMs,
  };
}

export async function prepareKuruFunding(client, input) {
  const quote = await quoteKuruBuy(client, input);
  await Promise.all([
    readKuruWithdrawalReadiness(client, KURU.usdc, quote.amountIn, quote.blockNumber),
    readKuruWithdrawalReadiness(client, KURU.native, quote.amountOut, quote.blockNumber),
  ]);
  return quote;
}

export function validateKuruQuote(quote, account, userId, now = Date.now()) {
  holder(account);
  validateKuruInput(quote?.amountIn);
  const id = BigInt(userId);
  if (
    quote.chainId !== KURU.chainId ||
    !same(quote.market, KURU.market) ||
    !same(quote.account, account) ||
    id < 0n ||
    id >= 2n ** 40n ||
    quote.userId !== id
  )
    throw new Error("Kuru account or market changed. Request a new quote.");
  if (
    !Number.isSafeInteger(quote.quotedAt) ||
    !Number.isSafeInteger(quote.expiresAt) ||
    now < quote.quotedAt ||
    now >= quote.expiresAt ||
    quote.expiresAt - quote.quotedAt !== KURU.quoteLifetimeMs
  )
    throw new Error("Kuru quote expired. Request a new quote.");
  validateKuruFill(quote.amountIn, quote.amountInUsed, quote.amountOut, quote.inputRoundingLimit);
  if (
    typeof quote.amountOut !== "bigint" ||
    quote.amountOut <= 0n ||
    quote.amountOut >= 2n ** 128n ||
    quote.minAmountOut <= 0n ||
    quote.minAmountOut !== (quote.amountOut * (10000n - KURU.slippageBps)) / 10000n
  )
    throw new Error("Invalid Kuru slippage limit.");
}
export function buildKuruSwapRequest(quote, account, userId, now = Date.now()) {
  validateKuruQuote(quote, account, userId, now);
  const id = BigInt(userId);
  if (id <= 0n) throw new Error("Kuru account changed. Deposit and request a new quote.");
  return {
    address: KURU.market,
    abi: kuruMarketAbi,
    functionName: "swap",
    args: [Number(id), true, quote.amountIn, quote.minAmountOut, BigInt(Math.floor(quote.expiresAt / 1000))],
  };
}
export function confirmedKuruSwap(receipt, quote, account) {
  if (receipt.status !== "success") throw new Error("Kuru swap did not succeed.");
  const matches = [];
  for (const log of receipt.logs) {
    if (!same(log.address, KURU.market)) continue;
    try {
      const decoded = decodeEventLog({
        abi: kuruMarketAbi,
        eventName: "SpotSwap",
        data: log.data,
        topics: log.topics,
        strict: true,
      });
      matches.push(decoded.args);
    } catch {
      /* Other market events are not settlement proof. */
    }
  }
  if (matches.length !== 1) throw new Error("Kuru swap receipt could not be verified.");
  const event = matches[0];
  if (
    BigInt(event.userId) !== quote.userId ||
    !same(event.executor, account) ||
    !event.isBuy ||
    event.amountInUsed > quote.amountIn ||
    event.amountInUsed <= 0n ||
    quote.amountIn - event.amountInUsed >= quote.inputRoundingLimit ||
    event.minAmountOut !== quote.minAmountOut ||
    event.amountOut < quote.minAmountOut
  )
    throw new Error("Kuru swap receipt does not match the reviewed trade.");
  return { amountInUsed: event.amountInUsed, amountOut: event.amountOut };
}
