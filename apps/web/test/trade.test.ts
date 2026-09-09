import { describe, expect, it } from "vitest";
import type { DemoMarket, DemoTradeQuote, DemoTradeRequest } from "@yieldshield/core";
import {
  demoMarketIsFresh,
  demoQuoteMatches,
  demoTradeDeadline,
  demoTradeLimit,
  parseTradeAmount,
} from "../src/screens/trade-state";
import { connectionBackPath, getNavigationSection, setupLink } from "../src/lib/navigation";

const market: DemoMarket = {
  chainId: 84532,
  exchange: "0x1111111111111111111111111111111111111111",
  ready: true,
  evaluatedAt: 1000,
  validUntil: 1060,
  feeBps: 30,
  maxStockAmount: 25_00000000n,
  assets: [
    {
      token: "0x2222222222222222222222222222222222222222",
      symbol: "tAAPLc",
      name: "Apple",
      decimals: 8,
      priceUsd8: 200_00000000n,
    },
  ],
  quoteToken: { token: "0x3333333333333333333333333333333333333333", symbol: "TestUSDC", decimals: 6 },
};
const request: DemoTradeRequest = {
  asset: market.assets[0]!.token,
  side: "buy",
  amount: 100000000n,
  owner: "0x4444444444444444444444444444444444444444",
};
const quote: DemoTradeQuote = {
  ...request,
  chainId: 84532,
  exchange: market.exchange,
  inputToken: market.quoteToken.token,
  outputToken: request.asset,
  inputAmount: 200600000n,
  outputAmount: request.amount,
  feeAmount: 600000n,
  priceUsd8: 20000000000n,
  quotedAt: 1000,
  validUntil: 1020,
};

describe("trade quantity", () => {
  it("uses native WETH and cbBTC units and the selected asset's limit", () => {
    expect(parseTradeAmount("0.1", 18).amount).toBe(100000000000000000n);
    expect(parseTradeAmount("0.001", 8).amount).toBe(100000n);
    for (const decimals of [6, 8, 18]) {
      const maxAmount = 25n * 10n ** BigInt(decimals);
      const m = {
        ...market,
        maxStockAmount: 25n * 10n ** 18n,
        assets: [{ ...market.assets[0]!, decimals, maxAmount }],
      };
      const r = { ...request, amount: maxAmount };
      const q = { ...quote, amount: maxAmount, outputAmount: maxAmount };
      expect(demoQuoteMatches(q, m, r, 1001)).toBe(true);
      expect(
        demoQuoteMatches(
          { ...q, amount: maxAmount + 1n, outputAmount: maxAmount + 1n },
          m,
          { ...r, amount: maxAmount + 1n },
          1001,
        ),
      ).toBe(false);
    }
  });
  it("preserves exact stock units without rounding user input", () => {
    expect(parseTradeAmount(" 1.23456789 ", 8)).toEqual({ amount: 123456789n, error: null });
    expect(parseTradeAmount("1.234567891", 8).error).toContain("8 decimal places");
  });
  it.each(["-1", "+1", "1,000", "1,5", "1e3", "Infinity", "abc"])("rejects ambiguous input %s", (value) => {
    expect(parseTradeAmount(value, 8)).toMatchObject({ amount: 0n, error: expect.any(String) });
  });
  it("keeps an empty draft distinct from zero", () => {
    expect(parseTradeAmount("", 8)).toEqual({ amount: 0n, error: null });
    expect(parseTradeAmount("0", 8).error).toContain("greater than zero");
  });
});

describe("review identity and freshness", () => {
  it("accepts one reviewed exact-stock-quantity purchase", () => {
    expect(demoQuoteMatches(quote, market, request, 1001)).toBe(true);
  });
  it("never reuses a quote after wallet, stock, direction or quantity changes", () => {
    for (const update of [
      { owner: undefined },
      { owner: "0x5555555555555555555555555555555555555555" },
      { asset: market.quoteToken.token },
      { side: "sell" as const },
      { amount: 2n },
    ])
      expect(demoQuoteMatches(quote, market, { ...request, ...update }, 1001)).toBe(false);
  });
  it("rejects stale, unknown, paused and wrong-chain market status", () => {
    expect(demoQuoteMatches(quote, undefined, request, 1001)).toBe(false);
    for (const update of [
      { ready: false },
      { chainId: 8453 },
      { evaluatedAt: 1007 },
      { validUntil: 1001 },
      { validUntil: 999 },
      { validUntil: 1121 },
    ])
      expect(demoMarketIsFresh({ ...market, ...update } as DemoMarket, 1001)).toBe(false);
  });
  it("expires review at the boundary and rejects future or malformed quote lifetime", () => {
    expect(demoQuoteMatches(quote, market, request, 1020)).toBe(false);
    for (const update of [{ quotedAt: 1007 }, { quotedAt: 1001.5 }, { validUntil: 1000 }, { validUntil: 1121 }])
      expect(demoQuoteMatches({ ...quote, ...update }, market, request, 1001)).toBe(false);
  });
  it("rejects wrong exchange, token routes, output quantity and invalid value", () => {
    for (const update of [
      { exchange: request.asset },
      { inputToken: request.asset },
      { outputToken: market.quoteToken.token },
      { outputAmount: request.amount - 1n },
      { inputAmount: 0n },
      { feeAmount: -1n },
      { priceUsd8: 0n },
    ])
      expect(demoQuoteMatches({ ...quote, ...update }, market, request, 1001)).toBe(false);
    expect(demoQuoteMatches({ ...quote, chainId: 8453 } as unknown as DemoTradeQuote, market, request, 1001)).toBe(
      false,
    );
  });
  it("requires exact stock input on a sale and enforces trade cap", () => {
    const sellRequest = { ...request, side: "sell" as const };
    const sellQuote = {
      ...quote,
      ...sellRequest,
      inputToken: request.asset,
      outputToken: market.quoteToken.token,
      inputAmount: request.amount,
      outputAmount: 199400000n,
    };
    expect(demoQuoteMatches(sellQuote, market, sellRequest, 1001)).toBe(true);
    expect(demoQuoteMatches({ ...sellQuote, inputAmount: 1n }, market, sellRequest, 1001)).toBe(false);
    expect(demoQuoteMatches(quote, { ...market, maxStockAmount: 1n }, request, 1001)).toBe(false);
  });
  it("ceilings maximum spend and floors minimum proceeds to smallest token units", () => {
    expect(demoTradeLimit({ ...quote, inputAmount: 1001n })).toBe(1007n);
    expect(demoTradeLimit({ ...quote, side: "sell", outputAmount: 1001n })).toBe(995n);
    expect(demoTradeLimit({ ...quote, side: "sell", outputAmount: 1n })).toBe(0n);
  });
  it("gives an explicitly approved quote time for both signatures without extending review freshness", () => {
    expect(demoTradeDeadline(quote)).toBe(1120n);
    expect(demoTradeDeadline({ ...quote, validUntil: 1010 })).toBe(1110n);
    expect(demoQuoteMatches(quote, market, request, 1020)).toBe(false);
  });
});

describe("trade setup navigation", () => {
  it("preserves direction, stock, quantity and fragment through faucet, connect and cancel", () => {
    const draft = "/trade?asset=tNVDAc&side=sell&amount=2.12345678#quote";
    const faucet = setupLink("/test-tokens", "/trade", "?asset=tNVDAc&side=sell&amount=2.12345678", "#quote");
    expect(new URLSearchParams(faucet.split("?")[1]).get("next")).toBe(draft);
    const connect = setupLink("/connect", "/test-tokens", faucet.slice(faucet.indexOf("?")));
    expect(new URLSearchParams(connect.split("?")[1]).get("next")).toBe(faucet);
    expect(connectionBackPath(draft)).toBe(draft);
    expect(getNavigationSection("/connect", connect.slice(connect.indexOf("?")))).toBe("trade");
  });
});
