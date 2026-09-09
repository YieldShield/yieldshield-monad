import useSWR from "swr";
import type { TokenId } from "@yieldshield/core";
import { reader } from "@/chain/adapter";
import { useWalletAddress } from "@/chain/wallet";
import { balanceKey } from "./keys";

/** The connected wallet's token balance (base units) for a token, SWR-cached; null if no account. */
export function useTokenBalance(token?: TokenId): { loading: boolean; balance: bigint | null } {
  const owner = useWalletAddress();
  const { data, error, isLoading } = useSWR(balanceKey(owner, token), () => reader.getTokenBalance(owner!, token!), {
    refreshInterval: 10000,
    keepPreviousData: false,
  });
  return { loading: !!owner && !!token && isLoading, balance: !owner || !token || error ? null : (data ?? null) };
}
