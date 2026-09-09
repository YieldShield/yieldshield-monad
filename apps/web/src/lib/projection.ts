/**
 * 30-year compounding projection — future value of an ordinary annuity.
 * Formula from the design handoff (README §Home-empty): r = apy/12, n = 360 months,
 * FV = m·((1+r)^n − 1) / r. Chart point at year y uses k = y·12 months (0 at k=0).
 */
export const PROJECTION_APY = 0.071; // 7.1% protected APY headline

export type Projection = {
  monthly: number;
  futureValue: number;
  contributions: number;
  growth: number;
  points: { year: number; value: number; contributed: number }[];
};

export function projectThirtyYears(monthly: number, apy = PROJECTION_APY, years = 30): Projection {
  const r = apy / 12;
  const n = years * 12;
  const fv = monthly * ((Math.pow(1 + r, n) - 1) / r);
  const contributions = monthly * n;
  const points = Array.from({ length: years + 1 }, (_, y) => {
    const k = y * 12;
    const value = k === 0 ? 0 : monthly * ((Math.pow(1 + r, k) - 1) / r);
    return { year: y, value, contributed: monthly * k };
  });
  return { monthly, futureValue: fv, contributions, growth: fv - contributions, points };
}

export const MONTHLY_OPTIONS = [100, 200, 500, 1000] as const;
