import { useMemo } from "react";
import useSWR from "swr";
import type { ActivityEntry } from "@yieldshield/core";
import { reader } from "@/chain/adapter";
import { useWalletAddress } from "@/chain/wallet";
import { activityKey } from "./keys";
import { usePools } from "./pools";

export type ActivityVM = ActivityEntry & { symbol?: string; decimals?: number };

/** The connected wallet's real on-chain activity, enriched with token symbol/decimals from the
 * shared pools cache so amounts can be formatted. SWR-cached; revalidated by `useRefreshAll`. */
export function useActivity(): { loading: boolean; entries: ActivityVM[] } {
  const owner = useWalletAddress();
  const { data, isLoading } = useSWR(activityKey(owner), () => reader.getActivity(owner!));
  const { data: pools } = usePools();

  const entries = useMemo<ActivityVM[]>(() => {
    const byToken = new Map<string, { symbol: string; decimals: number }>();
    for (const p of pools) {
      byToken.set(p.shielded.token, p.shielded);
      byToken.set(p.backing.token, p.backing);
    }
    return (data ?? []).map((e) => {
      const t = e.token ? byToken.get(e.token) : undefined;
      return { ...e, symbol: t?.symbol, decimals: t?.decimals };
    });
  }, [data, pools]);

  return { loading: !!owner && isLoading, entries };
}
