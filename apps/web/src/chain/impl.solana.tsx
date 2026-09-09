/** Solana chain implementation — bundled when VITE_CHAIN_FAMILY is "solana" (the default). */
import type { ReactNode } from "react";
import type { AccountId, FaucetApi, FaucetResult } from "@yieldshield/core";
import {
  createSolanaAdapter,
  friendlyError,
  SolanaChainProvider,
  useIntentSender,
  useWalletAddress,
  useWalletConnection,
} from "@yieldshield/adapter-solana";
import type { ChainImpl } from "./impl-contract";

/** Operator-run drip service (holds the mint authority); unset → faucet hidden. */
const FAUCET_URL: string | undefined = import.meta.env.VITE_FAUCET_URL || undefined;

const adapter = createSolanaAdapter({
  rpcUrl: import.meta.env.VITE_RPC_URL ?? "http://127.0.0.1:8899",
  wsUrl: import.meta.env.VITE_WS_URL,
  poolProgramId: import.meta.env.VITE_POOL_PROGRAM_ID,
  oracleProgramId: import.meta.env.VITE_ORACLE_PROGRAM_ID,
  faucet: !!FAUCET_URL,
});

function ChainProvider({ children }: { children: ReactNode }) {
  return <SolanaChainProvider adapter={adapter}>{children}</SolanaChainProvider>;
}

async function requestDrip(recipient: AccountId): Promise<FaucetResult> {
  if (!FAUCET_URL) return { ok: false, error: "Faucet isn't configured for this network." };
  try {
    const res = await fetch(`${FAUCET_URL.replace(/\/$/, "")}/drip`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `Faucet error (${res.status}).` };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't reach the faucet. Is the service running?" };
  }
}

function useFaucet(): FaucetApi {
  return { enabled: !!FAUCET_URL, drip: requestDrip };
}

export const impl = {
  adapter,
  ChainProvider,
  useWalletAddress,
  useWalletConnection,
  useIntentSender,
  useFaucet,
  friendlyError,
} satisfies ChainImpl;
