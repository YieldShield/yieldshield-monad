import { describe, expect, it } from "vitest";
import { safeNextPath, getNavigationSection, setupLink, connectionBackPath } from "../src/lib/navigation";

describe("wallet return paths", () => {
  it("preserves the selected pool, amount and faucet return flow", () => {
    const next = "/protection/new?pool=0x123&amount=5";
    expect(safeNextPath(next)).toBe(next);
    expect(safeNextPath(`/test-tokens?next=${encodeURIComponent(next)}`)).toContain("next=");
  });
  it("rejects external destinations, unsafe separators and connection loops", () => {
    for (const value of [
      null,
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\nevil.example",
      "/connect?next=/connect",
      "/connect/?next=/account",
    ])
      expect(safeNextPath(value)).toBe("/markets");
  });
});

describe("navigation section selection", () => {
  it.each([
    ["/markets", "protection"],
    ["/protection/new", "protection"],
    ["/pool/0x123", "protection"],
    ["/deposit", "protection"],
    ["/position/123", "positions"],
    ["/activate/123", "positions"],
    ["/activity", "positions"],
    ["/provide", "collateral"],
    ["/underwriter/123", "collateral"],
    ["/create-pool", "collateral"],
    ["/account/", "account"],
    ["/status", undefined],
    ["/privacy", undefined],
    ["/positioning", undefined],
  ])("selects the section for %s", (path, expected) => {
    expect(getNavigationSection(path!)).toBe(expected);
  });
  it("keeps the return section through nested faucet and wallet setup", () => {
    const faucet = `/test-tokens?next=${encodeURIComponent("/account")}`;
    expect(getNavigationSection("/connect", `?next=${encodeURIComponent(faucet)}`)).toBe("account");
    expect(
      getNavigationSection("/test-tokens", `?next=${encodeURIComponent("/protection/new?symbol=tAAPLc&amount=10")}`),
    ).toBe("protection");
  });
  it("uses the same navigation for trailing-slash setup routes", () => {
    expect(getNavigationSection("/connect/", "?next=%2Faccount")).toBe("account");
    expect(getNavigationSection("/test-tokens/", "?next=%2Fprovide")).toBe("collateral");
    expect(setupLink("/test-tokens", "/test-tokens/", "?next=%2Faccount")).toBe("/test-tokens/?next=%2Faccount");
    expect(setupLink("/connect", "/connect/", "?next=%2Fprovide")).toBe("/connect?next=%2Fprovide");
  });
  it("handles unsafe and excessively nested destinations without looping", () => {
    expect(getNavigationSection("/connect", "?next=https://evil.example/account")).toBe("protection");
    let next = "/account";
    for (let i = 0; i < 8; i++) next = `/test-tokens?next=${encodeURIComponent(next)}`;
    expect(getNavigationSection("/test-tokens", `?next=${encodeURIComponent(next)}`)).toBeUndefined();
  });
});

describe("setup navigation", () => {
  const selection = "/protection/new?symbol=tAAPLc&amount=10#terms";
  it("preserves stock, amount and fragment when opening setup", () => {
    for (const target of ["/connect", "/test-tokens"] as const) {
      expect(setupLink(target, "/protection/new", "?symbol=tAAPLc&amount=10", "#terms")).toBe(
        `${target}?next=${encodeURIComponent(selection)}`,
      );
    }
  });
  it("returns to the faucet after connecting and never nests it inside itself", () => {
    const faucetSearch = `?next=${encodeURIComponent(selection)}`;
    const faucet = `/test-tokens${faucetSearch}`;
    expect(setupLink("/connect", "/test-tokens", faucetSearch)).toBe(`/connect?next=${encodeURIComponent(faucet)}`);
    expect(setupLink("/test-tokens", "/test-tokens", faucetSearch)).toBe(faucet);
    expect(setupLink("/test-tokens", "/connect", `?next=${encodeURIComponent(faucet)}`)).toBe(faucet);
  });
  it("allows cancellation to public setup but avoids guarded redirect loops", () => {
    expect(connectionBackPath(selection)).toBe(selection);
    expect(connectionBackPath("/test-tokens?next=%2Faccount")).toBe("/test-tokens?next=%2Faccount");
    for (const path of [
      "/account",
      "/positions",
      "/position/123",
      "/activate/123",
      "/underwriter/123",
      "/create-pool",
      "/activity",
    ])
      expect(connectionBackPath(path)).toBe("/markets");
    expect(connectionBackPath("https://evil.example")).toBe("/markets");
  });
});
