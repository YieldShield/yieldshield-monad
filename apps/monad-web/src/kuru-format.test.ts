import { describe, expect, it } from "vitest";
import { formatKuruAmount } from "./kuru-format";

describe("Kuru quote and withdrawal amount presentation", () => {
  it("distinguishes estimated MON from its smaller minimum without rounding upward", () => {
    expect(formatKuruAmount(99930000000000000n, 18)).toBe("0.09993");
    expect(formatKuruAmount(99430350000000000n, 18)).toBe("0.09943035");
  });
  it("shows all USDC precision so reviewed spend and tiny remainders remain visible", () => {
    expect(formatKuruAmount(9999996n, 6)).toBe("9.999996");
    expect(formatKuruAmount(4n, 6)).toBe("0.000004");
  });
  it("never labels a nonzero withdrawable amount as zero or missing data as a balance", () => {
    expect(formatKuruAmount(1n, 18)).toBe("0.000000000000000001");
    expect(formatKuruAmount(0n, 18)).toBe("0");
    expect(formatKuruAmount(undefined, 18)).toBe("—");
  });
});
