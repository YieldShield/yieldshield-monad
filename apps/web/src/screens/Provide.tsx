import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { fromBaseUnits, minReceived, toBaseUnits, type PositionId } from "@yieldshield/core";
import { AmountInput } from "@/components/AmountInput";
import { Row } from "@/components/Expander";
import { ArrowLeft } from "@/components/icons";
import { PendingOverlay, SuccessCard, TransactionError } from "@/components/TxFeedback";
import { AssetGlyph, Bar, Button, Card, ChainBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBps, formatDuration, formatToken } from "@/lib/format";
import { chain } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { usePools, type PoolView } from "@/data/pools";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { useProtectionStatus } from "@/data/protection-status";
import { VOCAB } from "@/vocab";

type Step = "pick" | "amount" | "review" | "success";

export function Provide() {
  const navigate = useNavigate();
  const tx = useSubmitTx();
  const [params, setParams] = useSearchParams();
  const { now } = useProtectionStatus();
  const { data, loading, error: loadError } = usePools();
  const open = data;

  const [step, setStep] = useState<Step>(params.get("pool") ? "amount" : "pick");
  const [selectedAddress, setSelectedAddress] = useState<string | null>(params.get("pool"));
  const selected = data.find((p) => p.address === selectedAddress) ?? null;
  const [value, updateValue] = useState(params.get("amount") ?? "1000");
  const setValue = (value: string) => {
    updateValue(value);
    const updated = new URLSearchParams(params);
    updated.set("amount", value);
    setParams(updated, { replace: true });
  };
  const returnTo = `/provide?${params.toString()}`;
  const [createdPosition, setCreatedPosition] = useState<PositionId | null>(null);

  const backing = selected?.backing;
  const { balance, loading: balanceLoading } = useTokenBalance(backing?.token);
  const amountBase = useMemo(() => {
    try {
      return value && backing ? toBaseUnits(value, backing.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [value, backing]);

  const availability = selected?.availability;
  const current = availability && now >= Number(availability.evaluatedAt) && now < Number(availability.validUntil);
  const balError = !current
    ? "Checking collateral deposit availability…"
    : availability.provideCollateral.state !== "available"
      ? availability.provideCollateral.blockers.map((b) => b.message).join(" ") ||
        "Collateral deposits are unavailable."
      : availability.maxBackingDeposit !== null && amountBase > availability.maxBackingDeposit
        ? "This amount exceeds the pool’s remaining capacity."
        : tx.owner && balanceLoading
          ? "Checking wallet balance…"
          : tx.owner && balance === null
            ? "Your wallet balance could not be checked."
            : tx.owner && balance !== null && amountBase > balance
              ? `You need more ${backing?.symbol ?? "backing tokens"} for this amount.`
              : selected && amountBase > 0n && amountBase < selected.stats.backingMinDeposit
                ? `Minimum ${formatToken(selected.stats.backingMinDeposit, backing!.decimals, backing!.symbol)}.`
                : selected && selected.stats.backingMaxDeposit > 0n && amountBase > selected.stats.backingMaxDeposit
                  ? `Maximum ${formatToken(selected.stats.backingMaxDeposit, backing!.decimals, backing!.symbol)}.`
                  : null;
  const canContinue =
    !!tx.owner && !!selected && !loadError && amountBase > 0n && minReceived(amountBase) > 0n && !balError;

  async function confirm() {
    if (!selected || !backing || !canContinue || tx.pending) return;
    const res = await tx.submit({
      kind: "depositBacking",
      pool: selected.address,
      backingToken: backing.token,
      amount: amountBase,
      minReceived: minReceived(amountBase),
    });
    if (res) {
      setCreatedPosition(res.positionId ?? null);
      setStep("success");
    }
  }

  if (step === "success") {
    return (
      <div className="animate-fade-up">
        <SuccessCard accent="junior" title="Test backing deposit confirmed.">
          Your junior backing deposit has been confirmed. Gain-share income is variable and can be zero. Backing
          collateral can be lost.
        </SuccessCard>
        <div className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3">
          {createdPosition && (
            <Button variant="junior" full onClick={() => navigate(`/underwriter/${createdPosition}`)}>
              View position
            </Button>
          )}
          <Button variant="secondary" full onClick={() => navigate("/positions")}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {tx.pending && (
        <PendingOverlay accent="junior" label="Confirming…" phase={tx.phase} step={tx.step} txId={tx.txId} />
      )}
      {loadError && (
        <Card>
          <p role="alert">Pool data is unavailable. Refresh before continuing.</p>
        </Card>
      )}

      {step !== "pick" && (
        <button
          onClick={() => setStep(step === "review" ? "amount" : "pick")}
          className="mb-4 flex items-center gap-1.5 text-[14px] text-body"
        >
          <ArrowLeft className="h-4.5 w-4.5" /> Back
        </button>
      )}

      {step === "pick" && (
        <>
          <header className="mb-7 pt-2">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-junior">Junior tranche</p>
            <h1 className="page-title">{VOCAB.provide}</h1>
            <p className="mt-4 max-w-[43ch] text-[17px] leading-relaxed text-body">
              Earn a share of gains by backing protected positions. Junior capital takes first-loss exposure.
            </p>
          </header>

          <Link to="/create-pool" className="mb-6 inline-flex min-h-11 items-center gap-5 rounded-input border border-junior/30 px-4 py-3 text-[14px] font-bold text-junior hover:bg-junior-tint">
            Create a pool <span aria-hidden>↗</span>
          </Link>
          <div className="mb-5">
            <AvailabilityNotice />
          </div>
          <div className="section-label mb-2.5">Pick a pool to back</div>
          {loading ? (
            <div className="h-40 animate-pulse rounded-card bg-subtle" />
          ) : (
            <div className="flex flex-col gap-3">
              {!loadError && open.length === 0 && <Card>No pools are currently available for backing deposits.</Card>}
              {open.map((p) => (
                <BackPoolRow
                  key={p.address}
                  pool={p}
                  selected={selected?.address === p.address}
                  onClick={() => {
                    setSelectedAddress(p.address);
                    const updated = new URLSearchParams(params);
                    updated.set("pool", p.address);
                    setParams(updated, { replace: true });
                    setStep("amount");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {step === "amount" && selected && backing && (
        <>
          <h1 className="page-title mb-1">Back {selected.preset.asset}</h1>
          <p className="mb-5 text-[14px] text-body">Junior backing in {backing.symbol} · gain share</p>
          <AmountInput
            value={value}
            onChange={setValue}
            symbol={backing.symbol}
            accent="junior"
            presets={[500, 1000, 5000]}
            balanceLabel={
              balance !== null ? `Balance ${formatToken(balance, backing.decimals, backing.symbol)}` : undefined
            }
            onMax={balance !== null ? () => setValue(fromBaseUnits(balance, backing.decimals)) : undefined}
            error={balError}
          />
          <p className="mt-3 px-1 text-[13px] text-body">
            Your share depends on pool gains; there is no fixed annual return.
          </p>
          <div className="mt-6">
            {!tx.owner ? (
              <Link
                to={`/connect?next=${encodeURIComponent(returnTo)}`}
                className="flex min-h-12 items-center justify-center rounded-input bg-junior focus-visible:outline-junior px-5 text-[14px] font-bold text-white"
              >
                Connect wallet to continue
              </Link>
            ) : (
              <Button variant="junior" full disabled={!canContinue} onClick={() => setStep("review")}>
                Review collateral deposit
              </Button>
            )}
            <Link
              to={`/test-tokens?next=${encodeURIComponent(returnTo)}`}
              className="mt-4 block text-center text-[14px] font-bold text-junior"
            >
              Get free {backing.symbol}
            </Link>
          </div>
        </>
      )}

      {step === "review" && selected && backing && (
        <>
          <h1 className="page-title mb-4">Review collateral deposit</h1>
          <Card>
            <Row label="Backing collateral" value={formatToken(amountBase, backing.decimals, backing.symbol)} />
            <Row label="Pool" value={`${selected.preset.asset} / ${backing.symbol} · ${chain.label}`} />
            <Row label="Backers’ share of gains" value={formatBps(selected.stats.premiumRateBp)} tone="indigo" />
            <Row label="Loss exposure" value="Your collateral absorbs losses" tone="muted" />
            <Row label="Notice period" value={formatDuration(selected.stats.unlockDuration)} tone="muted" />
            <Row
              label="Minimum received"
              value={formatToken(minReceived(amountBase), backing.decimals, backing.symbol)}
            />
          </Card>
          <div className="mt-3.5 rounded-card bg-indigo-tint-3 p-4 text-[13.5px] leading-relaxed text-indigo">
            Junior providers share fees on newly accrued positive gains. Collateral withdrawals need{" "}
            {formatDuration(selected.stats.unlockDuration)} notice and sufficient unreserved backing. Contract or
            pricing failures can prevent withdrawals.
          </div>
          <TransactionError error={tx.error} txId={tx.txId} />
          <div className="mt-5">
            <Button variant="junior" full onClick={confirm} disabled={tx.pending || !canContinue}>
              Confirm collateral deposit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function BackPoolRow({ pool, selected, onClick }: { pool: PoolView; selected: boolean; onClick: () => void }) {
  const coverage = pool.stats.coverageBps === null ? null : Number(pool.stats.coverageBps) / 100;
  return (
    <button
      type="button"
      aria-label={`${pool.preset.asset} · backed by ${pool.backing.symbol} · ${formatBps(pool.stats.premiumRateBp)} junior gain share · ${formatBps(pool.stats.collateralRatioBp)} collateral ratio`}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-card border bg-surface p-4 text-left transition-shadow hover:shadow-card",
        selected ? "border-indigo ring-1 ring-indigo" : "border-hairline",
      )}
    >
      <AssetGlyph glyph={pool.preset.glyph} label={pool.preset.asset} symbol={pool.shielded.symbol} />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold text-ink">{pool.preset.asset}</div>
        <div className="mt-1 text-[13px] font-semibold text-junior">
          {pool.backing.symbol} · {formatBps(pool.stats.collateralRatioBp)} backing ratio
        </div>
        <div className="truncate text-[12.5px] text-muted">
          {pool.preset.source} ·{" "}
          {coverage === null ? "No active shield collateral" : `collateral coverage ${Math.round(coverage)}%`}
        </div>
        <div className="mt-1.5 max-w-[140px]">
          {coverage !== null && <Bar pct={Math.min(100, coverage)} tone="indigo" />}
        </div>
      </div>
      <div className="text-right">
        <div className="hero-num text-[22px] text-indigo">{formatBps(pool.stats.premiumRateBp)}</div>
        <div className="text-[11px] font-semibold text-muted">share of gains</div>
      </div>
      <ChainBadge />
    </button>
  );
}
