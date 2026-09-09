import { describe, expect, it } from "vitest";
import { faucetAction, faucetTokenLabel, TEST_ETH_FAUCET_URL, type WalletFaucetStatus } from "../src/lib/testnet";
const address = "0x1",
  recipient = "0x2",
  now = 1000;
const wallet: WalletFaucetStatus = {
  address,
  recipient,
  chainId: 84532,
  evaluatedAt: now,
  validUntil: now + 20,
  nativeBalance: 1n,
  configured: true,
  ready: true,
  tokens: [
    {
      address: "0x3",
      enabled: true,
      funded: true,
      canDrip: true,
      dripAmount: 100n,
      faucetBalance: 100n,
      nextDripTime: 0,
    },
  ],
};
const valid = {
  recipient,
  enabled: true,
  address,
  publicStatus: { verified: true, address, configured: true, ready: true },
  publicFresh: true,
  wallet,
  now,
};
describe("free test-token request decisions", () => {
  it("offers connection independently of launch availability", () =>
    expect(faucetAction({ ...valid, recipient: null, publicFresh: false }).kind).toBe("connect"));
  it("explains incomplete configuration independently of market sessions", () =>
    expect(faucetAction({ ...valid, enabled: false }).kind).toBe("setup"));
  it("requires fresh public verification", () =>
    expect(faucetAction({ ...valid, publicFresh: false }).canRequest).toBe(false));
  it("never takes the transaction target from the status endpoint", () =>
    expect(faucetAction({ ...valid, publicStatus: { ...valid.publicStatus, address: "0xOther" } }).canRequest).toBe(
      false,
    ));
  it("rejects stale, wrong-account and wrong-chain personal eligibility", () => {
    for (const changed of [
      { validUntil: now },
      { evaluatedAt: now + 1 },
      { recipient: "0xOther" },
      { chainId: 8453 },
      { validUntil: now + 86400 },
    ])
      expect(faucetAction({ ...valid, wallet: { ...wallet, ...changed } }).canRequest).toBe(false);
  });
  it("shows depleted stock separately from cooldown", () =>
    expect(
      faucetAction({ ...valid, wallet: { ...wallet, tokens: [{ ...wallet.tokens[0]!, funded: false }] } }).kind,
    ).toBe("empty"));
  it("shows the earliest eligible wallet cooldown", () =>
    expect(
      faucetAction({
        ...valid,
        wallet: { ...wallet, ready: false, tokens: [{ ...wallet.tokens[0]!, canDrip: false, nextDripTime: now + 10 }] },
      }),
    ).toMatchObject({ kind: "cooldown", canRequest: false, nextClaimAt: now + 10 }));
  it("does not treat expiry of a local countdown as renewed onchain eligibility", () =>
    expect(
      faucetAction({
        ...valid,
        wallet: { ...wallet, ready: false, tokens: [{ ...wallet.tokens[0]!, canDrip: false, nextDripTime: now }] },
      }).canRequest,
    ).toBe(false));
  it("requires test ETH before requesting a basket", () =>
    expect(faucetAction({ ...valid, wallet: { ...wallet, nativeBalance: 0n } }).kind).toBe("gas"));
  it("allows eligible members of a partly cooled-down basket", () =>
    expect(
      faucetAction({
        ...valid,
        wallet: {
          ...wallet,
          tokens: [
            wallet.tokens[0]!,
            { ...wallet.tokens[0]!, address: "0x4", canDrip: false, nextDripTime: now + 86400 },
          ],
        },
      }),
    ).toMatchObject({ kind: "ready", canRequest: true }));
  it("allows the live eligible state without a market-hours input", () =>
    expect(faucetAction(valid).canRequest).toBe(true));
  it("uses Coinbase's documented free test ETH portal", () =>
    expect(TEST_ETH_FAUCET_URL).toBe("https://portal.cdp.coinbase.com/products/faucet"));
});

describe("public dispenser setup presentation", () => {
  const token = { verifiedFresh: true, enabled: false, funded: null, connected: false, now };
  it("shows a verified disabled token as unconfigured even when funding is unknown", () => {
    expect(faucetTokenLabel(token)).toBe("Not configured");
  });
  it("does not keep presenting an unconfigured state after its verification expires", () => {
    expect(faucetTokenLabel({ ...token, verifiedFresh: false })).toBe("Checking");
  });
  it("distinguishes unknown funding from a confirmed need for a top-up", () => {
    expect(faucetTokenLabel({ ...token, enabled: true })).toBe("Checking");
    expect(faucetTokenLabel({ ...token, enabled: true, funded: false })).toBe("Awaiting top-up");
  });
  it("explains verified incomplete setup before connection without allowing a request", () => {
    expect(
      faucetAction({ ...valid, recipient: null, publicStatus: { ...valid.publicStatus, configured: false } }),
    ).toMatchObject({ kind: "connect", title: "Test tokens are being prepared", canRequest: false });
  });
  it("keeps wallet connection available without relying on stale setup status", () => {
    expect(
      faucetAction({
        ...valid,
        recipient: null,
        publicFresh: false,
        publicStatus: { ...valid.publicStatus, configured: false },
      }),
    ).toMatchObject({ kind: "connect", title: "Connect your wallet", canRequest: false });
  });
});
