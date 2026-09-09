import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { fromBaseUnits, minReceived, toBaseUnits, type PositionId } from "@yieldshield/core";
import { Expander, Row } from "@/components/Expander";
import { AmountInput } from "@/components/AmountInput";
import { ArrowLeft } from "@/components/icons";
import { PendingOverlay, SuccessCard, TransactionError } from "@/components/TxFeedback";
import { AssetGlyph, Button, buttonStyles, Card } from "@/components/ui";
import { PrepareProtection } from "@/components/PrepareProtection";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { useProtectionStatus } from "@/data/protection-status";
import { formatDuration, formatBps, formatToken } from "@/lib/format";
import { chain, protocolDeployed } from "@/chain/adapter";
import { useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { usePools, type PoolView } from "@/data/pools";
import { VOCAB } from "@/vocab";
import { useWalletAddress } from "@/chain/wallet";
import { maximumProtectionAmount } from "@/lib/protection-overview";

export function Deposit() {
  const owner = useWalletAddress();
  const { now } = useProtectionStatus();
  const [params] = useSearchParams();
  const poolId = params.get("pool");
  const symbol = params.get("asset");
  const { loading, error, data } = usePools();
  const matches = data.filter((p) =>
    poolId ? p.address.toLowerCase() === poolId.toLowerCase() : p.shielded.symbol === symbol,
  );
  const pool = matches[0];
  const knownAsset = symbol && ["tAAPLc", "tNVDAc", "tMETAc", "tGOOGLc", "tWETH", "tcbBTC", "vWETH"].includes(symbol);
  if (!poolId && !knownAsset) return <Navigate to="/markets" replace />;
  if (!poolId && matches.length > 1)
    return (
      <div className="mx-auto max-w-[760px]">
        <Link to="/markets" className="text-[14px] font-bold text-senior">
          ← Get protection
        </Link>
        <h1 className="page-title mt-6">Choose your pool.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-body">
          Compare gain-sharing terms and collateral for your {symbol} position. Each pool holds its own reserve.
        </p>
        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          {matches.map((p) => {
            const next = new URLSearchParams(params);
            next.set("pool", p.address);
            const gainShare = formatBps(p.stats.premiumRateBp + p.stats.poolFeeBp + p.stats.protocolFeeBp);
            const collateralRatio = formatBps(p.stats.collateralRatioBp);
            const current =
              p.availability && now >= Number(p.availability.evaluatedAt) && now < Number(p.availability.validUntil);
            const accepting = current && p.availability?.openPosition.state === "available";
            return (
              <Card key={p.address}>
                <AssetGlyph
                  glyph={p.backing.symbol === "TestUSDC" ? "usdc" : "generic"}
                  symbol={p.backing.symbol}
                  label={p.backing.symbol}
                  size={48}
                />
                <h2 className="mt-4 text-[22px] font-bold">{p.backing.symbol}</h2>
                <div className="mt-3 text-[14px] font-semibold text-senior">
                  {gainShare} of positive gains · {collateralRatio} collateral
                </div>
                <dl className="my-4 space-y-3 text-[13px]">
                  <div>
                    <dt className="text-body">Waiting period after deposit</dt>
                    <dd className="mt-1 font-bold">{formatDuration(p.stats.minimumPoolTime)}</dd>
                  </div>
                  <div>
                    <dt className="text-body">Available deposit capacity</dt>
                    <dd className="mt-1 break-words font-bold">
                      {current &&
                      p.availability?.maxShieldedDeposit !== null &&
                      p.availability?.maxShieldedDeposit !== undefined
                        ? formatToken(
                            p.availability.maxShieldedDeposit,
                            p.shielded.decimals,
                            p.shielded.symbol,
                            p.shielded.decimals,
                          )
                        : "Checking capacity"}
                    </dd>
                  </div>
                </dl>
                <p className={`mb-3 text-[12px] font-semibold ${accepting ? "text-senior-dark" : "text-body"}`}>
                  {!current
                    ? "Availability needs a fresh check"
                    : accepting
                      ? "Accepting deposits"
                      : "Deposits currently unavailable"}
                </p>
                <p className="mt-2 text-[14px] leading-relaxed text-body">
                  {p.backing.symbol === "vUSDC"
                    ? "USDC vault shares. Funded yield increases the underlying assets per share; redeem received shares separately for TestUSDC."
                    : "Direct TestUSDC collateral. A protected exit sends TestUSDC to your wallet."}
                </p>
                <Link
                  to={`/protection/new?${next}`}
                  aria-label={`Choose ${p.backing.symbol} · ${gainShare} gain share · ${collateralRatio} collateral`}
                  className={buttonStyles({ variant: "senior", full: true, className: "mt-6" })}
                >
                  Choose {p.backing.symbol}
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    );
  if (pool) return <DepositFlow key={`${pool.address}:${owner ?? "disconnected"}`} pool={pool} />;
  if (knownAsset && !protocolDeployed) return <PrepareProtection symbol={symbol} />;
  if (loading)
    return (
      <div role="status" className="p-6 text-body">
        Reading the pool’s terms…
      </div>
    );
  if (knownAsset && !error) return <PrepareProtection symbol={symbol} />;
  return (
    <Card>
      <h1 className="page-title">Pool unavailable</h1>
      <p className="mt-3 text-[14px] text-body">
        {error
          ? "The pool could not be verified. Refresh before continuing."
          : "This pool was not found in the current deployment."}
      </p>
      <Link to="/markets" className="mt-4 inline-block font-bold text-senior">
        Choose an asset
      </Link>
    </Card>
  );
}

function DepositFlow({ pool }: { pool: PoolView }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { now } = useProtectionStatus();
  const { shielded, preset, stats } = pool;
  const tx = useSubmitTx();

  const [step, setStep] = useState<"amount" | "review" | "success">("amount");
  const [value, updateValue] = useState(
    params.get("amount") ??
      (shielded.symbol === "tcbBTC" ? "0.01" : ["tWETH", "vWETH"].includes(shielded.symbol) ? "0.1" : "5"),
  );
  const setValue = (next: string) => {
    updateValue(next);
    const updated = new URLSearchParams(params);
    updated.set("amount", next);
    setParams(updated, { replace: true });
  };
  const returnTo = `/protection/new?${params.toString()}`;
  const [slippageBps, setSlippageBps] = useState(50);
  const [createdPosition, setCreatedPosition] = useState<PositionId | null>(null);
  const { balance, loading: balanceLoading } = useTokenBalance(shielded.token);

  const amountBase = useMemo(() => {
    try {
      return value ? toBaseUnits(value, shielded.decimals) : 0n;
    } catch {
      return 0n;
    }
  }, [value, shielded.decimals]);

  const minDep = stats.shieldedMinDeposit;
  const maxDep = stats.shieldedMaxDeposit;
  const capacity = pool.availability?.maxShieldedDeposit;
  const fresh =
    !!pool.availability &&
    BigInt(Math.floor(now)) >= pool.availability.evaluatedAt &&
    BigInt(Math.floor(now)) < pool.availability.validUntil;
  const actionError = !fresh
    ? "Checking current deposit availability…"
    : pool.availability?.openPosition.state !== "available"
      ? pool.availability?.openPosition.blockers.map((b) => b.message).join(" ") ||
        "Deposits are currently unavailable."
      : null;

  const error =
    actionError ??
    (amountBase > 0n && amountBase < minDep
      ? `Minimum is ${formatToken(minDep, shielded.decimals, shielded.symbol, shielded.decimals)}.`
      : null) ??
    (maxDep > 0n && amountBase > maxDep
      ? `Maximum is ${formatToken(maxDep, shielded.decimals, shielded.symbol, shielded.decimals)}.`
      : null) ??
    (capacity !== null && capacity !== undefined && amountBase > capacity
      ? `Available capacity is ${formatToken(capacity, shielded.decimals, shielded.symbol, shielded.decimals)}.`
      : null) ??
    (tx.owner && balanceLoading ? "Checking wallet balance…" : null) ??
    (tx.owner && balance === null ? "Wallet balance is unavailable. Refresh before continuing." : null) ??
    (tx.owner && balance !== null && amountBase > balance ? "You need more test tokens for this amount." : null);
  const canContinue = !!tx.owner && amountBase > 0n && minReceived(amountBase, slippageBps) > 0n && !error;
  const maxAmount =
    balance !== null && !balanceLoading && !actionError && capacity !== null && capacity !== undefined
      ? maximumProtectionAmount(balance, maxDep, capacity)
      : null;
  const waitingPeriod = formatDuration(stats.minimumPoolTime);

  async function confirm() {
    if (!canContinue || tx.pending) return;
    const res = await tx.submit({
      kind: "depositShielded",
      pool: pool.address,
      shieldedToken: shielded.token,
      backingToken: pool.backing.token,
      amount: amountBase,
      minReceived: minReceived(amountBase, slippageBps),
    });
    if (res) {
      setCreatedPosition(res.positionId ?? null);
      setStep("success");
    }
  }

  if (step === "success") {
    return (
      <div className="animate-fade-up">
        <SuccessCard accent="senior" title="Protection position opened.">
          Deposit confirmed. Your receipt shows the amount and earliest protected exit.
        </SuccessCard>
        {tx.txId && (
          <a
            href={chain.explorerTxUrl(tx.txId)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 block text-center text-[13px] font-bold text-senior underline"
          >
            View confirmed transaction
          </a>
        )}
        <div className="mx-auto mt-8 flex max-w-[360px] flex-col gap-3">
          {createdPosition && (
            <Button variant="senior" full onClick={() => navigate(`/position/${createdPosition}`)}>
              View position
            </Button>
          )}
          <Button variant="secondary" full onClick={() => navigate("/positions")}>
            My positions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      {tx.pending && (
        <PendingOverlay
          accent="senior"
          label="Confirming your deposit…"
          phase={tx.phase}
          step={tx.step}
          txId={tx.txId}
        />
      )}

      <button
        onClick={() => (step === "review" ? setStep("amount") : navigate(-1))}
        className="mb-5 flex items-center gap-1.5 text-[14px] text-body"
      >
        <ArrowLeft className="h-4.5 w-4.5" /> Back
      </button>

      <div className="mb-5 flex items-center gap-3">
        <AssetGlyph glyph={preset.glyph} label={preset.asset} symbol={shielded.symbol} size={48} />
        <div className="min-w-0">
          <h1 className="page-title">{VOCAB.addMoney}</h1>
          <p className="mt-1 text-[14px] text-body">
            {preset.asset} · Backed by {pool.backing.symbol}
          </p>
        </div>
      </div>
      <AvailabilityNotice />
      <div className="h-5" />

      {step === "amount" ? (
        <>
          <AmountInput
            accent="senior"
            value={value}
            onChange={setValue}
            symbol={shielded.symbol}
            presets={
              shielded.symbol === "tcbBTC"
                ? [0.01, 0.02, 0.05]
                : ["tWETH", "vWETH"].includes(shielded.symbol)
                  ? [0.1, 0.5, 1]
                  : [1, 5, 10]
            }
            balanceLabel={
              !tx.owner
                ? "Connect wallet to see your balance."
                : balanceLoading
                  ? "Checking wallet balance…"
                  : balance !== null
                    ? `In your wallet: ${formatToken(balance, shielded.decimals, shielded.symbol, shielded.decimals)}`
                    : "Wallet balance unavailable"
            }
            onMax={
              maxAmount !== null && maxAmount > 0n && maxAmount >= minDep
                ? () => setValue(fromBaseUnits(maxAmount, shielded.decimals))
                : undefined
            }
            error={error}
          />
          {maxAmount !== null && balance !== null && maxAmount < balance && (
            <p className="mt-3 px-1 text-[13px] text-body">
              Maximum for this pool: {formatToken(maxAmount, shielded.decimals, shielded.symbol, shielded.decimals)}.
              Max uses this limit.
            </p>
          )}
          <p className="mt-3 px-1 text-[13px] text-body">
            A protected exit exchanges the whole position for reserved backing.
          </p>
          <div className="mt-6">
            {!tx.owner ? (
              <Link
                to={`/connect?next=${encodeURIComponent(returnTo)}`}
                className={buttonStyles({ variant: "senior", full: true })}
              >
                Connect wallet to continue
              </Link>
            ) : (
              <Button variant="senior" full disabled={!canContinue} onClick={() => setStep("review")}>
                Review protection
              </Button>
            )}
            {(!tx.owner || (balance !== null && (balance === 0n || balance < amountBase))) && (
              <Link
                to={`/test-tokens?next=${encodeURIComponent(returnTo)}`}
                className="mt-4 block text-center text-[14px] font-bold text-senior"
              >
                Need free test tokens?
              </Link>
            )}
          </div>
        </>
      ) : (
        <>
          <Card>
            <Row
              label="Deposit"
              value={formatToken(amountBase, shielded.decimals, shielded.symbol, shielded.decimals)}
            />
            <Row label="Pool" value={`${preset.asset} · ${chain.label}`} />
            <Row label="Protected exit into" value={pool.backing.symbol} />
            <Row label="Earliest protected exit" value={`${waitingPeriod} after confirmation`} />
            <Row label="Backer share of gains" value={formatBps(stats.premiumRateBp)} />
            <Row label="Pool fee on gains" value={formatBps(stats.poolFeeBp)} />
            <Row label="Protocol fee on gains" value={formatBps(stats.protocolFeeBp)} />
            <Row label="Network fee" value="Shown in your wallet · test ETH" tone="muted" />
          </Card>

          <div className="mt-3.5 rounded-card bg-green-tint-2 p-4 text-[13.5px] leading-relaxed text-green-dark">
            Fees apply to positive gains. Your position’s entry value and collateral cap are recorded when the deposit
            confirms. A protected exit becomes eligible after {waitingPeriod}, subject to available collateral, oracle
            prices and contract checks. Contract or oracle failure can prevent recovery.
          </div>

          <div className="mt-3.5">
            <Expander title="Advanced">
              <Row label="Max slippage" value={`${(slippageBps / 100).toFixed(2)}%`} />
              <div className="flex gap-2 pt-1">
                {[10, 50, 100].map((b) => (
                  <button
                    key={b}
                    onClick={() => setSlippageBps(b)}
                    className={`rounded-pill px-3 py-1 text-[12px] font-bold ${slippageBps === b ? "bg-ink text-white" : "bg-subtle-2 text-body"}`}
                  >
                    {(b / 100).toFixed(2)}%
                  </button>
                ))}
              </div>
              <div className="pt-2">
                <p className="mb-3 break-all text-[12px] leading-relaxed text-body">
                  Token spender: {pool.address}. Your wallet may request an approval for{" "}
                  {formatToken(amountBase, shielded.decimals, shielded.symbol, shielded.decimals)}, then the deposit.
                </p>
                <Row
                  label="Minimum received"
                  value={formatToken(minReceived(amountBase, slippageBps), shielded.decimals, shielded.symbol)}
                  tone="muted"
                />
                <Row label="Position receipt" value="On-chain NFT · minted to you" tone="muted" />
              </div>
            </Expander>
          </div>

          <TransactionError error={tx.error} txId={tx.txId} />

          <div className="mt-5">
            <Button variant="senior" full onClick={confirm} disabled={tx.pending || !canContinue}>
              Confirm protection deposit
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
