import { useCallback, useRef, useState } from "react";
import { impl } from "@chain-impl";
import type { TxIntent, TxPhase, TxResult } from "@yieldshield/core";
import { useToast } from "@/components/Toast";
import { useRefreshAll } from "@/data/refresh";
import { chain } from "./adapter";

const { friendlyError, useIntentSender } = impl;
export { friendlyError };

/**
 * Transaction lifecycle the UI drives its pending/success states off of:
 * idle → building → submitted → confirming → confirmed | failed.
 */
export type TxState = {
  phase: TxPhase;
  txId: string | null;
  error: string | null;
  step?: { index: number; total: number; label: string; awaitingWallet?: boolean };
};

const IDLE: TxState = { phase: "idle", txId: null, error: null };

export type SubmitTx = ReturnType<typeof useSubmitTx>;

/**
 * Submit a chain-neutral tx intent through this deployment's adapter: build → sign with the
 * connected wallet → send → await confirmation. On confirmation the app-wide SWR caches are
 * revalidated and a toast (with an explorer link) is shown. Resolves the adapter's TxResult
 * (txId + any created position/pool id), or null on failure.
 */
export function useSubmitTx() {
  const { owner, send } = useIntentSender();
  const refreshAll = useRefreshAll();
  const { toast } = useToast();
  const [state, setState] = useState<TxState>(IDLE);
  const inFlight = useRef(false);
  const pending = state.phase === "building" || state.phase === "submitted" || state.phase === "confirming";

  const submit = useCallback(
    async (intent: TxIntent): Promise<TxResult | null> => {
      if (inFlight.current) return null;
      inFlight.current = true;
      setState({ phase: "building", txId: null, error: null });
      try {
        const result = await send(intent, {
          onPhase: (phase) => setState((current) => ({ ...current, phase, error: null })),
          onStep: (step) =>
            setState((current) => ({
              ...current,
              phase: step.txId ? current.phase : "building",
              step: { index: step.index, total: step.total, label: step.label, awaitingWallet: step.awaitingWallet },
              txId: step.txId ?? null,
              error: null,
            })),
        });
        setState({ phase: "confirmed", txId: result.txId, error: null });
        void refreshAll();
        toast({ kind: "success", message: `Confirmed on ${chain.label}`, href: chain.explorerTxUrl(result.txId) });
        return result;
      } catch (e) {
        const message = friendlyError(e);
        setState((current) => ({ ...current, phase: "failed", error: message }));
        // The action screen keeps one persistent error with its transaction link.
        return null;
      } finally {
        inFlight.current = false;
      }
    },
    [send, refreshAll, toast],
  );

  const reset = useCallback(() => setState(IDLE), []);
  return { ...state, pending, submit, reset, owner };
}
