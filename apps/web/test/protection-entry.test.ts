import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  connected: true,
  deployed: false,
  loading: false,
  error: null as string | null,
  pools: [] as unknown[],
  balance: 2500000000n as bigint | null,
  balanceLoading: false,
}));
vi.mock("@/chain/wallet", () => ({
  useWalletConnection: () => ({ connected: state.connected }),
  useWalletAddress: () => (state.connected ? "0xWallet" : null),
}));
vi.mock("@/chain/adapter", () => ({
  get protocolDeployed() {
    return state.deployed;
  },
  chain: { label: "Base", explorerTxUrl: (id: string) => id },
}));
vi.mock("@/data/pools", () => ({
  usePools: () => ({ data: state.pools, error: state.error, loading: state.loading }),
}));
vi.mock("@/data/protection-status", () => ({
  useProtectionStatus: () => ({ now: 1000, loading: false, fresh: false }),
}));
vi.mock("@/data/balance", () => ({
  useTokenBalance: () => ({ balance: state.balance, loading: state.balanceLoading }),
}));
vi.mock("@/chain/useSubmitTx", () => ({
  useSubmitTx: () => ({ owner: state.connected ? "0xWallet" : null, pending: false, error: null, submit: vi.fn() }),
}));
import { Deposit } from "../src/screens/Deposit";

function page(query = "asset=tAAPLc&amount=1") {
  return renderToStaticMarkup(
    createElement(StaticRouter, { location: `/protection/new?${query}` }, createElement(Deposit)),
  );
}
function readyPool() {
  return {
    address: "0xPool",
    shielded: { token: "0xStock", symbol: "tAAPLc", decimals: 8 },
    backing: { token: "0xUSDC", symbol: "TestUSDC", decimals: 6 },
    preset: { asset: "Apple" },
    stats: {
      shieldedMinDeposit: 1n,
      shieldedMaxDeposit: 0n,
      minimumPoolTime: 60n,
      premiumRateBp: 1000n,
      poolFeeBp: 100n,
      protocolFeeBp: 0n,
      collateralRatioBp: 15000n,
    },
    availability: {
      evaluatedAt: 990n,
      validUntil: 1060n,
      maxShieldedDeposit: 10000000000n,
      openPosition: { state: "available", blockers: [] },
    },
  };
}
function reviewButton(html: string) {
  return html.match(/<button[^>]*>Review protection<\/button>/)?.[0];
}
beforeEach(() => {
  Object.assign(state, {
    connected: true,
    deployed: false,
    loading: false,
    error: null,
    pools: [],
    balance: 2500000000n,
    balanceLoading: false,
  });
});
describe("protection entry after claiming test tokens", () => {
  it("distinguishes pools with the same assets by their stored gain share and collateral terms", () => {
    const seeded = readyPool();
    const custom = {
      ...seeded,
      address: "0xCustom",
      stats: { ...seeded.stats, premiumRateBp: 700n, poolFeeBp: 50n, protocolFeeBp: 100n, collateralRatioBp: 17500n },
    };
    state.pools = [seeded, custom];
    const html = page();
    expect(html).toContain("8.5% of positive gains");
    expect(html).toContain("175% collateral");
    expect(html).toContain('aria-label="Choose TestUSDC · 8.5% gain share · 175% collateral"');
    expect(html).toContain("pool=0xCustom");
  });
  it("checks deployment availability instead of sending a connected wallet back to claim", () => {
    const html = page();
    expect(html).toMatch(/<button[^>]*>Check protection availability<\/button>/);
    expect(html).not.toContain(">Get free test tokens</a>");
    expect(html).toContain(">Need test tokens?</a>");
    expect(html).toContain('value="1"');
    expect(html).toContain("next=%2Fprotection%2Fnew%3Fasset%3DtAAPLc%26amount%3D1");
  });
  it("preserves the selected stock and amount through wallet connection", () => {
    state.connected = false;
    const html = page("asset=tGOOGLc&amount=5");
    expect(html).toContain("/connect?next=%2Fprotection%2Fnew%3Fasset%3DtGOOGLc%26amount%3D5");
    expect(html).toContain(">Connect wallet to prepare</a>");
    expect(html).toContain('value="5"');
  });
  it("uses the actual deposit form once the selected pool and wallet balance are available", () => {
    state.deployed = true;
    state.pools = [readyPool()];
    const html = page();
    expect(reviewButton(html)).toBeDefined();
    expect(reviewButton(html)).not.toContain(' disabled=""');
    expect(html).toContain("In your wallet: 25 tAAPLc");
    expect(html).not.toContain("Check protection availability");
    expect(html).not.toContain("Need free test tokens?");
  });
  it.each([0n, null])("does not enable a deposit when the current pool token balance is %s", (balance) => {
    state.deployed = true;
    state.pools = [readyPool()];
    state.balance = balance;
    const html = page();
    expect(reviewButton(html)).toContain(' disabled=""');
    expect(html).toContain(
      balance === null ? "Wallet balance is unavailable" : "You need more test tokens for this amount",
    );
  });
  it("offers tokens for an insufficient balance and preserves the selected deposit", () => {
    state.deployed = true;
    state.pools = [readyPool()];
    state.balance = 50000000n;
    const html = page();
    expect(reviewButton(html)).toContain(' disabled=""');
    expect(html).toContain("Need free test tokens?");
    expect(html).toContain("next=%2Fprotection%2Fnew%3Fasset%3DtAAPLc%26amount%3D1");
  });
  it("does not treat an unknown balance as a reason to claim more tokens", () => {
    state.deployed = true;
    state.pools = [readyPool()];
    state.balance = null;
    expect(page()).not.toContain("Need free test tokens?");
  });
  it("shows pool-read failures rather than blaming the token balance", () => {
    state.deployed = true;
    state.error = "RPC unavailable";
    const html = page();
    expect(html).toContain("The pool could not be verified");
    expect(html).not.toContain("Need test tokens?");
  });
});

it("shows a pool-specific Max limit while retaining the full wallet quantity", () => {
  const pool = readyPool();
  pool.stats.shieldedMaxDeposit = 300000000n;
  state.pools = [pool];
  const html = page();
  expect(html).toContain("In your wallet: 25 tAAPLc");
  expect(html).toContain("Maximum for this pool: 3 tAAPLc");
  expect(html).toMatch(/<button[^>]*>Max<\/button>/);
});
it("does not offer Max when pool capacity is unknown or zero", () => {
  const pool = readyPool();
  pool.availability.maxShieldedDeposit = 0n;
  state.pools = [pool];
  expect(page()).not.toMatch(/<button[^>]*>Max<\/button>/);
  pool.availability.validUntil = 999n;
  expect(page()).not.toMatch(/<button[^>]*>Max<\/button>/);
});
it("shows each pool's own waiting period in the comparison", () => {
  const first = readyPool();
  state.pools = [first, { ...first, address: "0xSecond", stats: { ...first.stats, minimumPoolTime: 180n } }];
  expect(page()).toContain("1 minute");
  expect(page()).toContain("3 minutes");
});
