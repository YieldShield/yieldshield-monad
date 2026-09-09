import useSWR from "swr";
import type { PoolData } from "@yieldshield/core";
import { poolsKey } from "./keys";
import { presetForPool, type PoolPreset } from "@/config/pools";
import { reader, protocolDeployed } from "@/chain/adapter";

export type { TokenInfo } from "@yieldshield/core";

export type PoolView = PoolData & {
  preset: PoolPreset;
  /** Calm "paused for safety" — oracle disputed/stale, or the pool is inactive. */
  paused: boolean;
};

/** Load every on-chain pool and decorate it with this deploy's display preset. */
export async function loadPools(): Promise<PoolView[]> {
  const pools = await reader.loadPools();
  return pools.map((p) => ({
    ...p,
    preset: presetForPool(p.shielded.symbol, p.shielded.token, p.shielded.name),
    paused: p.oracle.paused || !p.stats.active,
  }));
}

type AsyncList<T> = { loading: boolean; error: string | null; data: T[] };

/** All pools (SWR-cached + deduped; revalidated by {@link useRefreshAll}). */
export function usePools(): AsyncList<PoolView> {
  const { data, error, isLoading } = useSWR(protocolDeployed ? poolsKey() : null, () => loadPools(), {
    refreshInterval: 15000,
  });
  return { loading: isLoading, error: error ? String(error.message ?? error) : null, data: error ? [] : (data ?? []) };
}

/** Global oracle health across all pools — drives the calm "paused for safety" chrome. */
export function useGlobalHealth(): { loading: boolean; paused: boolean; unavailable: boolean; error: string | null } {
  const { loading, error, data } = usePools();
  const unavailable = loading || !!error || data.length === 0;
  return { loading, error, unavailable, paused: unavailable || data.some((p) => p.paused) };
}

/** A single pool by address (derived from the cached list — no extra fetch). */
export function usePool(address?: string): { loading: boolean; error: string | null; pool: PoolView | null } {
  const { loading, error, data } = usePools();
  const pool = address ? (data.find((p) => p.address.toLowerCase() === address.toLowerCase()) ?? null) : null;
  return { loading, error, pool };
}
