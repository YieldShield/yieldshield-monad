import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { DATA_KEY_NAMES } from "./keys";

/**
 * Returns a function that revalidates every app-owned SWR dataset (pools, positions, balances,
 * activity). Call it after a confirmed transaction so the whole UI reflects new on-chain state
 * without a manual reload — including screens that stay mounted.
 */
export function useRefreshAll(): () => Promise<unknown> {
  const { mutate } = useSWRConfig();
  return useCallback(
    () => mutate((key) => Array.isArray(key) && typeof key[0] === "string" && DATA_KEY_NAMES.has(key[0])),
    [mutate],
  );
}
