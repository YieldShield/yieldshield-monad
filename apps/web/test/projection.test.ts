import { describe, expect, it } from "vitest";
import { projectThirtyYears } from "@/lib/projection";

describe("projection", () => {
  it("matches the ordinary-annuity future value", () => {
    const p = projectThirtyYears(200);
    const r = 0.071 / 12;
    const fv = 200 * ((Math.pow(1 + r, 360) - 1) / r);
    expect(p.futureValue).toBeCloseTo(fv, 2);
    expect(p.contributions).toBe(200 * 360);
    expect(p.growth).toBeCloseTo(fv - 200 * 360, 2);
  });

  it("has 31 yearly points starting at 0", () => {
    const p = projectThirtyYears(500);
    expect(p.points).toHaveLength(31);
    expect(p.points[0].value).toBe(0);
    expect(p.points[30].value).toBeCloseTo(p.futureValue, 2);
  });
});
