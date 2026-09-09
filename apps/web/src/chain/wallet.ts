import { impl } from "@chain-impl";

/** Wallet hooks in the port's chain-neutral shape (see @yieldshield/core WalletConnectionApi). */
export const useWalletAddress = impl.useWalletAddress;
export const useWalletConnection = impl.useWalletConnection;

/** Truncate an address for display: `7Y1X…L5VL`. */
export function shortAddress(addr: string, lead = 4, tail = 4): string {
  return addr.length <= lead + tail ? addr : `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}
