import { describe, expect, it, vi } from "vitest";
import { KURU, type KuruQuote } from "../../../services/monad/kuru-contracts.mjs";
import { depositKuruFunding, fundableKuruQuote, reviewableKuruQuote } from "./kuru-funding-state";
const account = "0x1111111111111111111111111111111111111111" as const;
const other = "0x2222222222222222222222222222222222222222" as const;
const now = 1789570000000;
const quote: KuruQuote = {
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

describe("Kuru funding before custody", () => {
  it("allows an unfunded new root to review liquidity without enabling a swap", () => {
    const preview = { ...quote, userId: 0n };
    const unfunded = { ...state, userId: 0n, freeUsdc: 0n };
    expect(fundableKuruQuote(preview, unfunded, now)).toBe(preview);
    expect(reviewableKuruQuote(preview, unfunded, now)).toBeNull();
    expect(fundableKuruQuote(preview, { ...unfunded, account: other }, now)).toBeNull();
    expect(fundableKuruQuote(preview, unfunded, now + 60000)).toBeNull();
  });

  const steps = () => ({
    readAccount: vi.fn(async () => ({ account, userId: 0n, usdc: 0n, mon: 0n, walletUsdc: 10000000n })),
    preflight: vi.fn(async () => undefined),
    approve: vi.fn(async (_amount: bigint) => undefined),
    deposit: vi.fn(async (_amount: bigint) => undefined),
  });

  it("never asks for approval or deposits when liquidity or withdrawal pricing is unavailable", async () => {
    for (const reason of ["No liquidity", "Withdrawal pricing unavailable", "Withdrawal capacity insufficient"]) {
      const actions = steps();
      actions.preflight.mockRejectedValueOnce(new Error(reason));
      await expect(depositKuruFunding(10000000n, actions)).rejects.toThrow(reason);
      expect(actions.approve).not.toHaveBeenCalled();
      expect(actions.deposit).not.toHaveBeenCalled();
    }
  });

  it("does not deposit if availability disappears while approval waits in the wallet", async () => {
    const actions = steps();
    actions.preflight.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("Liquidity disappeared"));
    await expect(depositKuruFunding(10000000n, actions)).rejects.toThrow("Liquidity disappeared");
    expect(actions.approve).toHaveBeenCalledExactlyOnceWith(10000000n);
    expect(actions.deposit).not.toHaveBeenCalled();
  });

  it("deposits only the missing amount after both checks without repeating transactions", async () => {
    const actions = steps();
    actions.readAccount.mockResolvedValue({ account, userId: 7n, usdc: 3000000n, mon: 0n, walletUsdc: 7000000n });
    await depositKuruFunding(10000000n, actions);
    expect(actions.preflight).toHaveBeenCalledTimes(2);
    expect(actions.approve).toHaveBeenCalledExactlyOnceWith(7000000n);
    expect(actions.deposit).toHaveBeenCalledExactlyOnceWith(7000000n);
  });
});
