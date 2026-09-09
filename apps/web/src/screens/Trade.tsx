import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { fromBaseUnits } from "@yieldshield/core";
import type { DemoTradeQuote } from "@yieldshield/core";
import { chain, reader } from "@/chain/adapter";
import { friendlyError, useSubmitTx } from "@/chain/useSubmitTx";
import { useTokenBalance } from "@/data/balance";
import { useWhitelistedBalances } from "@/data/balances";
import { AmountInput } from "@/components/AmountInput";
import { AssetGlyph, Button, Card, buttonStyles } from "@/components/ui";
import { PendingOverlay, TransactionError } from "@/components/TxFeedback";
import { formatBps, formatToken, formatUsd8 } from "@/lib/format";
import { setupLink } from "@/lib/navigation";
import {
  demoMarketIsFresh,
  demoQuoteMatches,
  demoTradeLimit,
  demoTradeDeadline,
  parseTradeAmount,
} from "./trade-state";

async function readMarket() {
  if (!reader.getDemoMarket) throw new Error("Demo trading is not configured yet.");
  return reader.getDemoMarket();
}

type CompletedTrade = {
  side: "buy" | "sell";
  symbol: string;
  amount: bigint;
  decimals: number;
  owner: string;
  txId: string;
};

export function Trade() {
  const [params, setParams] = useSearchParams();
  const { pathname, search, hash } = useLocation();
  const selectId = useId();
  const tx = useSubmitTx();
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [review, setReview] = useState<DemoTradeQuote | null>(null);
  const [completed, setCompleted] = useState<CompletedTrade | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const reviewInFlight = useRef(false);
  const {
    data: market,
    error: marketError,
    isLoading: marketLoading,
    mutate: refreshMarket,
  } = useSWR(["demo-market"], readMarket, { refreshInterval: 10_000, keepPreviousData: false });
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  const symbol = params.get("asset") ?? "tAAPLc";
  const side = params.get("side") === "sell" ? "sell" : "buy";
  const defaultAmount = (s: string) => (s === "tcbBTC" ? "0.01" : ["tWETH", "vWETH"].includes(s) ? "0.1" : "1");
  const value = params.get("amount") ?? defaultAmount(symbol);
  const asset = market?.assets.find((entry) => entry.symbol === symbol);
  const maxAmount = asset?.maxAmount ?? market?.maxStockAmount ?? 0n;
  const parsed = parseTradeAmount(value, asset?.decimals ?? 8);
  const marketFresh = !marketError && demoMarketIsFresh(market, now);
  const request = { asset: asset?.token ?? "", side, amount: parsed.amount, owner: tx.owner ?? undefined } as const;
  const latestRequest = useRef(request);
  latestRequest.current = request;
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
    refresh: refreshBalances,
  } = useWhitelistedBalances();
  const inputToken = side === "buy" ? market?.quoteToken : asset;
  const outputToken = side === "buy" ? asset : market?.quoteToken;
  const { balance, loading: balanceLoading } = useTokenBalance(inputToken?.token);
  const amountError =
    parsed.error ??
    (market && parsed.amount > maxAmount
      ? `Maximum is ${formatToken(maxAmount, asset?.decimals ?? 8, symbol, asset?.decimals ?? 8)} per trade.`
      : null);
  const canQuote = marketFresh && !!asset && parsed.amount > 0n && !amountError;
  const {
    data: quote,
    error: quoteError,
    isLoading: quoteLoading,
    mutate: refreshQuote,
  } = useSWR(
    canQuote ? ["demo-trade-quote", market.exchange, asset.token, side, parsed.amount.toString(), tx.owner] : null,
    () => {
      if (!reader.getDemoTradeQuote) throw new Error("Demo quotes are not configured yet.");
      return reader.getDemoTradeQuote(request);
    },
    { refreshInterval: 5000, keepPreviousData: false },
  );
  const shownQuote = review ?? quote;
  const quoteFresh = !marketError && demoQuoteMatches(shownQuote ?? undefined, market, request, now);
  // Preserve the user's submitted review while the wallet request is pending; execution still rechecks freshness.
  const showReviewValues = quoteFresh || (tx.pending && !!review);
  const limit = shownQuote ? demoTradeLimit(shownQuote) : 0n;
  const requiredBalance = side === "buy" ? limit : parsed.amount;
  const walletError = !tx.owner
    ? null
    : balanceLoading
      ? "Checking your balance…"
      : balance === null
        ? "Your balance could not be checked."
        : requiredBalance > balance
          ? `You need more ${inputToken?.symbol ?? "test tokens"}.`
          : null;
  const blocked = marketLoading
    ? "Reading the demo market…"
    : marketError
      ? friendlyError(marketError)
      : !marketFresh
        ? "The demo market needs a fresh check."
        : !asset
          ? "Choose a supported asset."
          : (amountError ??
            (parsed.amount <= 0n
              ? "Enter an asset quantity."
              : review && !quoteFresh
                ? "This review expired or your wallet changed. Review a fresh quote."
                : quoteError
                  ? friendlyError(quoteError)
                  : !quoteFresh
                    ? "Checking the current quote…"
                    : limit <= 0n
                      ? "This amount is too small."
                      : walletError));
  const canReview = !!tx.owner && !blocked && !tx.pending && !reviewing && quoteFresh;

  function updateDraft(changes: Record<string, string>) {
    if (tx.pending) return;
    const next = new URLSearchParams(params);
    for (const [key, nextValue] of Object.entries(changes)) next.set(key, nextValue);
    setParams(next, { replace: true });
    setReview(null);
    setReviewError(null);
    tx.reset();
  }
  async function reviewTrade() {
    if (reviewInFlight.current || tx.pending || !tx.owner) return;
    reviewInFlight.current = true;
    setReviewing(true);
    setReviewError(null);
    try {
      const fresh = await refreshQuote();
      if (!demoQuoteMatches(fresh, market, latestRequest.current, Date.now() / 1000))
        throw new Error("The quote changed or expired. Review again.");
      setReview(fresh);
    } catch (error) {
      setReviewError(friendlyError(error));
    } finally {
      reviewInFlight.current = false;
      setReviewing(false);
    }
  }
  async function confirmTrade() {
    if (!review || !asset || !tx.owner || !canReview || !demoQuoteMatches(review, market, request, Date.now() / 1000))
      return;
    const receipt: Omit<CompletedTrade, "txId"> = {
      side,
      symbol: asset.symbol,
      amount: review.amount,
      decimals: asset.decimals,
      owner: tx.owner,
    };
    const result = await tx.submit({
      kind: "demoTrade",
      asset: review.asset,
      side: review.side,
      amount: review.amount,
      limit: demoTradeLimit(review),
      deadline: demoTradeDeadline(review),
    });
    if (result) {
      setCompleted({ ...receipt, txId: result.txId });
      setReview(null);
      refreshBalances();
      void refreshMarket();
      void refreshQuote();
    }
  }

  return (
    <div>
      {tx.pending && (
        <PendingOverlay label="Confirming your demo trade…" phase={tx.phase} step={tx.step} txId={tx.txId} />
      )}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-[12px] font-bold uppercase tracking-wider text-ink">
            Demo prices · Sepolia test tokens
          </p>
          <h1 className="page-title">Trade your next asset.</h1>
          <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-body">
            Buy or sell with TestUSDC. Add protection separately when you want it.
          </p>
        </div>
        <Link to={setupLink("/test-tokens", pathname, search, hash)} className={buttonStyles({ variant: "secondary" })}>
          Get free test tokens
        </Link>
      </div>
      {completed && (
        <Card className="mb-6 border-hairline bg-subtle">
          <p role="status" className="text-[18px] font-bold">
            {completed.side === "buy" ? "Purchase confirmed." : "Sale confirmed."}
          </p>
          <p className="mt-2 text-[14px] leading-relaxed text-body">
            {completed.side === "buy"
              ? `${formatToken(completed.amount, completed.decimals, completed.symbol, completed.decimals)} were sent to your wallet. These tokens are not protected.`
              : "Your sale settled. The confirmed receipt and wallet balance show your TestUSDC proceeds."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {completed.side === "buy" &&
              completed.symbol !== "vUSDC" &&
              completed.owner.toLowerCase() === tx.owner?.toLowerCase() && (
                <Link
                  to={`/protection/new?asset=${encodeURIComponent(completed.symbol)}&amount=${fromBaseUnits(completed.amount, completed.decimals)}`}
                  className={buttonStyles({ variant: "senior" })}
                >
                  Protect these tokens
                </Link>
              )}
            <a
              href={chain.explorerTxUrl(completed.txId)}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles({ variant: "secondary" })}
            >
              View transaction
            </a>
            <Button variant="ghost" onClick={() => setCompleted(null)}>
              Continue trading
            </Button>
          </div>
          {completed.owner.toLowerCase() !== tx.owner?.toLowerCase() && (
            <p className="mt-3 text-[13px] text-body">
              This trade belongs to your previous wallet. Switch back to manage those tokens.
            </p>
          )}
        </Card>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-w-0">
          <div
            role="group"
            aria-label="Trade direction"
            className="mb-6 grid grid-cols-2 gap-2 rounded-input bg-subtle p-1"
          >
            {(["buy", "sell"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={tx.pending || !!review}
                aria-pressed={side === direction}
                onClick={() => updateDraft({ side: direction })}
                className={`min-h-12 rounded-input text-[16px] font-bold ${side === direction ? "bg-ink text-white" : "text-body hover:bg-subtle-2"}`}
              >
                {direction === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          <label htmlFor={selectId} className="mb-2 block text-[13px] font-semibold text-body">
            Asset
          </label>
          <div className="mb-6 flex min-w-0 items-center gap-3">
            {asset && <AssetGlyph glyph="generic" label={asset.name} symbol={asset.symbol} size={48} />}
            <select
              id={selectId}
              value={asset ? symbol : ""}
              disabled={!!review || tx.pending || !market?.assets.length}
              onChange={(event) =>
                updateDraft({ asset: event.target.value, amount: defaultAmount(event.target.value) })
              }
              className="min-h-12 min-w-0 w-full rounded-input border border-hairline bg-surface px-4 text-[16px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
            >
              {!asset && <option value="">{marketLoading ? "Loading assets…" : "Choose an asset"}</option>}
              {market?.assets.map((entry) => (
                <option key={entry.token} value={entry.symbol}>
                  {entry.name} · {entry.symbol}
                </option>
              ))}
            </select>
          </div>
          {review ? (
            <div className="mb-6 rounded-card bg-subtle p-5">
              <p className="text-[13px] text-body">{side === "buy" ? "Buying" : "Selling"}</p>
              <p className="mt-2 break-words text-[28px] font-bold tnum">
                {formatToken(review.amount, asset?.decimals ?? 8, symbol, asset?.decimals ?? 8)}
              </p>
            </div>
          ) : (
            <AmountInput
              value={value}
              onChange={(amount) => updateDraft({ amount })}
              symbol={symbol}
              presets={
                symbol === "tcbBTC"
                  ? [0.01, 0.02, 0.05]
                  : ["tWETH", "vWETH"].includes(symbol)
                    ? [0.1, 0.5, 1]
                    : [1, 5, 10]
              }
              error={amountError}
              balanceLabel={
                balance !== null && inputToken
                  ? `Wallet: ${formatToken(balance, inputToken.decimals, inputToken.symbol, inputToken.decimals)}`
                  : undefined
              }
              onMax={
                side === "sell" && balance !== null && asset && market
                  ? () =>
                      updateDraft({
                        amount: fromBaseUnits(balance < maxAmount ? balance : maxAmount, asset.decimals),
                      })
                  : undefined
              }
            />
          )}
          <dl className="mt-6 space-y-3 border-y border-hairline py-5 text-[14px]">
            <TradeRow
              label={tx.pending ? "Reviewed price" : "Demo price"}
              value={showReviewValues ? formatUsd8(shownQuote!.priceUsd8) : "Unavailable"}
            />
            <TradeRow
              label="You pay"
              value={
                showReviewValues && inputToken
                  ? formatToken(shownQuote!.inputAmount, inputToken.decimals, inputToken.symbol, inputToken.decimals)
                  : "—"
              }
            />
            <TradeRow
              label="You receive"
              value={
                showReviewValues && outputToken
                  ? formatToken(
                      shownQuote!.outputAmount,
                      outputToken.decimals,
                      outputToken.symbol,
                      outputToken.decimals,
                    )
                  : "—"
              }
            />
            <TradeRow
              label={`Trading fee${market ? ` (${formatBps(market.feeBps)})` : ""} · included`}
              value={
                showReviewValues && market
                  ? formatToken(
                      shownQuote!.feeAmount,
                      market.quoteToken.decimals,
                      market.quoteToken.symbol,
                      market.quoteToken.decimals,
                    )
                  : "—"
              }
            />
            <TradeRow
              label={side === "buy" ? "Maximum TestUSDC paid" : "Minimum TestUSDC received"}
              value={
                showReviewValues && market
                  ? formatToken(limit, market.quoteToken.decimals, market.quoteToken.symbol, market.quoteToken.decimals)
                  : "—"
              }
            />
            <TradeRow label="Network fee" value="Shown in wallet · test ETH" />
          </dl>
          {review && quoteFresh && (
            <p className="mt-3 text-[13px] text-body">
              Review expires in {Math.max(0, Math.ceil(review.validUntil - now))} seconds.
            </p>
          )}
          <p className="mt-3 text-[12px] leading-relaxed text-body">
            0.5% price tolerance. Your wallet may request a spending approval before the trade.
            {side === "buy" && " Buying does not add protection."}
          </p>
          {blocked && (review || blocked !== amountError) && (
            <p role="status" className="mt-4 text-[13px] text-body">
              {blocked}
            </p>
          )}
          {reviewError && (
            <p role="alert" className="mt-4 text-[13px] text-amber-deep">
              {reviewError}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            {!tx.owner ? (
              <Link
                to={setupLink("/connect", pathname, search, hash)}
                className={buttonStyles({ variant: "primary", full: true })}
              >
                Connect wallet to trade
              </Link>
            ) : review ? (
              <>
                <Button variant="primary" full disabled={!canReview} onClick={() => void confirmTrade()}>
                  Confirm {side === "buy" ? "purchase" : "sale"}
                </Button>
                <Button
                  variant="ghost"
                  disabled={tx.pending}
                  onClick={() => {
                    setReview(null);
                    setReviewError(null);
                    void refreshQuote();
                  }}
                >
                  Back to quote
                </Button>
              </>
            ) : (
              <Button variant="primary" full disabled={!canReview || quoteLoading} onClick={() => void reviewTrade()}>
                {reviewing ? "Checking quote…" : `Review ${side === "buy" ? "purchase" : "sale"}`}
              </Button>
            )}
            <Button
              variant="ghost"
              disabled={tx.pending || reviewing}
              onClick={() => {
                void refreshMarket();
                void refreshQuote();
                refreshBalances();
              }}
            >
              Refresh balances & quote
            </Button>
          </div>
          <TransactionError error={tx.error} txId={tx.txId} />
        </Card>
        <div className="min-w-0 space-y-5">
          <Card>
            <h2 className="text-[20px] font-bold">In your wallet</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-body">
              Unprotected test tokens. Deposited positions are listed separately.
            </p>
            {!tx.owner ? (
              <Link
                to={setupLink("/connect", pathname, search, hash)}
                className="mt-5 inline-block text-[14px] font-bold text-ink"
              >
                Connect to view balances
              </Link>
            ) : balancesLoading ? (
              <p role="status" className="mt-5 text-[14px] text-body">
                Reading balances…
              </p>
            ) : balancesError ? (
              <p role="status" className="mt-5 text-[14px] text-body">
                Balances are unavailable. Refresh to check again.
              </p>
            ) : (
              <ul className="mt-5 divide-y divide-hairline">
                {market &&
                  [market.quoteToken, ...market.assets].map((entry) => {
                    const holding = balances.find(
                      (balance) => balance.token.token.toLowerCase() === entry.token.toLowerCase(),
                    );
                    return (
                      <li key={entry.token} className="flex flex-wrap items-center justify-between gap-2 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <AssetGlyph
                            glyph={entry.symbol === "TestUSDC" ? "usdc" : "generic"}
                            label={entry.symbol}
                            symbol={entry.symbol}
                            size={36}
                          />
                          <div className="min-w-0">
                            <p className="text-[14px] font-bold">{entry.symbol}</p>
                            <p className="mt-1 break-words text-[13px] text-body tnum">
                              {holding
                                ? formatToken(holding.amount, entry.decimals, entry.symbol, entry.decimals)
                                : "Not checked"}
                            </p>
                          </div>
                        </div>
                        {!["TestUSDC", "vUSDC"].includes(entry.symbol) && (
                          <Link
                            to={`/protection/new?asset=${encodeURIComponent(entry.symbol)}`}
                            className="min-h-11 py-3 text-[13px] font-bold text-senior"
                          >
                            Protect
                          </Link>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
            <Link to="/positions" className="mt-5 inline-block text-[14px] font-bold text-senior">
              View protection positions →
            </Link>
          </Card>
          <Card className="bg-subtle">
            <h2 className="text-[18px] font-bold">Trading and protection, together.</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-body">
              Choose stocks, crypto or vault shares. Hold purchased tokens in your wallet, or open a senior position
              with the collateral you choose. vUSDC shares are available as junior backing.
            </p>
            <Link to="/how-it-works" className="mt-4 inline-block text-[13px] font-bold text-ink">
              How trading and protection work
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}

function TradeRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <dt className="text-body">{label}</dt>
      <dd className="min-w-0 break-words text-right font-semibold tnum">{value}</dd>
    </div>
  );
}
