import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSWR from "swr";
import {
  fromBaseUnits,
  type PoolCreationOptions,
  type PoolId,
  type SeedToken,
  type TokenId,
} from "@yieldshield/core";
import { Expander, Row } from "@/components/Expander";
import { ArrowLeft } from "@/components/icons";
import { PendingOverlay, SuccessCard, TransactionError } from "@/components/TxFeedback";
import { AssetGlyph, Button, Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBps, formatDuration, formatToken, formatUsd8 } from "@/lib/format";
import { reviewPoolCreation, type PoolCreationForm } from "@/lib/pool-creation";
import { chain, reader } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { shortAddress } from "@/chain/wallet";
import { useTokenBalance } from "@/data/balance";
import { presetFor } from "@/config/pools";

type Step = "pick" | "config" | "review" | "success";
const DEFAULT_FORM: PoolCreationForm = {
  collateralPct: "150",
  commissionPct: "10",
  poolFeePct: "1",
  bond: "0",
};

export function CreatePool() {
  const navigate = useNavigate();
  const tx = useSubmitTx();
  const {
    data: options,
    error: optionsError,
    isLoading,
    mutate,
  } = useSWR(
    reader.getPoolCreationOptions ? ["pool-creation", chain.protocolId] : null,
    () => reader.getPoolCreationOptions!(),
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(interval);
  }, []);
  const [step, setStep] = useState<Step>("pick");
  const [protectedToken, setProtectedToken] = useState<TokenId | null>(null);
  const [backingToken, setBackingToken] = useState<TokenId | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [createdPool, setCreatedPool] = useState<PoolId | null>(null);
  const asset = options?.protectedAssets.find((token) => token.token === protectedToken);
  const backing = options?.backingAssets.find((token) => token.token === backingToken);
  const { balance, loading: balanceLoading } = useTokenBalance(backing?.token);
  const review = reviewPoolCreation(form, protectedToken, backingToken, options, now);
  const settingsFresh = !!options && !optionsError && now >= options.evaluatedAt && now < options.validUntil;
  const bondError =
    review.params && review.params.creationBondAmount! > 0n
      ? balanceLoading
        ? "Checking your bond balance…"
        : balance === null
          ? "Your bond balance could not be checked."
          : balance < review.params.creationBondAmount!
            ? `You need more ${backing?.symbol} for this creation bond.`
            : null
      : null;
  const canSubmit = settingsFresh && !!review.params && !bondError && !!tx.owner;
  const set = (key: keyof PoolCreationForm) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function configure() {
    if (!asset || !backing || !options || !settingsFresh) return;
    setForm((current) => ({
      ...current,
      collateralPct: String(
        Math.max(15_000, options.bounds.collateralMinBp, Number(backing.minCollateralRatioBp)) / 100,
      ),
      bond: fromBaseUnits(backing.minimumBondAmount, backing.decimals),
    }));
    tx.reset();
    setStep("config");
  }

  async function confirm() {
    const current = reviewPoolCreation(form, protectedToken, backingToken, options, Date.now() / 1000);
    if (!canSubmit || !current.params || tx.pending) return;
    const result = await tx.submit({ kind: "createPool", params: current.params });
    if (result) {
      setCreatedPool(result.poolId ?? null);
      setStep("success");
    }
  }

  if (step === "success") {
    return (
      <div className="mx-auto max-w-[640px] animate-fade-up">
        <SuccessCard accent="junior" title="Your pool is created.">
          {asset?.symbol} / {backing?.symbol} is on {chain.label}. Add junior backing next so it can accept
          protected positions.
        </SuccessCard>
        <p className="mx-auto mt-5 max-w-[44ch] text-center text-[14px] leading-relaxed text-body">
          Creation and funding are separate. A creation bond does not provide backing capacity.
        </p>
        <div className="mx-auto mt-7 flex max-w-[360px] flex-col gap-3">
          {createdPool && (
            <Button variant="junior" full onClick={() => navigate(`/provide?pool=${createdPool}`)}>
              Fund this pool
            </Button>
          )}
          {createdPool && (
            <Button variant="secondary" full onClick={() => navigate(`/pool/${createdPool}`)}>
              View pool terms
            </Button>
          )}
          {!createdPool && (
            <Button variant="junior" full onClick={() => navigate("/provide")}>
              Find your pool
            </Button>
          )}
          {tx.txId && (
            <a
              className="mt-2 text-center text-[13px] font-semibold text-body underline"
              href={chain.explorerTxUrl(tx.txId)}
              target="_blank"
              rel="noreferrer"
            >
              View creation transaction
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {tx.pending && (
        <PendingOverlay
          accent="junior"
          label="Creating your pool…"
          phase={tx.phase}
          step={tx.step}
          txId={tx.txId}
        />
      )}
      <button
        type="button"
        onClick={() => {
          tx.reset();
          if (step === "pick") navigate("/provide");
          else setStep(step === "review" ? "config" : "pick");
        }}
        className="mb-5 flex items-center gap-1.5 text-[14px] font-medium text-body"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> Back
      </button>
      <header className="mb-7">
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-junior">Create a pool</p>
        <h1 className="page-title">
          {step === "pick"
            ? "Your pool. Your terms."
            : step === "config"
              ? "Set the gain share."
              : "Review your pool."}
        </h1>
        <p className="mt-3 max-w-[48ch] text-[16px] leading-relaxed text-body">
          {step === "pick"
            ? "Choose the asset to protect and the capital that backs it."
            : step === "config"
              ? "Choose how gains are shared and how much backing is reserved."
              : "Check the gain split, backing and creation bond before confirming."}
        </p>
        <ol aria-label="Pool creation steps" className="mt-5 flex gap-5 text-[12px] font-semibold">
          {(["pick", "config", "review"] as const).map((value, index) => (
            <li
              key={value}
              aria-current={step === value ? "step" : undefined}
              className={step === value ? "text-junior" : "text-muted"}
            >
              {index + 1} · {value === "pick" ? "Assets" : value === "config" ? "Terms" : "Review"}
            </li>
          ))}
        </ol>
      </header>

      {!reader.getPoolCreationOptions ? (
        <Card>Pool creation is not available on this deployment.</Card>
      ) : isLoading ? (
        <div role="status" className="h-60 animate-pulse rounded-card bg-subtle">
          <span className="sr-only">Reading verified factory settings…</span>
        </div>
      ) : !settingsFresh || !options ? (
        <Card>
          <p role="alert" className="text-[14px] text-body">
            Pool creation settings could not be verified. Refresh before continuing.
          </p>
          <Button className="mt-4" variant="secondary" onClick={() => void mutate()}>
            Refresh settings
          </Button>
        </Card>
      ) : step === "pick" ? (
        <div className="max-w-[740px] space-y-7">
          <TokenPicker
            label="Senior · Asset to protect"
            role="senior"
            tokens={options.protectedAssets}
            selected={protectedToken}
            onSelect={setProtectedToken}
          />
          <TokenPicker
            label="Junior · Backing asset"
            role="junior"
            tokens={options.backingAssets}
            selected={backingToken}
            onSelect={setBackingToken}
          />
          <Button
            variant="junior"
            full
            disabled={!asset || !backing || options.activePools >= options.maxActivePools}
            onClick={configure}
          >
            Set pool terms
          </Button>
          {options.activePools >= options.maxActivePools && (
            <p role="alert" className="text-[14px] text-amber-deep">
              The factory has reached its active-pool limit.
            </p>
          )}
        </div>
      ) : asset && backing ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center gap-3 text-[15px] font-bold">
              <span className="rounded-full bg-senior-tint px-4 py-2 text-senior">{asset.symbol}</span>
              <span className="text-muted">backed by</span>
              <span className="rounded-full bg-junior-tint px-4 py-2 text-junior">{backing.symbol}</span>
            </div>
            {step === "config" ? (
              <>
                <div className="space-y-3">
                  <Field
                    label="Junior gain share"
                    suffix="%"
                    value={form.commissionPct}
                    onChange={set("commissionPct")}
                    hint={`${formatBps(options.bounds.commissionMinBp)}–${formatBps(options.bounds.commissionMaxBp)} of new gains, shared with backing providers.`}
                  />
                  <Field
                    label="Creator fee"
                    suffix="%"
                    value={form.poolFeePct}
                    onChange={set("poolFeePct")}
                    hint={`${formatBps(options.bounds.poolFeeMinBp)}–${formatBps(options.bounds.poolFeeMaxBp)} of new gains, paid to the pool creator.`}
                  />
                  <Field
                    label="Collateral ratio"
                    suffix="%"
                    value={form.collateralPct}
                    onChange={set("collateralPct")}
                    hint={`Minimum ${formatBps(Math.max(options.bounds.collateralMinBp, Number(backing.minCollateralRatioBp)))}; maximum ${formatBps(options.bounds.collateralMaxBp)}.`}
                  />
                </div>
                <div className="rounded-card bg-junior-tint-3 px-4 py-3 text-[14px] text-body">
                  <span className="font-semibold text-ink">
                    Protocol fee: {formatBps(options.fixed.protocolFeeBp)}.
                  </span>{" "}
                  Set by the protocol, not the creator.
                </div>
                <Expander title="Creation bond">
                  <Field
                    label="Bond amount"
                    suffix={backing.symbol}
                    value={form.bond}
                    onChange={set("bond")}
                  />
                  <p className="mt-3 text-[13px] leading-relaxed text-body">
                    Minimum{" "}
                    {formatToken(
                      backing.minimumBondAmount,
                      backing.decimals,
                      backing.symbol,
                      backing.decimals,
                    )}
                    . This bond is separate from junior backing and does not add protection capacity. Any bond
                    return requires governed retirement of an empty pool.
                  </p>
                  {balance !== null && (
                    <p className="mt-2 text-[12px] text-muted">
                      Your balance: {formatToken(balance, backing.decimals, backing.symbol)}
                    </p>
                  )}
                </Expander>
                <FactoryTerms options={options} />
              </>
            ) : (
              <>
                <Card>
                  <Row
                    label="Junior gain share"
                    value={review.params ? formatBps(review.params.commissionRateBp) : "—"}
                    tone="indigo"
                  />
                  <Row label="Creator fee" value={review.params ? formatBps(review.params.poolFeeBp) : "—"} />
                  <Row label="Protocol fee" value={formatBps(options.fixed.protocolFeeBp)} />
                  <Row
                    label="Total gain fees"
                    value={
                      review.params
                        ? formatBps(
                            review.params.commissionRateBp +
                              review.params.poolFeeBp +
                              options.fixed.protocolFeeBp,
                          )
                        : "—"
                    }
                  />
                  <Row
                    label="Collateral ratio"
                    value={review.params ? formatBps(review.params.collateralRatioBp) : "—"}
                    tone="indigo"
                  />
                  <Row
                    label="Creation bond"
                    value={
                      review.params
                        ? formatToken(
                            review.params.creationBondAmount ?? 0n,
                            backing.decimals,
                            backing.symbol,
                            backing.decimals,
                          )
                        : "—"
                    }
                  />
                  <Row
                    label="Creator fee recipient"
                    value={tx.owner ? shortAddress(tx.owner) : "Connect wallet"}
                  />
                  <Row
                    label="Protected-exit delay"
                    value={formatDuration(BigInt(options.fixed.minimumPoolTime))}
                  />
                  <Row
                    label="Junior withdrawal notice"
                    value={formatDuration(BigInt(options.fixed.unlockDuration))}
                  />
                </Card>
                <p className="px-1 text-[14px] leading-relaxed text-body">
                  Gain-sharing terms and the collateral ratio are fixed when the pool is created. Fund the pool
                  separately before opening Senior positions.
                </p>
                <FactoryTerms options={options} />
              </>
            )}
            {(review.error || bondError) && (
              <p role="alert" className="text-[13px] font-medium text-amber-deep">
                {review.error || bondError}
              </p>
            )}
            <TransactionError error={tx.error} txId={tx.txId} />
            <Button
              variant="junior"
              full
              disabled={!canSubmit || tx.pending}
              onClick={() => (step === "config" ? setStep("review") : void confirm())}
            >
              {step === "config" ? "Review pool" : "Create pool"}
            </Button>
          </div>
          <GainSplit
            commission={review.params?.commissionRateBp}
            creator={review.params?.poolFeeBp}
            protocol={options.fixed.protocolFeeBp}
          />
        </div>
      ) : (
        <Card>
          <p>The supported asset list has changed.</p>
          <Button className="mt-4" variant="secondary" onClick={() => setStep("pick")}>
            Choose assets again
          </Button>
        </Card>
      )}
    </div>
  );
}

function GainSplit({
  commission,
  creator,
  protocol,
}: {
  commission?: number;
  creator?: number;
  protocol: number;
}) {
  const valid = commission !== undefined && creator !== undefined;
  const senior = valid ? 10_000 - commission - creator - protocol : null;
  return (
    <aside
      className="rounded-card border border-hairline bg-surface p-5 lg:sticky lg:top-5"
      aria-label="Your pool’s gain split"
      aria-live="polite"
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted">Your pool’s gain split</p>
      <p className="mt-5 text-[44px] font-semibold leading-none tracking-tight text-senior">
        {formatBps(senior)}
      </p>
      <p className="mt-2 text-[14px] font-semibold text-senior">Senior keeps</p>
      <div aria-hidden className="mb-5 mt-6 flex h-3 overflow-hidden rounded-full bg-subtle-2">
        {valid && (
          <>
            <span className="bg-senior" style={{ width: `${senior! / 100}%` }} />
            <span className="bg-junior" style={{ width: `${commission / 100}%` }} />
            <span className="bg-ink" style={{ width: `${creator / 100}%` }} />
            <span className="bg-muted" style={{ width: `${protocol / 100}%` }} />
          </>
        )}
      </div>
      <Row label="Junior providers" value={formatBps(commission ?? null)} tone="indigo" />
      <Row label="Creator" value={formatBps(creator ?? null)} />
      <Row label="Protocol" value={formatBps(protocol)} />
      <div className="mt-2 border-t border-hairline pt-2">
        <Row label="Total gain fees" value={valid ? formatBps(commission + creator + protocol) : "—"} />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        Applies to newly accrued positive gains. Trading and network fees are separate.
      </p>
    </aside>
  );
}

function FactoryTerms({ options }: { options: PoolCreationOptions }) {
  const fixed = options.fixed;
  return (
    <Expander title="Protocol-set timing & limits">
      <p className="mb-3 text-[13px] leading-relaxed text-body">
        These factory settings apply to the new pool. They are not creator-editable.
      </p>
      <Row label="Protected-exit delay" value={formatDuration(BigInt(fixed.minimumPoolTime))} />
      <Row label="Junior withdrawal notice" value={formatDuration(BigInt(fixed.unlockDuration))} />
      <Row label="Senior receipt transfer lock" value={formatDuration(BigInt(fixed.shieldTransferLock))} />
      <Row label="Junior receipt transfer lock" value={formatDuration(BigInt(fixed.protectorTransferLock))} />
      <Row label="Maximum pool value" value={formatUsd8(fixed.maxTvlUsd)} />
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        Withdrawals remain subject to reserved backing and contract checks. Transfer locks are separate from
        exit delays.
      </p>
      <a
        href={`https://sepolia.basescan.org/address/${options.factory}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-block text-[12px] font-semibold text-body underline"
      >
        Inspect factory
      </a>
    </Expander>
  );
}

function TokenPicker({
  label,
  role,
  tokens,
  selected,
  onSelect,
}: {
  label: string;
  role: "senior" | "junior";
  tokens: SeedToken[];
  selected: TokenId | null;
  onSelect: (token: TokenId) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={cn("mb-3 text-[14px] font-bold", role === "senior" ? "text-senior" : "text-junior")}>
        {label}
      </legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {tokens.map((token) => (
          <button
            key={token.token}
            type="button"
            aria-pressed={token.token === selected}
            onClick={() => onSelect(token.token)}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-card border bg-surface p-4 text-left transition-shadow hover:shadow-card",
              token.token === selected
                ? role === "senior"
                  ? "border-senior ring-1 ring-senior"
                  : "border-junior ring-1 ring-junior"
                : "border-hairline",
            )}
          >
            <AssetGlyph
              glyph={presetFor(token.symbol).glyph}
              label={token.name}
              symbol={token.symbol}
              size={36}
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-ink">{token.symbol}</span>
              <span className="block truncate text-[12px] text-muted">{token.name}</span>
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="grid gap-2 rounded-input border border-hairline bg-surface px-4 py-3 focus-within:ring-2 focus-within:ring-junior sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)] sm:items-center">
        <label htmlFor={id} className="text-[14px] font-semibold text-body">
          {label}
        </label>
        <div className="flex min-w-0 items-center gap-2">
          <input
            id={id}
            name={label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}
            inputMode="decimal"
            autoComplete="off"
            maxLength={80}
            spellCheck={false}
            aria-describedby={hint ? `${id}-suffix ${id}-hint` : `${id}-suffix`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-right text-[20px] font-bold text-ink outline-none tnum"
          />
          <span id={`${id}-suffix`} className="shrink-0 text-[13px] font-semibold text-muted">
            {suffix}
          </span>
        </div>
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 px-1 text-[12px] leading-relaxed text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
