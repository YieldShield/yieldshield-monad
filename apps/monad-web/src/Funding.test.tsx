import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { FundingGate, FundingNotice, fundingStep } from "./Funding";

const balances = vi.hoisted(() => ({
  account: null as string | null,
  busy: false,
  native: undefined as bigint | undefined,
  nativeError: undefined as Error | undefined,
  token: undefined as bigint | undefined,
}));
vi.mock("./wallet", () => ({
  useWallet: () => ({ account: balances.account, busy: balances.busy }),
  useNativeBalance: () => ({ data: balances.native, error: balances.nativeError }),
  useBalance: () => ({ data: balances.token }),
}));

function renderFunding(symbol = "TestUSDC", pathname = "/protect") {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[pathname]}>
      <FundingNotice />
      <FundingGate asset={{ symbol, balance: balances.token }}>
        <button>
          {balances.busy ? "Transaction in progress" : balances.account ? "Approve & protect" : "Connect wallet"}
        </button>
      </FundingGate>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.assign(balances, { account: null, busy: false, native: undefined, nativeError: undefined, token: undefined });
});

describe("faucet onboarding before a transaction", () => {
  it("offers the Faucet to visitors without hiding wallet connection", () => {
    const html = renderFunding();
    expect(html).toContain('href="/faucet"');
    expect(html).toContain("Connect wallet");
    expect(html).not.toContain("This wallet has no MON");
  });

  it("prioritizes native gas even if a wallet already holds tokens", () => {
    Object.assign(balances, { account: "0x123", native: 0n, token: 100n });
    const html = renderFunding();
    expect(html).toContain('href="https://faucet.monad.xyz"');
    expect(html).toContain("Get testnet MON first");
    expect(html).not.toContain("Approve &amp; protect");
  });

  it.each([
    ["TestUSDC", "test-tokens", "Claim TestUSDC"],
    ["sMON-demo", "test-tokens", "Claim sMON-demo"],
    ["WMON", "wrap-mon", "Wrap MON"],
    ["shMON", "stake-mon", "Stake MON"],
    ["vTestUSDC", "test-vault", "Get vault shares"],
  ])("takes an empty %s balance to the relevant preparation section", (symbol, anchor, label) => {
    Object.assign(balances, { account: "0x123", native: 100n, token: 0n });
    const html = renderFunding(symbol);
    expect(html).toContain(`href="/faucet#${anchor}"`);
    expect(html).toContain(label);
    expect(html).not.toContain("Approve &amp; protect");
  });

  it("preserves the action for funded wallets", () => {
    Object.assign(balances, { account: "0x123", native: 100n, token: 100n });
    const html = renderFunding();
    expect(html).toContain("Approve &amp; protect");
    expect(html).not.toContain("funding-notice");
  });

  it("does not mislabel unknown or failed balances as empty", () => {
    expect(fundingStep(true, undefined, [0n, 0n])).toBeNull();
    expect(fundingStep(true, 100n, [0n, undefined])).toBeNull();
    Object.assign(balances, { account: "0x123", native: 0n, nativeError: new Error("RPC unavailable"), token: 100n });
    const html = renderFunding();
    expect(html).not.toContain("Get testnet MON first");
    expect(html).toContain("Approve &amp; protect");
  });

  it("does not replace an in-progress transaction after its balance is spent", () => {
    Object.assign(balances, { account: "0x123", busy: true, native: 0n, token: 0n });
    expect(renderFunding()).toContain("<button>Transaction in progress</button>");
  });

  it.each(["/protect", "/provide", "/positions", "/positions/receipt-1", "/trade"])(
    "shows the funding notice on %s",
    (pathname) => {
      expect(renderFunding("TestUSDC", pathname)).toContain("funding-notice");
    },
  );

  it.each(["/", "/markets", "/status", "/evidence", "/lab", "/how-it-works", "/faucet", "/legal"])(
    "keeps the funding notice off %s",
    (pathname) => {
      expect(renderFunding("TestUSDC", pathname)).not.toContain("funding-notice");
    },
  );
});
