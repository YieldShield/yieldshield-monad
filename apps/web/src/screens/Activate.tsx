import { useEffect, useState } from "react";
import useSWR from "swr";
import { reader } from "@/chain/adapter";
import { useNavigate, useParams } from "react-router-dom";
import { minReceived } from "@yieldshield/core";
import { Row } from "@/components/Expander";
import { ShieldIcon } from "@/components/icons";
import { PendingOverlay, SuccessCard, TransactionError } from "@/components/TxFeedback";
import { Button, Card } from "@/components/ui";
import { formatToken } from "@/lib/format";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { usePositions, type ShieldVM } from "@/data/positions";
import { sessionTime } from "@/lib/protection-status";
import { VOCAB } from "@/vocab";

export function Activate() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [completed, setCompleted] = useState(false);
  const { loading, error: loadError, shield } = usePositions();
  const position = shield.find((p) => p.id === id);

  if (completed)
    return (
      <>
        <SuccessCard accent="senior" title="Protected exit confirmed.">
          Check the confirmed receipt and your wallet for the exact amount received.
        </SuccessCard>
        <Button variant="senior" full className="mt-5" onClick={() => navigate("/positions")}>
          Done
        </Button>
      </>
    );
  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (loadError)
    return (
      <Card>
        <p role="alert">Position data or pricing is unavailable. Refresh before continuing.</p>
      </Card>
    );
  if (!position || !position.view)
    return (
      <Card>
        <p className="text-body">This position isn't available.</p>
      </Card>
    );
  return <ActivatePanel p={position} onClose={() => navigate(-1)} onDone={() => setCompleted(true)} />;
}

function ActivatePanel({ p, onClose, onDone }: { p: ShieldVM; onClose: () => void; onDone: () => void }) {
  const tx = useSubmitTx();

  const backing = p.view!.backing;
  const shielded = p.view!.shielded;

  const {
    data: quote,
    error: quoteError,
    isLoading: quoting,
    mutate,
  } = useSWR(
    ["protected-exit-quote", p.id, tx.owner],
    async () => {
      if (!reader.getProtectedExitQuote) throw new Error("A verified exit quote is unavailable on this deployment.");
      return reader.getProtectedExitQuote(p.id);
    },
    { refreshInterval: 10000, revalidateOnFocus: true },
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const fresh =
    quote &&
    !quoteError &&
    quote.token.toLowerCase() === backing.token.toLowerCase() &&
    now - Number(quote.quotedAt) * 1000 < 30000 &&
    now >= Number(quote.quotedAt) * 1000;
  const estReceive = quote?.amount ?? 0n;
  const minOut = minReceived(estReceive);
  const canConfirm = !!fresh && minOut > 0n && p.protectedExitUnlocked && !tx.pending;

  async function confirm() {
    if (!canConfirm || !quote || Date.now() - Number(quote.quotedAt) * 1000 >= 30000) return;
    const res = await tx.submit({
      kind: "activateShielded",
      pool: p.pool,
      shieldedToken: shielded.token,
      backingToken: backing.token,
      position: p.id,
      minOut,
    });
    if (res) onDone();
  }

  return (
    <div className="mx-auto max-w-[560px]">
      <div className="animate-fade-up rounded-hero bg-green-tint-2 p-6 md:p-8">
        {tx.pending && (
          <PendingOverlay
            accent="senior"
            label="Confirming backing-token exit…"
            phase={tx.phase}
            step={tx.step}
            txId={tx.txId}
          />
        )}

        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-pill bg-green-tint text-green-dark">
          <ShieldIcon className="h-7 w-7" />
        </div>
        <h1 className="page-title">Exit with protection</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-green-dark/90">
          Exchange your entire position for {backing.symbol}. You surrender its assets. The payout uses the recorded
          entry value and the position’s collateral cap. The token may depeg. Payouts depend on collateral, pricing and
          contract checks.
        </p>

        <Card className="mt-5 border-none">
          <Row label="Position tokens" value={formatToken(p.deposited, shielded.decimals, shielded.symbol)} />
          <Row
            label="Quoted payout"
            value={fresh ? `≈ ${formatToken(estReceive, backing.decimals, backing.symbol)}` : "Unavailable"}
            tone="green"
          />
          <Row
            label="Minimum received"
            value={fresh ? formatToken(minOut, backing.decimals, backing.symbol) : "Unavailable"}
            tone="muted"
          />
          <Row
            label="Availability"
            value={
              p.protectedExitUnlocked
                ? "Time gate passed · other checks apply"
                : `From ${sessionTime(Number(p.protectedExitUnlockTime))}`
            }
            tone="muted"
          />
        </Card>

        <p className="mt-3 text-[13px] leading-relaxed text-green-dark">
          Contract or oracle failures can prevent settlement.
        </p>
        {(!fresh || quoting) && (
          <p role="status" className="mt-3 text-[13px] text-amber-deep">
            {quoting
              ? "Checking the on-chain quote…"
              : quoteError instanceof Error
                ? quoteError.message
                : "A fresh verified quote is unavailable. The exit is disabled."}
          </p>
        )}
        <button className="mt-2 text-[13px] font-semibold underline" onClick={() => void mutate()}>
          Refresh quote
        </button>
        <TransactionError error={tx.error} txId={tx.txId} />

        <div className="mt-5 flex flex-col gap-3">
          <Button variant="senior" full onClick={confirm} disabled={!canConfirm}>
            {p.protectedExitUnlocked ? VOCAB.activate : `Unlocks ${sessionTime(Number(p.protectedExitUnlockTime))}`}
          </Button>
          <Button variant="ghost" full onClick={onClose}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}
