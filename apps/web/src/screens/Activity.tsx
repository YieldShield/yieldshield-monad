import { CheckIcon, PlusIcon, ShieldIcon, SwapIcon } from "@/components/icons";
import { Card, ChainBadge } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatRelative, formatToken } from "@/lib/format";
import { chain } from "@/chain/adapter";
import { useActivity, type ActivityVM } from "@/data/activity";

const META: Record<ActivityVM["kind"], { label: string; inflow: boolean; Icon: typeof PlusIcon }> = {
  deposit: { label: "Deposited", inflow: false, Icon: PlusIcon },
  backing: { label: "Backed a pool", inflow: false, Icon: ShieldIcon },
  withdraw: { label: "Withdrawal", inflow: true, Icon: SwapIcon },
  activate: { label: "Exited with protection", inflow: true, Icon: ShieldIcon },
  collect: { label: "Collected premium", inflow: true, Icon: CheckIcon },
  notice: { label: "Withdrawal notice", inflow: false, Icon: SwapIcon },
};

function title(e: ActivityVM): string {
  if (e.kind === "deposit") return `Deposited${e.symbol ? ` ${e.symbol}` : ""}`;
  return META[e.kind].label;
}

function amountLabel(e: ActivityVM): string | null {
  if (e.rawAmount == null || e.decimals == null) return null;
  return formatToken(e.rawAmount, e.decimals, e.symbol ?? "");
}

export function Activity() {
  const { loading, entries } = useActivity();

  return (
    <div className="animate-fade-up">
      <h1 className="page-title mb-5">Activity</h1>

      {loading ? (
        <div className="h-40 animate-pulse rounded-card bg-subtle" />
      ) : entries.length === 0 ? (
        <Card>
          <p className="text-[14px] text-body">No activity yet. Your deposits and earnings will show up here.</p>
        </Card>
      ) : (
        <>
          {/* Mobile: list */}
          <div className="overflow-hidden rounded-card border border-hairline bg-surface md:hidden">
            {entries.map((e, i) => (
              <Link
                key={e.txId}
                e={e}
                className={cn("flex items-center gap-3 p-4", i > 0 && "border-t border-hairline")}
              />
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-card border border-hairline bg-surface md:block">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-hairline text-[12px] font-bold uppercase tracking-[0.3px] text-muted">
                  <th className="px-5 py-3 font-bold">Transaction</th>
                  <th className="px-5 py-3 font-bold">Network</th>
                  <th className="px-5 py-3 text-right font-bold">Amount</th>
                  <th className="px-5 py-3 text-right font-bold">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const { Icon, inflow } = META[e.kind];
                  const amt = amountLabel(e);
                  return (
                    <tr key={e.txId} className="border-b border-hairline last:border-0 hover:bg-subtle">
                      <td className="px-5 py-3.5">
                        <a
                          href={chain.explorerTxUrl(e.txId)}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3"
                        >
                          <span className="flex h-9 w-9 items-center justify-center rounded-chip bg-subtle-2 text-ink">
                            <Icon className="h-4.5 w-4.5" />
                          </span>
                          <span className="text-[14.5px] font-bold text-ink">{title(e)}</span>
                        </a>
                      </td>
                      <td className="px-5 py-3.5">
                        <ChainBadge />
                      </td>
                      <td
                        className={cn(
                          "px-5 py-3.5 text-right text-[14.5px] font-bold tnum",
                          inflow ? "text-ink" : "text-ink",
                        )}
                      >
                        {amt ? `${inflow ? "+" : ""}${amt}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right text-[13px] text-muted">
                        {e.timestamp ? formatRelative(e.timestamp) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Link({ e, className }: { e: ActivityVM; className?: string }) {
  const { Icon, inflow } = META[e.kind];
  const amt = amountLabel(e);
  return (
    <a href={chain.explorerTxUrl(e.txId)} target="_blank" rel="noreferrer" className={className}>
      <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-subtle-2 text-ink">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px] font-bold text-ink">{title(e)}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
          <ChainBadge />
          {e.timestamp && <span>· {formatRelative(e.timestamp)}</span>}
        </div>
      </div>
      {amt && (
        <div className={cn("text-[14.5px] font-bold tnum", inflow ? "text-ink" : "text-ink")}>
          {inflow ? "+" : ""}
          {amt}
        </div>
      )}
    </a>
  );
}
