/**
 * Pure money helpers shared by every chain: unit/decimal handling and slippage floors.
 * All on-chain amounts are unsigned integers (bigint). USD values are 8-decimal.
 */

/** USD values (prices, TVL caps, position values) carry 8 decimals on every chain. */
export const USD_DECIMALS = 8;

/** Default slippage floor applied to deposits/withdrawals: 0.5% → accept ≥ 0.995×. */
export const DEFAULT_SLIPPAGE_BPS = 50;

const BPS_DENOM = 10_000n;

/** Convert a human decimal string/number to base units for an asset with `decimals`. */
export function toBaseUnits(amount: string | number, decimals: number): bigint {
  const s = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") {
    throw new Error(`invalid amount: ${JSON.stringify(amount)}`);
  }
  const [whole, frac = ""] = s.split(".");
  if (frac.length > decimals) {
    throw new Error(`amount ${s} has more than ${decimals} fractional digits`);
  }
  const padded = frac.padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/** Format base units as a human decimal string for an asset with `decimals` (no thousands separators). */
export function fromBaseUnits(raw: bigint, decimals: number): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  const body = fracStr ? `${whole}.${fracStr}` : `${whole}`;
  return negative ? `-${body}` : body;
}

/** Apply a basis-point rate to an integer amount, rounding down. */
export function applyBps(amount: bigint, bps: bigint | number): bigint {
  return (amount * BigInt(bps)) / BPS_DENOM;
}

/**
 * Slippage floor: the minimum out-amount to accept. Default 0.5% → 0.995× (rounded down).
 * Pass `0` to disable (exact-or-nothing is rarely what you want on-chain).
 */
export function minReceived(amount: bigint, slippageBps: number = DEFAULT_SLIPPAGE_BPS): bigint {
  if (slippageBps < 0 || slippageBps >= 10_000) throw new Error(`slippageBps out of range: ${slippageBps}`);
  return (amount * (BPS_DENOM - BigInt(slippageBps))) / BPS_DENOM;
}
