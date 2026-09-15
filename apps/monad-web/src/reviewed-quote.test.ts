import { describe, expect, it, vi } from "vitest";
import { reviewedQuoteDeadline } from "./reviewed-quote";

describe("reviewed trade quote deadline", () => {
  it("does not extend a quote when an approval takes time", () => {
    const expiresAt = 120900;
    expect(reviewedQuoteDeadline(expiresAt, 100000)).toBe(120n);
    expect(reviewedQuoteDeadline(expiresAt, 115000)).toBe(120n);
    expect(Number(reviewedQuoteDeadline(expiresAt, 115000)) * 1000).toBeLessThanOrEqual(expiresAt);
  });

  it("stops before the swap if the reviewed quote expired during approval", async () => {
    let now = 100000;
    const expiresAt = now + 20000;
    const approve = vi.fn(async () => {
      now += 21000;
    });
    const swap = vi.fn();
    const trade = async () => {
      reviewedQuoteDeadline(expiresAt, now);
      await approve();
      const deadline = reviewedQuoteDeadline(expiresAt, now);
      swap(deadline);
    };
    await expect(trade()).rejects.toThrow("Quote expired");
    expect(approve).toHaveBeenCalledOnce();
    expect(swap).not.toHaveBeenCalled();
  });

  it("rejects an already expired quote before approval", () => {
    expect(() => reviewedQuoteDeadline(100000, 100000)).toThrow("Quote expired");
    expect(() => reviewedQuoteDeadline(99999, 100000)).toThrow("Quote expired");
  });

  it.each([undefined, null, "120000", NaN, Infinity, -1, 120000.5, Number.MAX_SAFE_INTEGER + 1, 700001])(
    "rejects an invalid or unbounded expiry: %s",
    (expiry) => {
      expect(() => reviewedQuoteDeadline(expiry, 100000)).toThrow("Invalid quote expiry");
    },
  );
});
