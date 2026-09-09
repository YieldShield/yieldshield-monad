import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { minReceived } from "@yieldshield/core";
import { Row } from "@/components/Expander";
import { TransactionError, PendingOverlay, SuccessCard } from "@/components/TxFeedback";
import { AssetGlyph, Button, buttonStyles, Card, Pill } from "@/components/ui";
import { formatToken, formatUsd8 } from "@/lib/format";
import { sessionTime } from "@/lib/protection-status";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { chain } from "@/chain/adapter";
import { useProtectionStatus } from "@/data/protection-status";
import { usePositions, type ShieldVM } from "@/data/positions";

export function PositionDetail() {
  const { id } = useParams();
  const [completed, setCompleted] = useState<string | null>(null);
  const { loading, error, shield } = usePositions();
  const position = shield.find((p) => p.id === id);
  if (completed)
    return (
      <>
        <SuccessCard accent="senior" title="Asset withdrawal confirmed.">
          Your position is closed. Check your wallet and the receipt for the tokens received.
        </SuccessCard>
        <a
          href={chain.explorerTxUrl(completed)}
          target="_blank"
          rel="noreferrer"
          className="mt-5 block text-center font-bold text-senior underline"
        >
          View transaction
        </a>
        <Link to="/positions" className={buttonStyles({ variant: "senior", full: true, className: "mt-5" })}>
          My positions
        </Link>
      </>
    );
  if (loading)
    return (
      <div role="status" className="p-6 text-body">
        Reading your position…
      </div>
    );
  if (error)
    return (
      <Card>
        <p role="alert">
          Your position could not be checked. Refresh to retrieve its recorded terms and current exit quotes.
        </p>
      </Card>
    );
  if (!position || !position.view)
    return (
      <Card>
        <p>This position was not found for your wallet.</p>
        <Link to="/positions" className="mt-4 inline-block font-bold text-senior">
          My positions
        </Link>
      </Card>
    );
  return (
    <div>
      <Link to="/positions" className="mb-6 inline-block text-[13px] font-bold text-body">
        ← My positions
      </Link>
      <Position p={position} onDone={setCompleted} />
    </div>
  );
}

function Position({ p, onDone }: { p: ShieldVM; onDone: (hash: string) => void }) {
  const tx = useSubmitTx();
  const { now } = useProtectionStatus();
  const [review, setReview] = useState(false);
  const pool = p.view!;
  const { shielded, backing } = pool;
  const quote = p.protectedExitQuote;
  const quoteFresh = !!quote && now >= Number(quote.quotedAt) && now < Number(quote.quotedAt) + 30;
  const sameFresh = p.validUntil !== undefined && now < Number(p.validUntil);
  const canWithdraw =
    sameFresh &&
    p.sameAssetQuoteAvailable === true &&
    p.sameAssetExit?.state === "available" &&
    minReceived(p.withdrawableNet) > 0n;
  async function withdraw() {
    if (!canWithdraw || tx.pending) return;
    const result = await tx.submit({
      kind: "withdrawShielded",
      pool: p.pool,
      shieldedToken: shielded.token,
      position: p.id,
      minOut: minReceived(p.withdrawableNet),
    });
    if (result) onDone(result.txId);
  }
  return (
    <>
      {tx.pending && (
        <PendingOverlay
          accent="senior"
          label="Confirming asset withdrawal…"
          phase={tx.phase}
          step={tx.step}
          txId={tx.txId}
        />
      )}
      <Pill tone="senior">Senior position</Pill>
      <div className="mt-4 flex items-center gap-3">
        <AssetGlyph glyph={pool.preset.glyph} label={pool.preset.asset} symbol={pool.shielded.symbol} size={48} />
        <h1 className="page-title">{pool.preset.asset} protection</h1>
      </div>
      <p className="mb-7 mt-3 text-[14px] leading-relaxed text-body">
        Your deposit is recorded. Choose how to close the position below. Exits require valid prices, contract checks
        and your wallet approval.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="text-[13px] text-body">Recorded entry value</p>
          <p className="mt-2 text-[29px] font-extrabold tnum">{formatUsd8(p.valueAtDepositUsd)}</p>
          <p className="mt-2 text-[12px] text-body">Recorded at deposit</p>
        </Card>
        <Card>
          <p className="text-[13px] text-body">Current asset value</p>
          <p className="mt-2 text-[29px] font-extrabold tnum">
            {p.currentValueUsd === null ? "Unavailable" : formatUsd8(p.currentValueUsd)}
          </p>
          <p className="mt-2 text-[12px] text-body">Before exit fees</p>
        </Card>
      </div>
      <Card className="mt-4">
        <Row
          label="Position tokens"
          value={formatToken(p.deposited, shielded.decimals, shielded.symbol, shielded.decimals)}
        />
        <Row
          label="Collateral cap"
          value={formatToken(p.collateralAmount, backing.decimals, backing.symbol, backing.decimals)}
        />
        <Row label="Earliest protected exit" value={sessionTime(Number(p.protectedExitUnlockTime))} />
        <Row label="Deposited" value={sessionTime(Number(p.depositTime))} />
      </Card>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col border-senior/20 bg-senior-tint-2">
          <h2 className="text-[20px] font-bold">Exit with protection</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Exchange your entire position for {backing.symbol}. Your assets transfer to the junior side.
          </p>
          <p className="mt-5 text-[12px] text-body">Current protected exit quote</p>
          <p className="mt-1 text-[20px] font-bold">
            {quoteFresh
              ? formatToken(quote!.amount, backing.decimals, backing.symbol, backing.decimals)
              : "Unavailable"}
          </p>
          <p className="mb-5 mt-3 text-[12px] leading-relaxed text-body">
            {now < Number(p.protectedExitUnlockTime)
              ? `Waiting period ends ${sessionTime(Number(p.protectedExitUnlockTime))}.`
              : p.protectedExit?.blockers.map((b) => b.message).join(" ") ||
                "The contract rechecks the payout when you submit."}
          </p>
          <Link
            to={`/activate/${p.id}`}
            className={buttonStyles({ variant: "senior", full: true, className: "mt-auto" })}
          >
            Review protected exit
          </Link>
        </Card>
        <Card className="flex flex-col">
          <h2 className="text-[20px] font-bold">Withdraw assets</h2>
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            Keep your asset exposure. Close the position and receive your assets after fees on gains.
          </p>
          <p className="mt-5 text-[12px] text-body">Current asset withdrawal quote</p>
          <p className="mt-1 text-[20px] font-bold">
            {sameFresh && p.sameAssetQuoteAvailable
              ? formatToken(p.withdrawableNet, shielded.decimals, shielded.symbol, shielded.decimals)
              : "Unavailable"}
          </p>
          <p className="mb-5 mt-3 text-[12px] leading-relaxed text-body">
            {!sameFresh
              ? "A fresh withdrawal check is required."
              : p.sameAssetExit?.blockers.map((b) => b.message).join(" ") ||
                "You give up this position’s protected exit."}
          </p>
          <Button variant="senior" full className="mt-auto" disabled={!canWithdraw} onClick={() => setReview(true)}>
            Review asset withdrawal
          </Button>
        </Card>
      </div>
      {review && (
        <Card className="mt-5">
          <h2 className="mb-4 text-[20px] font-bold">Close this position for its assets?</h2>
          <Row
            label="Minimum received"
            value={
              canWithdraw
                ? formatToken(minReceived(p.withdrawableNet), shielded.decimals, shielded.symbol, shielded.decimals)
                : "Quote unavailable"
            }
          />
          <p className="mt-3 text-[13px] leading-relaxed text-body">
            This withdraws the entire position and ends its protection. The minimum includes a 0.5% tolerance from the
            quoted token amount.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="senior" disabled={!canWithdraw || tx.pending} onClick={withdraw}>
              Withdraw assets & close
            </Button>
            <Button variant="ghost" onClick={() => setReview(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      <TransactionError error={tx.error} txId={tx.txId} />
      <p className="mt-6 text-[12px] leading-relaxed text-body">
        Protected exits remain subject to the reserved cap and contract checks.
      </p>
    </>
  );
}
