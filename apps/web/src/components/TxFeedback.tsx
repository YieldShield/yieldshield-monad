import { chain } from "@/chain/adapter";
import type { TxPhase } from "@yieldshield/core";
import type { ReactNode } from "react";
import { CheckIcon } from "@/components/icons";
import { Spinner } from "@/components/ui";

/** Full-bleed pending state shown while a transaction is submitted/confirming. */
export function PendingOverlay({
  label = "Confirming…",
  step,
  txId,
  phase,
  accent = "neutral",
}: {
  label?: string;
  step?: { index: number; total: number; label: string; awaitingWallet?: boolean };
  txId?: string | null;
  phase?: TxPhase;
  accent?: "senior" | "junior" | "neutral";
}) {
  const color = { senior: "text-senior", junior: "text-junior", neutral: "text-ink" }[accent];
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-canvas/95 px-6 text-center backdrop-blur-sm"
    >
      <Spinner className={`h-9 w-9 ${color}`} />
      {step && (
        <p className={`text-[12px] font-bold uppercase tracking-wider ${color}`}>
          Step {step.index} of {step.total}
        </p>
      )}
      <p className="text-[20px] font-bold text-ink">{step?.label ?? label}</p>
      <p className="max-w-[42ch] text-[14px] leading-relaxed text-body">
        {phase === "building"
          ? step?.awaitingWallet
            ? "Review this request in your wallet. If no window appears, open your wallet extension. Reject the request there to cancel."
            : "Checking the current action before requesting your wallet approval…"
          : "Waiting for the transaction to be confirmed on Base Sepolia. Don’t submit it again."}
      </p>
      {txId && (
        <a
          href={chain.explorerTxUrl(txId)}
          target="_blank"
          rel="noreferrer"
          className={`text-[14px] font-bold underline ${color}`}
        >
          View transaction progress ↗
        </a>
      )}
    </div>
  );
}

export function TransactionError({ error, txId }: { error: string | null; txId?: string | null }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="mt-4 rounded-input border border-amber-border bg-amber-tint p-4 text-[13px] leading-relaxed text-amber-deep"
    >
      <p>{error}</p>
      {txId && (
        <a
          href={chain.explorerTxUrl(txId)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block font-bold underline"
        >
          Check the last transaction before retrying ↗
        </a>
      )}
    </div>
  );
}

/** Success state with a check pop. `accent` identifies the position role; general success is neutral. */
export function SuccessCard({
  accent = "neutral",
  title,
  children,
}: {
  accent?: "senior" | "junior" | "neutral" | "green" | "indigo";
  title: string;
  children: ReactNode;
}) {
  const tint = {
    senior: "bg-senior-tint text-senior-dark",
    junior: "bg-junior-tint text-junior",
    neutral: "bg-subtle-2 text-ink",
    green: "bg-senior-tint text-senior-dark",
    indigo: "bg-junior-tint text-junior",
  }[accent];
  return (
    <div className="animate-fade-up flex flex-col items-center pt-6 text-center">
      <div className={`mb-5 flex h-16 w-16 animate-pop items-center justify-center rounded-pill ${tint}`}>
        <CheckIcon className="h-8 w-8" />
      </div>
      <h1 className="text-[26px] font-extrabold tracking-tight2">{title}</h1>
      <div className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-body">{children}</div>
    </div>
  );
}
