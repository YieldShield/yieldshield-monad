import { Link } from "react-router-dom";
import { PROTECTED_ASSETS } from "@/config/stocks";
import { useWalletAddress } from "@/chain/wallet";
import { AssetGlyph, buttonStyles } from "@/components/ui";
import { useWhitelistedBalances } from "@/data/balances";
import { useProtectionStatus } from "@/data/protection-status";
import { formatAmount, formatBps, formatDuration } from "@/lib/format";
import { summarizeProtection, walletHolding } from "@/lib/protection-overview";

export function Markets() {
  const owner = useWalletAddress();
  const { data, fresh, loading, error, refresh } = useProtectionStatus();
  const {
    balances,
    loading: balancesLoading,
    error: balancesError,
    refresh: refreshBalances,
  } = useWhitelistedBalances();
  const assets = PROTECTED_ASSETS.map((stock) => {
    const tokenAddress = data?.faucet.tokens.find((token) => token.symbol === stock.symbol)?.address;
    const holding =
      owner && !balancesLoading && !balancesError ? walletHolding(balances, stock.symbol, tokenAddress) : null;
    return { stock, holding };
  }).sort((a, b) => Number((b.holding?.amount ?? 0n) > 0n) - Number((a.holding?.amount ?? 0n) > 0n));

  return (
    <div>
      <header className="pb-8">
        <p className="mb-4 text-[12px] font-bold uppercase tracking-[0.14em] text-senior-dark">Get protection</p>
        <h1 className="page-title">Protect what you hold.</h1>
        <p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-body">
          Choose an asset from your wallet, compare protection options, and select how much to deposit.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-[13px] text-body">
          <p>
            Need assets?{" "}
            <Link to="/trade" className="font-bold text-ink underline underline-offset-4">
              Go to Trade ↗
            </Link>
          </p>
          <Link to="/positions" className="font-bold text-senior-dark underline underline-offset-4">
            View existing positions
          </Link>
        </div>
      </header>
      {!owner && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-card border border-senior/20 bg-senior-tint p-5">
          <div>
            <p className="font-bold">Connect wallet to see your balances.</p>
            <p className="mt-1 text-[13px] text-body">You can explore protection options before connecting.</p>
          </div>
          <Link to="/connect?next=%2Fmarkets" className={buttonStyles({ variant: "senior" })}>
            Connect wallet
          </Link>
        </div>
      )}
      {owner && balancesError && (
        <p role="status" className="mb-5 text-[14px] text-amber-deep">
          Wallet balances could not be loaded. Refresh to try again.
        </p>
      )}
      {error && (
        <p role="status" className="mb-5 text-[14px] text-amber-deep">
          Protection availability could not be verified. Refresh to try again.
        </p>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold">Assets you can protect</h2>
          <p className="mt-1 text-[13px] text-body">Wallet balances exclude assets already deposited into positions.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refresh();
            refreshBalances();
          }}
          className="min-h-11 text-[13px] font-bold text-ink"
        >
          {loading || balancesLoading ? "Checking…" : "Refresh balances & status ↻"}
        </button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        {assets.map(({ stock, holding }) => {
          const choices = fresh ? (data?.assets.filter((asset) => asset.symbol === stock.symbol) ?? []) : [];
          const summary = summarizeProtection(choices);
          const available = summary.acceptingCount > 0;
          const label = !fresh
            ? error
              ? "Availability unavailable"
              : loading
                ? "Checking availability"
                : "Refresh required"
            : available
              ? `${summary.acceptingCount} ${summary.acceptingCount === 1 ? "pool" : "pools"} accepting deposits`
              : choices.length > 0 && choices.every((choice) => choice.pool.state === "missing")
                ? "Pools being prepared"
                : choices.some((choice) => choice.actions.openPosition.state === "unknown")
                  ? "Availability unverified"
                  : "Deposits unavailable";
          const canProtect = available && holding !== null && holding.amount > 0n;
          const balanceMessage = !owner
            ? "Connect to view balance"
            : balancesLoading
              ? "Checking balance…"
              : "Balance unavailable";
          return (
            <article
              key={stock.symbol}
              className="flex min-w-0 flex-col rounded-card border border-hairline bg-surface p-5 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <AssetGlyph glyph="generic" label={stock.name} symbol={stock.symbol} size={48} />
                  <div className="min-w-0 break-words">
                    <h3 className="text-[22px] font-extrabold tracking-tight2">{stock.name}</h3>
                    <p className="text-[12px] text-body">
                      {stock.symbol} · {stock.category}
                    </p>
                  </div>
                </div>
                <span
                  className={`max-w-full rounded-input px-2.5 py-1.5 text-[11px] font-bold ${available ? "bg-senior-tint text-senior-dark" : "bg-subtle text-body"}`}
                >
                  {label}
                </span>
              </div>
              <div className="my-6 rounded-input bg-subtle px-4 py-5">
                <p className="text-[12px] font-semibold text-body">In your wallet</p>
                {holding ? (
                  <p className="mt-2 break-words text-[28px] font-bold leading-tight tracking-tight2 tnum sm:text-[32px]">
                    {formatAmount(holding.amount, holding.token.decimals, holding.token.decimals)}
                    <span className="mt-1 block text-[13px] font-semibold tracking-normal text-body">
                      {stock.symbol}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-[16px] font-semibold text-body">{balanceMessage}</p>
                )}
              </div>
              <dl className="mb-6 grid grid-cols-2 gap-x-5 gap-y-5 text-[13px]">
                <div className="col-span-2">
                  <dt className="text-body">Protected exit into</dt>
                  <dd className="mt-1 font-bold">
                    {summary.completeTerms ? summary.backing.join(" or ") : "Terms pending"}
                  </dd>
                </div>
                <div>
                  <dt className="text-body">Waiting period</dt>
                  <dd className="mt-1 font-bold">
                    {!summary.completeTerms || !summary.waitRange
                      ? "Terms pending"
                      : summary.waitRange[0] === summary.waitRange[1]
                        ? formatDuration(BigInt(summary.waitRange[0]))
                        : `${formatDuration(BigInt(summary.waitRange[0]))}–${formatDuration(BigInt(summary.waitRange[1]))}`}
                  </dd>
                </div>
                <div>
                  <dt className="text-body">Share of positive gains</dt>
                  <dd className="mt-1 font-bold">
                    {!summary.completeTerms || !summary.gainRange
                      ? "Terms pending"
                      : summary.gainRange[0] === summary.gainRange[1]
                        ? formatBps(summary.gainRange[0])
                        : `${formatBps(summary.gainRange[0])}–${formatBps(summary.gainRange[1])}`}
                  </dd>
                </div>
              </dl>
              <p className="mb-5 text-[12px] leading-relaxed text-body">
                {summary.poolCount > 1
                  ? "Compare each pool’s terms, backing and capacity before depositing."
                  : "Review the pool’s terms, backing and capacity before depositing."}
              </p>
              <Link
                to={`/protection/new?asset=${stock.symbol}`}
                aria-label={canProtect ? `Protect ${stock.name}` : `View ${stock.name} protection options`}
                className={buttonStyles({ variant: "senior", full: true, className: "mt-auto px-3 text-center" })}
              >
                {canProtect ? `Protect ${stock.name}` : "View protection options"}
              </Link>
            </article>
          );
        })}
      </div>
      <div className="my-9 flex flex-wrap items-center justify-between gap-5 rounded-card border border-hairline bg-white p-6">
        <div>
          <h2 className="text-[18px] font-bold">First time here?</h2>
          <p className="mt-1 text-[14px] text-body">
            Connect a wallet, get test ETH for network fees, then request a basket of free test tokens.
          </p>
        </div>
        <Link to="/test-tokens?next=%2Fmarkets" className="font-bold text-ink underline underline-offset-2">
          Set up your test wallet
        </Link>
      </div>
      <div className="grid gap-7 border-t border-hairline py-8 md:grid-cols-2">
        <div>
          <h2 className="text-[18px] font-bold">Collateral that holds vault shares</h2>
          <p className="mt-2 max-w-[50ch] text-[14px] leading-relaxed text-body">
            Choose direct TestUSDC or vUSDC vault shares. Vault-backed payouts arrive as shares you can redeem
            separately for the underlying TestUSDC.
          </p>
        </div>
        <div>
          <h2 className="text-[18px] font-bold">Want to provide collateral?</h2>
          <p className="mt-2 max-w-[50ch] text-[14px] leading-relaxed text-body">
            Back stock and crypto positions, receive a share of gains, and take the junior loss risk.
          </p>
          <Link
            to="/provide"
            className="mt-3 inline-block text-[14px] font-bold text-junior underline underline-offset-2"
          >
            Explore collateral pools
          </Link>
        </div>
      </div>
      <p className="pb-5 text-[12px] leading-relaxed text-body">
        Deposits open a protection position. Waiting periods, collateral caps and availability checks apply to each
        pool.
      </p>
    </div>
  );
}
