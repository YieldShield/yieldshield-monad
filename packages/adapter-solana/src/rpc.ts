import { createSolanaRpc } from "@solana/kit";

/** The full kit RPC the SDK read models and intent builders consume. */
export type SolanaRpc = ReturnType<typeof createSolanaRpc>;

export function makeRpc(url: string): SolanaRpc {
  return createSolanaRpc(url);
}
