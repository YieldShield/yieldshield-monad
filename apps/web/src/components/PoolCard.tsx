import { useNavigate } from "react-router-dom";
import { AssetGlyph, Bar, ChainBadge, StatTile } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatBps } from "@/lib/format";
import { VOCAB } from "@/vocab";
import type { PoolView } from "@/data/pools";

/** Explore marketplace card — savings-framed. Paused pools show the calm amber state, not clickable. */
export function PoolCard({ pool }: { pool: PoolView }) {
  const navigate = useNavigate();
  const { preset, stats, paused } = pool;
  const coverage = stats.coverageBps === null ? 0 : Math.min(100, Number(stats.coverageBps) / 100);
  const capacity = stats.capacityBps === null ? 0 : Number(stats.capacityBps) / 100;

  return (
    <button
      onClick={() => navigate(`/pool/${pool.address}`)}
      className={cn(
        "w-full rounded-card border border-hairline bg-surface p-[18px] text-left transition-shadow md:p-6",
        paused ? "cursor-default opacity-95" : "hover:shadow-card",
      )}
    >
      <div className="flex items-center gap-3">
        <AssetGlyph glyph={preset.glyph} label={preset.asset} symbol={pool.shielded.symbol} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[16px] font-extrabold tracking-tight2">
              {preset.asset} {VOCAB.saverShort}
            </span>
          </div>
          <div className="truncate text-[13px] text-muted">{preset.source}</div>
        </div>
        <ChainBadge />
      </div>

      {paused ? (
        <div className="mt-4 rounded-input border border-amber-border bg-amber-tint px-3.5 py-3 text-[13px] font-semibold text-amber-deep">
          {VOCAB.pausedForSafety}
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <StatTile label={VOCAB.protectedApy} value="No fixed yield" tone="green" />
            <StatTile label="Share of gains" value={formatBps(stats.premiumRateBp)} tone="indigo" />
          </div>
          <div className="mt-4 space-y-3">
            <BarRow
              label={VOCAB.coverage}
              value={stats.coverageBps === null ? "Not available" : `${Math.round(coverage)}%`}
              pct={coverage}
              tone="green"
            />
            <BarRow label="Capacity" value={`${Math.round(capacity)}%`} pct={capacity} tone="ink" />
          </div>
        </>
      )}
    </button>
  );
}

function BarRow({ label, value, pct, tone }: { label: string; value: string; pct: number; tone: "green" | "ink" }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[12.5px] font-semibold text-muted">
        <span>{label}</span>
        <span className="tnum text-ink">{value}</span>
      </div>
      <Bar pct={pct} tone={tone} />
    </div>
  );
}
