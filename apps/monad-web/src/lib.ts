import { formatUnits, parseUnits } from "viem";
import type { Market } from "./types";
export const fmt = (v: string | bigint | undefined | null, decimals = 6, digits = 2) =>
  v == null
    ? "—"
    : Number(formatUnits(BigInt(v), decimals)).toLocaleString("en-US", {
        maximumFractionDigits: digits,
        minimumFractionDigits: digits,
      });
export const usd = (v: string | bigint | undefined | null) =>
  v == null ? "—" : "$" + fmt(v, 8, Number(BigInt(v)) < 1e8 ? 4 : 2);
export const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);
export function amount(text: string, decimals: number) {
  if (!/^\d+(\.\d*)?$/.test(text) || text.split(".")[1]?.length > decimals)
    throw new Error(`Enter an amount with up to ${decimals} decimals.`);
  const value = parseUnits(text, decimals);
  if (value <= 0n) throw new Error("Enter an amount greater than zero.");
  return value;
}
export const minOut = (n: bigint) => (n * 995n) / 1000n || 1n;
export function netAsset(
  amount: bigint,
  entry: bigint,
  baseline: bigint,
  price: bigint,
  decimals: number,
  feeBps: readonly bigint[],
) {
  if (price <= 0n) throw new Error("A current price is needed to preview fees.");
  const current = (amount * price) / 10n ** BigInt(decimals);
  const base = baseline || entry;
  const gain = current > base ? current - base : 0n;
  const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
  const fees = feeBps.reduce((sum, bps) => sum + ceil(ceil(gain * bps, 10000n) * 10n ** BigInt(decimals), price), 0n);
  return fees >= amount ? 0n : amount - fees;
}
export const explorer = (kind: "tx" | "address", a: string) => `https://testnet.monadexplorer.com/${kind}/${a}`;
export function apiRequestUrl(path: string, origin = globalThis.location?.origin) {
  // Production visitors reach Railway directly so its edge sees each client's IP.
  // Keep SWR keys relative and retain the same-origin proxy for local/preview builds.
  return origin === "https://monad.yieldshield.ai" && path.startsWith("/api/")
    ? `https://monad-api.yieldshield.ai${path}`
    : path;
}
export async function fetcher(url: string) {
  const r = await fetch(apiRequestUrl(url));
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Unable to load verified data.");
  return d;
}
export function errorMessage(e: unknown) {
  const x = e as { shortMessage?: string; message?: string; code?: number };
  if (x.code === 4001 || /rejected|denied/i.test(x.shortMessage || x.message || ""))
    return "Request declined in your wallet. You can try again.";
  return (x.shortMessage || x.message || "Transaction could not be completed.").slice(0, 240);
}

// The receipt stores maturity, not the timestamp the notice was requested.
export function noticeState(maturity: string | undefined, now: number) {
  const readyAt = Number(maturity || 0) * 1000;
  return {
    readyAt,
    active: readyAt > 0 && now >= readyAt && now <= readyAt + 7 * 86400000,
    expired: readyAt > 0 && now > readyAt + 7 * 86400000,
  };
}

export const percent = (bps: string | bigint | undefined) => (bps == null ? "—" : `${formatUnits(BigInt(bps), 2)}%`);
export function marketTerms(m: Market | undefined) {
  if (!m || m.collateralBps == null || m.juniorFeeBps == null || m.creatorFeeBps == null || m.protocolFeeBps == null)
    return null;
  const feeBps = [BigInt(m.juniorFeeBps), BigInt(m.creatorFeeBps), BigInt(m.protocolFeeBps)] as const;
  return { collateralBps: BigInt(m.collateralBps), feeBps, totalFeeBps: feeBps.reduce((a, b) => a + b, 0n) };
}
export function backingReserve(entryUsd: bigint, collateralBps: bigint, price: bigint, decimals: number) {
  if (price <= 0n) throw new Error("Backing price unavailable.");
  return (((entryUsd * collateralBps + 9999n) / 10000n) * 10n ** BigInt(decimals)) / price;
}
export function duration(seconds: string | number | undefined) {
  if (seconds == null) return "—";
  const value = Number(seconds);
  for (const [unit, divisor] of [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ] as const) {
    if (value > 0 && value % divisor === 0) return `${value / divisor} ${unit}${value / divisor === 1 ? "" : "s"}`;
  }
  return `${value} second${value === 1 ? "" : "s"}`;
}
