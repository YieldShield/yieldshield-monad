import { Link, useParams } from "react-router-dom";
import { Row } from "@/components/Expander";
import { AssetGlyph, buttonStyles, Card } from "@/components/ui";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { formatBps, formatDuration, formatToken } from "@/lib/format";
import { usePool } from "@/data/pools";
import { useProtectionStatus } from "@/data/protection-status";

export function PoolDetail() {
  const { poolId } = useParams();
  const { pool, loading, error } = usePool(poolId);
  const { now } = useProtectionStatus();
  if (loading) return <Card role="status">Reading pool terms…</Card>;
  if (!pool || error)
    return (
      <Card>
        <p>
          {error
            ? "Pool terms could not be verified. Refresh before continuing."
            : "This pool was not found in the current deployment."}
        </p>
        <Link to="/markets" className="mt-4 inline-block font-bold text-senior">
          Explore assets
        </Link>
      </Card>
    );
  const { stats, shielded, backing, availability } = pool;
  const fresh = availability && now >= Number(availability.evaluatedAt) && now < Number(availability.validUntil);
  return (
    <div className="mx-auto max-w-[660px]">
      <Link to="/markets" className="text-[13px] font-bold text-body">
        ← Explore assets
      </Link>
      <div className="mt-7 flex items-center gap-3">
        <AssetGlyph glyph={pool.preset.glyph} label={pool.preset.asset} symbol={shielded.symbol} size={48} />
        <h1 className="page-title">{pool.preset.asset} protection terms</h1>
      </div>
      <p className="mb-6 mt-3 text-[14px] leading-relaxed text-body">
        Withdraw your assets or take an eligible protected exit into {backing.symbol}.
      </p>
      <AvailabilityNotice />
      <Card className="mt-5">
        <h2 className="mb-3 text-[20px] font-bold">Your protection</h2>
        <Row label="Protected exit into" value={backing.symbol} />
        <Row label="Waiting period" value={`${formatDuration(stats.minimumPoolTime)} after deposit`} />
        <Row label="Required collateral ratio" value={formatBps(stats.collateralRatioBp)} />
        <Row
          label="Available deposit capacity"
          value={
            fresh && availability.maxShieldedDeposit !== null
              ? formatToken(availability.maxShieldedDeposit, shielded.decimals, shielded.symbol, shielded.decimals)
              : "Unavailable"
          }
        />
        <p className="mt-4 text-[13px] leading-relaxed text-body">
          A protected exit exchanges the entire position for its recorded entry value, capped by its reserved
          collateral. Enough pool funds and valid prices must be available. It can fail.
        </p>
      </Card>
      <Card className="mt-4">
        <h2 className="mb-3 text-[20px] font-bold">Fees on gains</h2>
        <Row label="Collateral providers" value={formatBps(stats.premiumRateBp)} />
        <Row label="Pool fee" value={formatBps(stats.poolFeeBp)} />
        <Row label="Protocol fee" value={formatBps(stats.protocolFeeBp)} />
        <Row
          label="Total share of gains"
          value={formatBps(stats.premiumRateBp + stats.poolFeeBp + stats.protocolFeeBp)}
        />
        <p className="mt-3 text-[13px] text-body">Network fees are separate and shown in your wallet.</p>
      </Card>
      <p className="mt-5 text-[13px] leading-relaxed text-body">
        {!fresh
          ? "A fresh check is required before depositing."
          : availability.openPosition.state === "available"
            ? "Accepting deposits, subject to your wallet’s final check."
            : availability.openPosition.blockers.map((b) => b.message).join(" ")}
      </p>
      <Link
        to={`/protection/new?pool=${pool.address}`}
        className={buttonStyles({ variant: "senior", full: true, className: "mt-5" })}
      >
        Prepare a protection position
      </Link>
      <details className="mt-7 rounded-card border border-hairline p-5">
        <summary className="cursor-pointer text-[14px] font-bold">Providing collateral</summary>
        <p className="mt-3 text-[13px] leading-relaxed text-body">
          Collateral providers share {formatBps(stats.premiumRateBp)} of gains and absorb loss risk. This pool requires{" "}
          {formatDuration(stats.unlockDuration)} withdrawal notice. An exit also requires enough unlocked liquidity.
        </p>
        <Link to={`/provide?pool=${pool.address}`} className="mt-4 inline-block text-[14px] font-bold text-junior">
          Review a collateral deposit
        </Link>
      </details>
      <p className="mt-5 break-all text-[11px] text-body">
        Pool contract:{" "}
        <a
          href={`https://sepolia.basescan.org/address/${pool.address}`}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          {pool.address}
        </a>
      </p>
    </div>
  );
}
