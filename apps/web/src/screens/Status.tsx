import { Link } from "react-router-dom";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { useProtectionStatus } from "@/data/protection-status";
import { sessionTime } from "@/lib/protection-status";
import { formatBps } from "@/lib/format";

export function Status() {
  const { data, fresh, loading, refresh } = useProtectionStatus();
  const demo = data?.policy?.kind === "continuous-demo";
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 pb-8">
        <div>
          <h1 className="page-title">Protection status</h1>
          <p className="mt-3 text-[15px] text-body">Current availability and launch progress.</p>
        </div>
        <button
          onClick={() => void refresh()}
          className="rounded-input border border-hairline bg-white px-4 py-3 text-[14px] font-bold"
        >
          Refresh status ↻
        </button>
      </div>
      <AvailabilityNotice />
      <div className="my-7 grid items-start gap-5 md:grid-cols-2">
        {demo ? (
          <section className="rounded-card border border-hairline bg-white p-6">
            <h2 className="text-[20px] font-bold">24/7 test environment</h2>
            <p className="mt-3 text-[14px] leading-relaxed text-body">
              Demo prices follow a two-hour cycle, rising and falling by up to 25%. They are calculated onchain and do
              not track real market prices.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-body">
              Each position shows its own exit time and available collateral.
            </p>
          </section>
        ) : data ? (
          <details className="rounded-card border border-hairline bg-white p-6">
            <summary className="cursor-pointer text-[18px] font-bold">Configured stock session</summary>
            <p className="mt-3 text-[14px] leading-relaxed text-body">
              The deployed opening window is{" "}
              {fresh && data?.session.state === "open" ? (
                <strong className="text-ink">open until {sessionTime(data.session.closesAt)}</strong>
              ) : fresh && data?.session.nextOpenAt && data.session.state === "closed" ? (
                <strong className="text-ink">scheduled to open {sessionTime(data.session.nextOpenAt)}</strong>
              ) : fresh && data?.session.state === "paused" ? (
                "paused"
              ) : fresh && data?.session.state === "closed" ? (
                "closed; the next opening is not currently verified"
              ) : (
                "not currently verified"
              )}
              . Times use your local timezone.
            </p>
            <p className="mt-3 text-[14px] leading-relaxed text-body">
              New protection also requires valid prices and collateral. Each withdrawal has its own checks.
            </p>
          </details>
        ) : null}
        <section className="rounded-card border border-hairline bg-white p-6">
          <h2 className="text-[20px] font-bold">Alpha launch</h2>
          {fresh && data?.deployment.verified ? (
            <>
              <p className="mt-3 text-[14px] text-body">
                {data.deployment.contractsConfirmed} contracts confirmed · {data.deployment.poolsReady} of{" "}
                {data.deployment.totalPools} pools ready
              </p>
              <ol className="mt-5 space-y-4">
                {data.deployment.steps.map((step) => (
                  <li key={step.code} className="flex items-center gap-3 text-[14px]">
                    <span
                      aria-hidden
                      className={`flex h-6 w-6 items-center justify-center rounded-full ${step.complete ? "bg-blue-50 text-[#0052FF]" : "bg-subtle text-body"}`}
                    >
                      {step.complete ? "✓" : "·"}
                    </span>
                    <span>
                      {step.label} <span className="text-body">· {step.complete ? "Complete" : "Pending"}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p role="status" className="mt-3 text-[14px] text-body">
              {loading
                ? "Reading the deployed configuration…"
                : "Live checks are unavailable. We cannot confirm launch progress."}
            </p>
          )}
          <Link to="/test-tokens" className="mt-6 inline-block text-[13px] font-bold text-[#0052FF] underline">
            Prepare your test wallet
          </Link>
        </section>
      </div>
      <section className="pb-8">
        <h2 className="mb-4 text-[22px] font-bold">Availability by pool</h2>
        <p className="mb-5 text-[14px] leading-relaxed text-body">
          {demo
            ? "Trading and protection use the same demo prices. Each action is checked against current balances and pool funds."
            : data
              ? "Source prices come from Base mainnet. Protection uses verified Sepolia observations. Withdrawals have separate checks."
              : "Checking the current test environment."}
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {data?.assets.map((asset) => (
            <article key={asset.pool.address ?? asset.symbol} className="rounded-card border border-hairline bg-white p-5">
              <h3 className="text-[18px] font-bold">
                {asset.name} <span className="text-[12px] font-medium text-body">{asset.symbol}</span>
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-body">
                {fresh && asset.pool.terms
                  ? `Backed by ${asset.pool.terms.backingSymbol} · ${formatBps(asset.pool.terms.collateralRatioBps)} collateral · ${formatBps(asset.pool.terms.commissionBps + asset.pool.terms.poolFeeBps + asset.pool.terms.protocolFeeBps)} of positive gains`
                  : "Backing terms are not currently verified."}
              </p>
              {demo ? (
                <dl className="mt-4 space-y-3 text-[13px]">
                  <div>
                    <dt className="text-body">Demo price</dt>
                    <dd className="mt-1 font-semibold">
                      {fresh && asset.executionPrice
                        ? `${asset.executionPrice.priceUsd.toFixed(2)} Test USDC`
                        : "Not verified"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <dl className="mt-4 space-y-3 text-[13px]">
                  <div>
                    <dt className="text-body">Source price timestamp</dt>
                    <dd className="mt-1 font-semibold">
                      {fresh && asset.sourcePrice ? sessionTime(asset.sourcePrice.updatedAt) : "Not verified"}
                      {fresh && asset.sourcePrice && !asset.sourcePrice.freshForOpening
                        ? " · Too old for a new position"
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-body">Sepolia observation</dt>
                    <dd className="mt-1 font-semibold">
                      {!fresh ? "Not verified" : asset.relay?.fresh ? "Current" : "Expired or unavailable"}
                    </dd>
                  </div>
                </dl>
              )}
              <div className="mt-4 border-t border-hairline pt-3">
                <p className="text-[13px] font-bold">New positions</p>
                <p className="mt-1 text-[13px] leading-relaxed text-body">
                  {!fresh
                    ? "Status expired. Refresh before continuing."
                    : asset.actions.openPosition.state === "available"
                      ? "Available, subject to your wallet’s transaction check."
                      : asset.actions.openPosition.blockers.map((b) => b.message).join(" ")}
                </p>
              </div>
              <Link to="/positions" className="mt-4 inline-block text-[13px] font-bold text-[#0052FF]">
                Check exits for my positions →
              </Link>
            </article>
          ))}
        </div>
      </section>
      {fresh && data?.destination && (
        <p className="mb-5 text-[12px] text-body">
          Checked {sessionTime(data.evaluatedAt)} at{" "}
          <a
            href={`https://sepolia.basescan.org/block/${data.destination.blockNumber}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Base Sepolia block {data.destination.blockNumber}
          </a>
          . Availability is rechecked before each transaction.
        </p>
      )}
    </div>
  );
}
