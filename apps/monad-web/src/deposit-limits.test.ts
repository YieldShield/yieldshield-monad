import { describe, expect, it } from "vitest";
import { depositLimitError } from "./deposit-limits";

const config = ["1000000000000000", "100000000000000000000", "10000", "1000000000"];
const shield = { decimals: 18, symbol: "WMON" };
const backing = { decimals: 6, symbol: "TestUSDC" };

describe("deposit limits before wallet approval", () => {
  it("uses the protected-token limits in their native decimals", () => {
    expect(depositLimitError(999999999999999n, "senior", config, shield)).toBe("Minimum deposit: 0.001 WMON.");
    expect(depositLimitError(100000000000000000001n, "senior", config, shield)).toBe("Maximum deposit: 100 WMON.");
  });

  it("uses independent backing limits for liquidity deposits", () => {
    expect(depositLimitError(9999n, "junior", config, backing)).toBe("Minimum deposit: 0.01 TestUSDC.");
    expect(depositLimitError(1000000001n, "junior", config, backing)).toBe("Maximum deposit: 1000 TestUSDC.");
  });

  it("accepts both exact boundaries without rounding base units", () => {
    for (const value of [1000000000000000n, 100000000000000000000n])
      expect(depositLimitError(value, "senior", config, shield)).toBe("");
    for (const value of [10000n, 1000000000n]) expect(depositLimitError(value, "junior", config, backing)).toBe("");
    expect(depositLimitError(1n, "senior", ["2", "10"], shield)).toBe("Minimum deposit: 0.000000000000000002 WMON.");
  });

  it("does not substitute permissive limits when pool data is missing or malformed", () => {
    for (const invalid of [undefined, [], ["1"], ["1", "bad"], ["-1", "10"], ["10", "1"]])
      expect(depositLimitError(2n, "senior", invalid, shield)).toContain("limits unavailable");
    expect(depositLimitError(2n, "junior", ["1", "10"], backing)).toContain("limits unavailable");
  });
});
