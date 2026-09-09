import { describe, expect, it } from "vitest";
import { formatAmount, formatBps, formatDuration, formatPct, formatRelative, formatUsd8 } from "@/lib/format";

describe("format", () => {
  it("formatAmount groups + trims fraction", () => {
    expect(formatAmount(1234567000n, 6)).toBe("1,234.56");
    expect(formatAmount(1000000n, 6)).toBe("1");
    expect(formatAmount(0n, 6)).toBe("0");
  });

  it("formatBps", () => {
    expect(formatBps(1000n)).toBe("10%");
    expect(formatBps(712)).toBe("7.12%");
    expect(formatBps(null)).toBe("—");
  });

  it("formatPct", () => {
    expect(formatPct(7.1)).toBe("7.1%");
  });

  it("formatUsd8 scales", () => {
    expect(formatUsd8(640000000000000n)).toBe("$6.4M");
    expect(formatUsd8(100000000n)).toBe("$1");
  });

  it("formatDuration", () => {
    expect(formatDuration(2419200n)).toBe("28 days");
    expect(formatDuration(86400n)).toBe("1 day");
    expect(formatDuration(60n)).toBe("1 minute");
    expect(formatDuration(59n)).toBe("59 seconds");
    expect(formatDuration(129600n)).toBe("1 day 12 hours");
    expect(formatDuration(3661n)).toBe("1 hour 1 minute 1 second");
    expect(formatDuration(0n)).toBe("0 seconds");
  });

  it("formatRelative", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(formatRelative(now)).toBe("just now");
    expect(formatRelative(now - 7200)).toBe("2h ago");
    expect(formatRelative(now - 3 * 86400)).toBe("3d ago");
  });
});

it("preserves integer precision and very small token holdings", () => {
  expect(formatAmount(9007199254740993n, 0, 0)).toBe("9,007,199,254,740,993");
  expect(formatAmount(1n, 18, 18)).toBe("0.000000000000000001");
  expect(formatAmount(-1n, 8, 8)).toBe("-0.00000001");
});
