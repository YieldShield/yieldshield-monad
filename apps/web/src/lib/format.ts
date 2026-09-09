import { useEffect, useRef, useState } from "react";
import { fromBaseUnits } from "@yieldshield/core";

/** Format base units as a grouped decimal string (e.g. 1234567n @6 → "1.23"). */
export function formatAmount(raw: bigint, decimals: number, maxFrac = 2): string {
  const full = fromBaseUnits(raw, decimals);
  const [whole = "0", frac = ""] = full.split(".");
  const groupedWhole = whole === "-0" ? "-0" : BigInt(whole).toLocaleString("en-US");
  const trimmed = frac.slice(0, maxFrac).replace(/0+$/, "");
  return trimmed ? `${groupedWhole}.${trimmed}` : groupedWhole;
}

/** Format a token amount with its symbol (e.g. "1,200 USDC"). */
export function formatToken(raw: bigint, decimals: number, symbol: string, maxFrac = 2): string {
  return `${formatAmount(raw, decimals, maxFrac)} ${symbol}`;
}

/** Format basis points as a percentage string (1000n → "10%", 712 → "7.12%"). */
export function formatBps(bps: bigint | number | null, maxFrac = 2): string {
  if (bps === null) return "—";
  const pct = Number(bps) / 100;
  return `${trimNum(pct, maxFrac)}%`;
}

/** Format a percentage number (7.1 → "7.1%"). */
export function formatPct(pct: number, maxFrac = 1): string {
  return `${trimNum(pct, maxFrac)}%`;
}

/** Format a USD value carried at 8 decimals (smart-scaled for large pools: $6.4M). */
export function formatUsd8(raw: bigint): string {
  const v = Number(raw) / 1e8;
  if (v >= 1_000_000) return `$${trimNum(v / 1_000_000, 1)}M`;
  if (v >= 1_000) return `$${trimNum(v / 1_000, 1)}k`;
  return `$${trimNum(v, 2)}`;
}

function trimNum(n: number, maxFrac: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFrac });
}

/** A date label from a unix-seconds bigint (e.g. "12 Jul 2026"). */
export function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Relative time from a unix-seconds timestamp (e.g. "2h ago", "3d ago", "just now"). */
export function formatRelative(unixSeconds: number): string {
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2_592_000) return `${Math.floor(diff / 86_400)}d ago`;
  return formatDate(BigInt(unixSeconds));
}

/** Exact duration in whole seconds; never rounds a notice to an earlier or later day. */
export function formatDuration(seconds: bigint): string {
  if (seconds <= 0n) return "0 seconds";
  const units = [
    [86400n, "day"],
    [3600n, "hour"],
    [60n, "minute"],
    [1n, "second"],
  ] as const;
  let remaining = seconds;
  const parts: string[] = [];
  for (const [size, label] of units) {
    const count = remaining / size;
    remaining %= size;
    if (count > 0n) parts.push(`${count} ${label}${count === 1n ? "" : "s"}`);
  }
  return parts.join(" ");
}

/** Cubic-ease-out count-up that animates a number from 0 → target on mount/change (~850ms). */
export function useCountUp(target: number, durationMs = 850): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number>();
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const startVal = from.current;
    const animate = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = startVal + (target - startVal) * eased;
      setValue(next);
      if (t < 1) frame.current = requestAnimationFrame(animate);
      else from.current = target;
    };
    frame.current = requestAnimationFrame(animate);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);
  return value;
}
