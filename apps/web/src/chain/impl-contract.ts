import type { ComponentType, ReactNode } from "react";
import type { AccountId, ChainAdapter, FaucetApi, IntentSenderApi, WalletConnectionApi } from "@yieldshield/core";

/**
 * The surface every chain implementation module must export as `impl`. Which module backs the
 * `@chain-impl` alias is decided at BUILD TIME in vite.config.ts (VITE_CHAIN_FAMILY), so each
 * deployment bundles exactly one adapter — the other chain's packages never ship.
 */
export type ChainImpl = {
  adapter: ChainAdapter;
  ChainProvider: ComponentType<{ children: ReactNode }>;
  useWalletAddress: () => AccountId | null;
  useWalletConnection: () => WalletConnectionApi;
  useIntentSender: () => IntentSenderApi;
  /** Test-token faucet: on-chain drip tx on EVM testnets, HTTP drip service on Solana devnet. */
  useFaucet: () => FaucetApi;
  friendlyError: (e: unknown) => string;
};
