import { describe, it, expect, vi, afterEach } from "vitest";
import {
  amount,
  netAsset,
  minOut,
  noticeState,
  backingReserve,
  marketTerms,
  duration,
  apiRequestUrl,
  fetcher,
} from "./lib";
afterEach(() => vi.unstubAllGlobals());

it("production API reads bypass shared proxy quotas while preserving query strings", async () => {
  vi.stubGlobal("location", { origin: "https://monad.yieldshield.ai" });
  const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ positions: [] })));
  vi.stubGlobal("fetch", request);
  const key = "/api/positions?owner=0x0000000000000000000000000000000000000001";
  expect(await fetcher(key)).toEqual({ positions: [] });
  expect(request).toHaveBeenCalledWith(`https://monad-api.yieldshield.ai${key}`);
});

it("local and preview API reads retain their existing same-origin proxy", () => {
  for (const origin of ["http://localhost:5174", "https://preview.vercel.app", undefined]) {
    expect(apiRequestUrl("/api/status", origin)).toBe("/api/status");
  }
  expect(apiRequestUrl("/media/demo.mp4", "https://monad.yieldshield.ai")).toBe("/media/demo.mp4");
});

it("direct production API errors still fail closed", async () => {
  vi.stubGlobal("location", { origin: "https://monad.yieldshield.ai" });
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "Please wait before refreshing." }), { status: 429 })),
  );
  await expect(fetcher("/api/status")).rejects.toThrow("Please wait before refreshing.");
});

describe("wallet previews", () => {
  it("preserves token base units and rejects excess precision", () => {
    expect(amount("0.000001", 6)).toBe(1n);
    expect(amount("0.000000000000000001", 18)).toBe(1n);
    expect(() => amount("0.0000001", 6)).toThrow();
    expect(() => amount("-1", 18)).toThrow();
  });
  it("shares only realized gains and retains prior fee effects", () => {
    expect(netAsset(1000000000000000000n, 10000000000n, 10000000000n, 12000000000n, 18, [1000n, 100n, 100n])).toBe(
      979999999999999999n,
    );
    expect(netAsset(980000000000000000n, 10000000000n, 11760000000n, 8000000000n, 18, [1000n, 100n, 100n])).toBe(
      980000000000000000n,
    );
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

it("previews custom fees with contract rounding and no fee on losses", () => {
  expect(netAsset(100000000n, 10000000000n, 0n, 120000000n, 6, [2000n, 500n, 100n])).toBe(95666665n);
  expect(netAsset(100000000n, 10000000000n, 0n, 120000000n, 6, [100n, 0n, 100n])).toBe(99666666n);
  expect(netAsset(100000000n, 10000000000n, 0n, 80000000n, 6, [5000n, 2000n, 1000n])).toBe(100000000n);
});
it("reserves backing using custom collateral and the backing-token price", () => {
  expect(backingReserve(10000000000n, 22500n, 100000000n, 6)).toBe(225000000n);
  expect(backingReserve(10000000000n, 20000n, 125000000n, 6)).toBe(160000000n);
  expect(backingReserve(1n, 15001n, 100000000n, 18)).toBe(20000000000n);
});
it("does not substitute default terms when pool reads failed", () => {
  expect(marketTerms(undefined)).toBeNull();
});
it("shows actual pool waiting periods", () => {
  expect(duration(60)).toBe("1 minute");
  expect(duration(120)).toBe("2 minutes");
  expect(duration(86400)).toBe("1 day");
  expect(duration(undefined)).toBe("—");
});
