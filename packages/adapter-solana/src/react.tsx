/**
 * React surface of the Solana adapter: the chain provider plus hooks matching the port's
 * `WalletConnectionApi` / `IntentSenderApi` shapes. The web app imports these through its
 * `src/chain/` seam — never from @solana/* directly.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { createWalletTransactionSigner } from "@solana/client";
import type { Signature, TransactionSigner } from "@solana/kit";
import {
  SolanaProvider,
  useSendTransaction,
  useWalletConnection as useKitWalletConnection,
  useWalletSession,
} from "@solana/react-hooks";
import type {
  AccountId,
  IntentSenderApi,
  SendOptions,
  TxIntent,
  TxResult,
  WalletConnectionApi,
} from "@yieldshield/core";
import type { SolanaAdapter } from "./adapter.js";
import { buildIntent } from "./intents.js";
import type { SolanaRpc } from "./rpc.js";

const AdapterContext = createContext<SolanaAdapter | null>(null);

/** Mounts the framework-kit provider and exposes the adapter to the hooks below. */
export function SolanaChainProvider({ adapter, children }: { adapter: SolanaAdapter; children: ReactNode }) {
  return (
    <SolanaProvider client={adapter.client}>
      <AdapterContext.Provider value={adapter}>{children}</AdapterContext.Provider>
    </SolanaProvider>
  );
}

export function useAdapter(): SolanaAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error("SolanaChainProvider is not mounted");
  return adapter;
}

/** The connected wallet's address, or null when disconnected. */
export function useWalletAddress(): AccountId | null {
  const session = useWalletSession();
  return session ? session.account.address.toString() : null;
}

/** Wallet connection state/actions in the port's chain-neutral shape. */
export function useWalletConnection(): WalletConnectionApi {
  const { connected, isReady, connectors, connect, connecting, wallet, disconnect } = useKitWalletConnection();
  return {
    isReady,
    connected,
    connecting,
    address: wallet ? wallet.account.address.toString() : null,
    walletName: wallet?.connector.name ?? null,
    connectors: connectors.map((c) => ({ id: c.id, name: c.name })),
    connect: async (connectorId: string) => {
      try {
        await connect(connectorId);
      } catch (e) {
        // Session restoration (walletPersistence) can race a manual click — an
        // already-connected wallet is success, not an error.
        if (e instanceof Error && /already connected/i.test(e.message)) return;
        throw e;
      }
    },
    disconnect,
  };
}

/**
 * Intent submission: build (SDK action) → sign with the connected wallet → send → await on-chain
 * confirmation. The SAME signer instance is used as the fee payer (framework-kit rejects two
 * distinct signer instances for one address). Throws on failure — map with `friendlyError`.
 */
export function useIntentSender(): IntentSenderApi {
  const adapter = useAdapter();
  const session = useWalletSession();
  const { send: sendTransaction } = useSendTransaction();

  const owner = session ? session.account.address.toString() : null;
  const signer = useMemo<TransactionSigner | null>(
    () => (session ? createWalletTransactionSigner(session).signer : null),
    [session],
  );

  const send = useCallback(
    async (intent: TxIntent, opts?: SendOptions): Promise<TxResult> => {
      if (!signer) throw new Error("Connect a wallet to continue.");
      opts?.onPhase?.("building");
      const { instructions, created } = await buildIntent(adapter.rpc, signer, intent);
      opts?.onPhase?.("submitted");
      const signature = await sendTransaction({ instructions, feePayer: signer });
      opts?.onPhase?.("confirming");
      await waitForConfirmation(adapter.rpc, signature);
      return { txId: signature.toString(), ...created };
    },
    [adapter, signer, sendTransaction],
  );

  return { owner, send };
}

/** Poll signature status until confirmed/finalized (the app's RPC, not the wallet's). */
async function waitForConfirmation(rpc: SolanaRpc, signature: Signature, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status) {
      if (status.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
      if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("blockhash confirmation timed out");
}
