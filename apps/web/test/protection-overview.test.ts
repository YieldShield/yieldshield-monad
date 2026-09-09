import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TokenBalance } from "@yieldshield/core";
import type { ProtectionStatus } from "@/lib/protection-status";
import { parseProtectionStatus } from "@/lib/protection-status";
import { maximumProtectionAmount, walletHolding } from "@/lib/protection-overview";
import capturedStatus from "./fixtures/base-custom-pool-status.json";

const state = vi.hoisted(() => ({
  owner: "0xWalletA" as string | null,
  balances: [] as TokenBalance[],
  balancesLoading: false,
  balancesError: null as string | null,
  fresh: true,
  error: null as string | null,
  data: undefined as ProtectionStatus | undefined,
}));
vi.mock("@/chain/wallet", () => ({ useWalletAddress: () => state.owner }));
vi.mock("@/chain/adapter", () => ({ chain: { label: "Base" } }));
vi.mock("@/data/balances", () => ({
  useWhitelistedBalances: () => ({
    balances: state.balances,
    loading: state.balancesLoading,
    error: state.balancesError,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/data/protection-status", () => ({
  useProtectionStatus: () => ({
    data: state.data,
    fresh: state.fresh,
    error: state.error,
    loading: false,
    refresh: vi.fn(),
  }),
}));
import { Markets } from "@/screens/Markets";

function holding(symbol: string, amount: bigint): TokenBalance {
  const token = capturedStatus.faucet.tokens.find((entry) => entry.symbol === symbol)!;
  return {
    amount,
    token: {
      token: token.address,
      symbol,
      name: symbol,
      decimals: token.decimals,
      minCollateralRatioBp: 15000n,
      tranche: "volatile",
    },
  };
}
function page() {
  return renderToStaticMarkup(createElement(StaticRouter, { location: "/markets" }, createElement(Markets)));
}
function card(html: string, name: string) {
  return [...html.matchAll(/<article\b.*?<\/article>/gs)]
    .map((match) => match[0])
    .find((part) => part.includes(`>${name}</h3>`))!;
}
beforeEach(() =>
  Object.assign(state, {
    owner: "0xWalletA",
    balances: [],
    balancesLoading: false,
    balancesError: null,
    fresh: true,
    error: null,
    data: parseProtectionStatus(structuredClone(capturedStatus), capturedStatus.evaluatedAt + 1),
  }),
);

describe("Get protection wallet overview", () => {
  it("offers protection with the selected asset, without buy/sell actions", () => {
    state.balances = [holding("tAAPLc", 500000000n)];
    const html = page();
    expect(html).toContain("Protect what you hold.");
    expect(card(html, "Apple")).toMatch(/<a[^>]*aria-label="Protect Apple"[^>]*href="\/protection\/new\?asset=tAAPLc"/);
    expect(html).not.toMatch(/aria-label="(?:Buy|Sell) /);
    expect(html).not.toContain("side=buy");
    expect(html).not.toContain("side=sell");
    expect(html).toContain('href="/trade"');
    expect(html).toContain("Wallet balances exclude assets already deposited");
  });
  it("lists owned assets first and does not round tiny positive holdings to zero", () => {
    state.balances = [holding("tAAPLc", 0n), holding("tWETH", 1n)];
    const html = page();
    expect(html.indexOf(">Wrapped Ether</h3>")).toBeLessThan(html.indexOf(">Apple</h3>"));
    expect(card(html, "Wrapped Ether")).toContain("0.000000000000000001");
    expect(card(html, "Wrapped Ether")).toContain('aria-label="Protect Wrapped Ether"');
    expect(card(html, "Apple")).toContain('aria-label="View Apple protection options"');
    expect(card(html, "Apple")).not.toContain("Balance unavailable");
  });
  it("allows browsing without displaying cached holdings after disconnect", () => {
    state.owner = null;
    state.balances = [holding("tAAPLc", 1234500000000n)];
    const html = page();
    expect(html).toContain("Connect wallet to see your balances.");
    expect(html).toContain('href="/connect?next=%2Fmarkets"');
    expect(card(html, "Apple")).toContain("Connect to view balance");
    expect(html).not.toContain("12,345");
  });
  it("distinguishes missing, loading, failed and zero token balances", () => {
    expect(card(page(), "Apple")).toContain("Balance unavailable");
    state.balances = [holding("tAAPLc", 500000000n)];
    state.balancesLoading = true;
    expect(card(page(), "Apple")).toContain("Checking balance…");
    expect(card(page(), "Apple")).not.toContain('aria-label="Protect Apple"');
    state.balancesLoading = false;
    state.balancesError = "RPC failed";
    expect(card(page(), "Apple")).toContain("Balance unavailable");
    expect(page()).toContain("Wallet balances could not be loaded.");
  });
  it("updates quantities and ordering for another wallet and after a deposit", () => {
    state.balances = [holding("tAAPLc", 500000000n), holding("tNVDAc", 0n)];
    expect(card(page(), "Apple")).toContain('aria-label="Protect Apple"');
    state.owner = "0xWalletB";
    state.balances = [holding("tAAPLc", 0n), holding("tNVDAc", 100000000n)];
    const switched = page();
    expect(switched.indexOf(">NVIDIA</h3>")).toBeLessThan(switched.indexOf(">Apple</h3>"));
    expect(card(switched, "Apple")).not.toContain('aria-label="Protect Apple"');
    state.balances = [holding("tAAPLc", 0n), holding("tNVDAc", 0n)];
    expect(card(page(), "NVIDIA")).toContain('aria-label="View NVIDIA protection options"');
  });
  it("shows an open pool even when the first is blocked and compares all waiting periods", () => {
    const choices = state.data!.assets.filter((asset) => asset.symbol === "tAAPLc");
    expect(choices.length).toBe(2);
    choices[0]!.actions.openPosition = { state: "blocked", blockers: [] };
    choices[0]!.pool.terms!.protectedExitDelaySeconds = 60;
    choices[1]!.pool.terms!.protectedExitDelaySeconds = 180;
    state.balances = [holding("tAAPLc", 100000000n)];
    const apple = card(page(), "Apple");
    expect(apple).toContain("1 pool accepting deposits");
    expect(apple).toContain("1 minute–3 minutes");
    expect(apple).toContain("TestUSDC or vUSDC");
    expect(apple).toContain('aria-label="Protect Apple"');
  });
  it("does not present stale or incomplete pool terms as confirmed", () => {
    state.fresh = false;
    expect(page()).not.toContain("accepting deposits");
    expect(card(page(), "Apple")).toContain("Refresh required");
    state.fresh = true;
    state.data!.assets.find((asset) => asset.symbol === "tAAPLc")!.pool.terms = null;
    expect(card(page(), "Apple")).toContain("Terms pending");
  });
});

describe("token identity and deposit limits", () => {
  it("uses the verified token address and refuses ambiguous symbol matches", () => {
    const real = holding("tAAPLc", 100000000n);
    const duplicate = {
      ...real,
      amount: 99900000000n,
      token: { ...real.token, token: "0x1111111111111111111111111111111111111111" },
    };
    expect(walletHolding([duplicate, real], "tAAPLc", real.token.token.toUpperCase())).toBe(real);
    expect(walletHolding([duplicate, real], "tAAPLc")).toBeNull();
    expect(walletHolding([], "tAAPLc", real.token.token)).toBeNull();
  });
  it.each([
    [100n, 0n, 1000n, 100n],
    [100n, 40n, 1000n, 40n],
    [100n, 40n, 20n, 20n],
    [100n, 0n, 0n, 0n],
    [0n, 40n, 1000n, 0n],
    [1n, 0n, 2n, 1n],
  ])("caps Max by wallet %s, per-deposit limit %s and capacity %s", (balance, limit, capacity, expected) => {
    expect(maximumProtectionAmount(balance, limit, capacity)).toBe(expected);
  });
});
