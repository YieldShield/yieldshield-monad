import { describe, it, expect } from "vitest";
import { amount, netAsset, minOut, noticeState } from "./lib";
describe("wallet previews", () => {
  it("preserves token base units and rejects excess precision", () => {
    expect(amount("0.000001", 6)).toBe(1n);
    expect(amount("0.000000000000000001", 18)).toBe(1n);
    expect(() => amount("0.0000001", 6)).toThrow();
    expect(() => amount("-1", 18)).toThrow();
  });
  it("shares only realized gains and retains prior fee effects", () => {
    expect(netAsset(1000000000000000000n, 10000000000n, 10000000000n, 12000000000n, 18)).toBe(979999999999999999n);
    expect(netAsset(980000000000000000n, 10000000000n, 11760000000n, 8000000000n, 18)).toBe(980000000000000000n);
  });
  it("uses conservative positive minimum outputs", () => {
    expect(minOut(1000000n)).toBe(995000n);
    expect(minOut(1n)).toBe(1n);
  });
});

it("honors the stored notice maturity and inclusive seven-day window", () => {
  expect(noticeState("200", 199999).active).toBe(false);
  expect(noticeState("200", 200000).active).toBe(true);
  expect(noticeState("200", 200000 + 7 * 86400000).active).toBe(true);
  expect(noticeState("200", 200001 + 7 * 86400000).expired).toBe(true);
  expect(noticeState("0", 200000).active).toBe(false);
});
