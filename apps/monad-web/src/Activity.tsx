import useSWR from "swr";
import { explorer, fetcher, fmt, short } from "./lib";
import "./activity.css";

export type ActivityEvent = {
  id: string;
  kind:
    | "protected"
    | "provided"
    | "asset-withdrawn"
    | "asset-partially-withdrawn"
    | "protection-used"
    | "backing-withdrawn"
    | "notice-started"
    | "notice-cancelled"
    | "commission-claimed";
  poolLabel: string;
  environment: "reference" | "scenario";
  actor: string;
  asset: { address: string; symbol: string; decimals: number } | null;
  amount: string | null;
  receiptId: string | null;
  transactionHash: string;
  timestamp: number;
};
export type ActivitySnapshot = {
  chainId: number;
  source: string;
  status: "ready" | "indexing" | "stale" | "unavailable" | "not-configured";
  complete: boolean;
  observedAt: number | null;
  indexedThrough: number | null;
  poolCount: number;
  hasMore: boolean;
  events: ActivityEvent[];
};
const labels: Record<ActivityEvent["kind"], string> = {
  protected: "Protection opened",
  provided: "Backing supplied",
  "asset-withdrawn": "Asset withdrawn",
  "asset-partially-withdrawn": "Asset partially withdrawn",
  "protection-used": "Backing payout",
  "backing-withdrawn": "Backing withdrawn",
  "notice-started": "Withdrawal requested",
  "notice-cancelled": "Withdrawal cancelled",
  "commission-claimed": "Fees claimed",
};

export function ActivityHistory({
  data,
  failed = false,
  personal = false,
}: {
  data?: ActivitySnapshot;
  failed?: boolean;
  personal?: boolean;
}) {
  // Treat foreign-chain or malformed snapshots as unavailable, never as an
  // empty wallet. No action button relies on these indexed observations.
  const valid =
    data?.chainId === 10143 &&
    Array.isArray(data.events) &&
    data.events.every(
      (event) => Number.isSafeInteger(event?.timestamp) && event.timestamp >= 0 && event.timestamp <= 8640000000000,
    );
  const unavailable = failed || (data && (!valid || ["unavailable", "not-configured"].includes(data.status)));
  const pending = !data || data.status === "indexing";
  const stale = valid && data.status === "stale";
  const events = valid ? data.events : [];
  return (
    <section className="activity-panel" aria-label={personal ? "Your activity" : "Recent pool activity"}>
      <div className="activity-heading">
        <h2>{personal ? "Your activity" : "Recent activity"}</h2>
        <a href="https://envio.dev/chains/monad-testnet" target="_blank" rel="noreferrer">
          Indexed by Envio ↗
        </a>
      </div>
      {unavailable ? (
        <p role="status">Activity is temporarily unavailable. Your positions are unaffected.</p>
      ) : pending ? (
        <p role="status">Loading onchain activity…</p>
      ) : stale ? (
        <p className="activity-delayed" role="status">
          Updates are delayed. Showing the last indexed activity.
        </p>
      ) : !events.length ? (
        <p>
          {personal ? "No activity for this wallet in the indexed pools." : "No activity in the indexed pools yet."}
        </p>
      ) : null}
      {events.length > 0 ? (
        <ol className="activity-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="activity-dot" aria-hidden="true" />
              <div className="activity-description">
                <strong>{labels[event.kind]}</strong>
                <span>
                  {event.poolLabel}
                  {event.environment === "scenario" ? " · Demo" : ""}
                  {!personal ? ` · ${short(event.actor)}` : ""}
                </span>
              </div>
              <div className="activity-value">
                {event.asset && event.amount != null ? (
                  <strong>
                    {fmt(event.amount, event.asset.decimals, 5)} {event.asset.symbol}
                  </strong>
                ) : null}
                <time dateTime={new Date(event.timestamp * 1000).toISOString()}>
                  {new Date(event.timestamp * 1000).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <a
                className="activity-receipt"
                href={explorer("tx", event.transactionHash)}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${labels[event.kind].toLowerCase()} transaction`}
              >
                ↗
              </a>
            </li>
          ))}
        </ol>
      ) : null}
      {valid && data.indexedThrough != null ? (
        <p className="activity-footer">
          {data.poolCount} deployment pools · Block {data.indexedThrough.toLocaleString()}
          {data.hasMore ? " · Latest activity shown" : ""}
        </p>
      ) : null}
    </section>
  );
}

export function Activity({ owner }: { owner?: string }) {
  const query = owner ? `?owner=${encodeURIComponent(owner)}&limit=20` : "?limit=8";
  const { data, error } = useSWR<ActivitySnapshot>(`/api/activity${query}`, fetcher, {
    refreshInterval: (snapshot) => (snapshot?.status === "indexing" ? 5000 : 30000),
    errorRetryCount: 1,
    revalidateOnFocus: false,
    keepPreviousData: false,
  });
  return <ActivityHistory data={data} failed={Boolean(error)} personal={Boolean(owner)} />;
}
