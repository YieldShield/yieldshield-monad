import useSWR from "swr";
import type { SeedToken } from "@yieldshield/core";
import { reader } from "@/chain/adapter";
import { whitelistKey } from "./keys";

/** A selectable token from the protocol whitelist — the seed set pools can be built from. */
export type { SeedToken } from "@yieldshield/core";

type AsyncList<T> = { loading: boolean; error: string | null; data: T[] };

/** Whitelisted tokens (SWR-cached; revalidated by {@link useRefreshAll}). */
export function useWhitelistedTokens(): AsyncList<SeedToken> {
  const { data, error, isLoading } = useSWR(whitelistKey(), () => reader.listWhitelistedTokens());
  return { loading: isLoading, error: error ? String(error.message ?? error) : null, data: data ?? [] };
}
