import { decodeEventLog, getAddress, keccak256, parseAbi, zeroAddress } from "viem";
import registry from "../../config/kuru-testnet.json" with { type: "json" };

// Independently authored narrow interfaces from Kuru's published contract reference.
// No Kuru SDK implementation is vendored or executed.
export const KURU = Object.freeze({
  chainId: 10143,
  account: registry.contracts.account.address,
  router: registry.contracts.router.address,
  market: registry.contracts.market.address,
  usdc: registry.contracts.usdc.address,
  faucet: registry.contracts.faucet.address,
  native: zeroAddress,
  minInput: 10_000_000n,
  maxInput: 100_000_000n,
  slippageBps: 50n,
  quoteLifetimeMs: 60_000,
});
export const kuruAccountAbi = parseAbi([
  "function deposit(address token,uint256 amount) payable",
  "function withdraw(address token,uint256 amount)",
  "function userRegistry(address user) view returns(uint40)",
  "function userAddressById(uint40 id) view returns(address)",
  "function getBalance(address user,address token) view returns(uint256)",
  "function verifiedSpotOrderBook(address market) view returns(bool)",
  "function spotRouterAddress() view returns(address)",
  "function protocolPaused() view returns(bool)",
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
export const kuruFaucetAbi = parseAbi(["function claim()", "function nextClaimAt(address) view returns(uint64)"]);
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const read = (client, address, abi, functionName, args = [], blockNumber) =>
  client.readContract({ address, abi, functionName, args, blockNumber });
const holder = (value) => {
  const result = getAddress(value);
  if (result === zeroAddress) throw new Error("Connect a wallet first.");
  return result;
};
export function isKuruTarget(address) {
  return Object.values(registry.contracts).some((pin) => same(address, pin.address));
}
export async function verifyKuruTarget(client, address, blockNumber) {
  if ((await client.getChainId()) !== KURU.chainId) throw new Error("Kuru requires Monad testnet.");
  const pin = Object.values(registry.contracts).find((item) => same(item.address, address));
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
    [KURU.account, KURU.router, KURU.market, KURU.usdc].map((address) =>
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
  ]);
  if (
    !same(base, KURU.native) ||
    !same(quote, KURU.usdc) ||
    !same(account, KURU.account) ||
    !same(router, KURU.router) ||
    !verified ||
    Number(decimals) !== 6 ||
    multiplier !== 10_000_000_000n ||
    pricePrecision !== 1_000_000n ||
    sizePrecision !== 100_000_000n ||
    minInput !== KURU.minInput
  )
    throw new Error("Kuru market identity or units changed. Review required.");
  if (paused || Number(marketState) !== 0) throw new Error("Kuru trading is paused.");
  return { chainId: KURU.chainId, market: KURU.market, blockNumber: block.number, timestamp: block.timestamp };
}
export async function readKuruAccount(client, address, blockNumber) {
  const account = holder(address);
  if ((await client.getChainId()) !== KURU.chainId) throw new Error("Kuru requires Monad testnet.");
  const [id, usdc, mon, walletUsdc] = await Promise.all([
    read(client, KURU.account, kuruAccountAbi, "userRegistry", [account], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "getBalance", [account, KURU.usdc], blockNumber),
    read(client, KURU.account, kuruAccountAbi, "getBalance", [account, KURU.native], blockNumber),
    read(client, KURU.usdc, kuruTokenAbi, "balanceOf", [account], blockNumber),
  ]);
  const userId = BigInt(id);
  if (
    userId &&
    !same(await read(client, KURU.account, kuruAccountAbi, "userAddressById", [Number(userId)], blockNumber), account)
  )
    throw new Error("Kuru account ownership mismatch.");
  return { account, userId, usdc, mon, walletUsdc };
}
export function validateKuruInput(amountIn) {
  if (typeof amountIn !== "bigint" || amountIn < KURU.minInput || amountIn > KURU.maxInput)
    throw new Error("Choose 10–100 Kuru test USDC.");
  return amountIn;
}
export async function quoteKuruBuy(client, { account, amountIn, now = Date.now() }) {
  validateKuruInput(amountIn);
  const identity = await readKuruIdentity(client, now);
  const state = await readKuruAccount(client, account, identity.blockNumber);
  const args = state.userId ? [Number(state.userId), true, amountIn] : [true, amountIn];
  const result = await read(client, KURU.market, kuruMarketAbi, "estimateSwap", args, identity.blockNumber);
  if (result.amountInUsed !== amountIn || result.amountOut <= 0n || result.amountOut >= 2n ** 128n)
    throw new Error("Kuru cannot fill this amount. Try again when liquidity is available.");
  const minAmountOut = (result.amountOut * (10000n - KURU.slippageBps)) / 10000n;
  if (minAmountOut <= 0n) throw new Error("Kuru output is too small.");
  return {
    ...identity,
    account: state.account,
    userId: state.userId,
    amountIn,
    amountOut: result.amountOut,
    minAmountOut,
    quotedAt: now,
    expiresAt: now + KURU.quoteLifetimeMs,
  };
}
export function buildKuruSwapRequest(quote, account, userId, now = Date.now()) {
  holder(account);
  validateKuruInput(quote?.amountIn);
  const id = BigInt(userId);
  if (
    quote.chainId !== KURU.chainId ||
    !same(quote.market, KURU.market) ||
    !same(quote.account, account) ||
    id <= 0n ||
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
  if (
    typeof quote.amountOut !== "bigint" ||
    quote.amountOut <= 0n ||
    quote.amountOut >= 2n ** 128n ||
    quote.minAmountOut <= 0n ||
    quote.minAmountOut !== (quote.amountOut * (10000n - KURU.slippageBps)) / 10000n
  )
    throw new Error("Invalid Kuru slippage limit.");
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
    event.amountInUsed !== quote.amountIn ||
    event.minAmountOut !== quote.minAmountOut ||
    event.amountOut < quote.minAmountOut
  )
    throw new Error("Kuru swap receipt does not match the reviewed trade.");
  return { amountInUsed: event.amountInUsed, amountOut: event.amountOut };
}
