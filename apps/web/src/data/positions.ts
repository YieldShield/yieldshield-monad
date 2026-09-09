import { useMemo } from "react";
import useSWR from "swr";
import type { ProtectorPositionView, ShieldPositionView } from "@yieldshield/core";
import { reader, protocolDeployed } from "@/chain/adapter";
import { useWalletAddress } from "@/chain/wallet";
import { positionsKey } from "./keys";
import { usePools, type PoolView } from "./pools";

export type ShieldVM = ShieldPositionView & { view?: PoolView };
export type ProtectorVM = ProtectorPositionView & { view?: PoolView };

export type OwnerPositionsVM = {
  loading: boolean;
  error: string | null;
  shield: ShieldVM[];
  protector: ProtectorVM[];
};

/**
 * The connected wallet's positions, each enriched with its pool's display view. Raw positions are
 * SWR-cached per owner; the pool list comes from the shared `usePools` cache. Revalidated by
 * `useRefreshAll`.
 */
export function usePositions(): OwnerPositionsVM {
  const owner = useWalletAddress();
  const {
    data: raw,
    error,
    isLoading,
  } = useSWR(protocolDeployed ? positionsKey(owner) : null, () => reader.getOwnerPositions(owner!), {
    refreshInterval: 10000,
  });
  const { data: pools, loading: poolsLoading, error: poolsError } = usePools();

  const enriched = useMemo(() => {
    const byAddr = new Map(pools.map((p) => [p.address, p]));
    return {
      shield: (raw?.shield ?? []).map((p) => ({ ...p, view: byAddr.get(p.pool) })),
      protector: (raw?.protector ?? []).map((p) => ({ ...p, view: byAddr.get(p.pool) })),
    };
  }, [raw, pools]);

  return {
    loading: !!owner && (isLoading || poolsLoading),
    error: error ? String(error.message ?? error) : poolsError,
    ...(error || poolsError ? { shield: [], protector: [] } : enriched),
  };
}
