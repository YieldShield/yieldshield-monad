import { useMemo, useState } from "react";
import { PoolCard } from "@/components/PoolCard";
import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usePools, type PoolView } from "@/data/pools";

const FILTERS = ["All pools", "Apple", "NVIDIA", "Meta", "Alphabet"] as const;
type Filter = (typeof FILTERS)[number];

function matches(pool: PoolView, filter: Filter): boolean {
  if (filter === "All pools") return true;
  const symbols = { Apple: "AAPL", NVIDIA: "NVDA", Meta: "META", Alphabet: "GOOGL" };
  return pool.shielded.symbol.toUpperCase().includes(symbols[filter]);
}

export function Explore() {
  const [filter, setFilter] = useState<Filter>("All pools");
  const { loading, error, data } = usePools();
  const pools = useMemo(() => data.filter((p) => matches(p, filter)), [data, filter]);

  return (
    <div className="animate-fade-up">
      <h1 className="page-title mb-1">Explore</h1>
      <p className="mb-5 text-[14px] text-body">
        Explore Base Sepolia pools with valueless test stocks. Protection is conditional and can fail.
      </p>

      <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "shrink-0 rounded-pill px-4 py-2 text-[13px] font-semibold transition-colors",
              filter === f ? "bg-ink text-white" : "bg-subtle-2 text-body hover:bg-hairline",
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeletons />
      ) : error ? (
        <Card>
          <p className="text-[14px] text-body">
            Pool data is unavailable. Retry shortly; live stock references are available on Markets.
          </p>
        </Card>
      ) : pools.length === 0 ? (
        <Card>
          <p className="text-[14px] text-body">No pools here yet.</p>
        </Card>
      ) : (
        <div className="grid gap-3.5 md:grid-cols-2">
          {pools.map((p) => (
            <PoolCard key={p.address} pool={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="grid gap-3.5 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[196px] animate-pulse rounded-card border border-hairline bg-subtle" />
      ))}
    </div>
  );
}
