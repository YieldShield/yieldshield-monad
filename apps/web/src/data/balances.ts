import useSWR from "swr";
import type { TokenBalance } from "@yieldshield/core";
import { reader } from "@/chain/adapter";
import { useWalletAddress } from "@/chain/wallet";

export type { TokenBalance } from "@yieldshield/core";

/**
 * The connected wallet's balance of every whitelisted (YieldShield-relevant) token. Tokens the user
 * doesn't hold appear with a 0 balance so the full opted-in set is always visible.
 */
export function useWhitelistedBalances(): {
  loading: boolean;
  balances: TokenBalance[];
  error: string | null;
  refresh: () => void;
} {
  const owner = useWalletAddress();
  const { data, error, isLoading, mutate } = useSWR(
    owner ? (["wl-balances", owner] as const) : null,
    () => reader.getBalances(owner!),
    { refreshInterval: 10000, revalidateOnFocus: true, keepPreviousData: false },
  );
  return {
    loading: !!owner && isLoading,
    balances: !owner || error ? [] : (data ?? []),
    error: error ? String(error.message ?? error) : null,
    refresh: () => void mutate(),
  };
}
