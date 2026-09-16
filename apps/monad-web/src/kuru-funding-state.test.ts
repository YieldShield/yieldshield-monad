import { describe, expect, it } from "vitest";
import { KURU, type KuruQuote } from "../../../services/monad/kuru-contracts.mjs";
import { reviewableKuruQuote } from "./kuru-funding-state";
const account = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const now = 1789570000000;
const quote: KuruQuote = {
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
const state = { account, userId: 7n, amountIn: 10000000n, freeUsdc: 10000000n };
describe("Kuru confirmation across wallet and custody changes", () => {
  it("offers a still-funded quote for the exact selected account", () => {
    expect(reviewableKuruQuote(quote, state, now)).toBe(quote);
  });
  it("hides a late asynchronous quote after account switch or disconnect", () => {
    expect(reviewableKuruQuote(quote, { ...state, account: other }, now)).toBeNull();
    expect(reviewableKuruQuote(quote, { ...state, account: null }, now)).toBeNull();
  });
  it("does not use a previous account's unknown or failed balance", () => {
    expect(reviewableKuruQuote(quote, { ...state, freeUsdc: undefined }, now)).toBeNull();
    expect(reviewableKuruQuote(quote, { ...state, userId: undefined }, now)).toBeNull();
  });
  it("removes confirmation when unused USDC is returned before purchase", () => {
    expect(reviewableKuruQuote(quote, { ...state, freeUsdc: 0n }, now)).toBeNull();
  });
  it("expires on render even if a suspended tab delayed its timer", () => {
    expect(reviewableKuruQuote(quote, state, now + 60000)).toBeNull();
  });
  it("requires a new quote after input or Kuru identity changes", () => {
    expect(reviewableKuruQuote(quote, { ...state, amountIn: 20000000n }, now)).toBeNull();
    expect(reviewableKuruQuote(quote, { ...state, userId: 8n }, now)).toBeNull();
  });
});
