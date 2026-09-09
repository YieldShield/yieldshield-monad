import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "@/components/icons";
import { cn } from "@/lib/cn";

/** Collapsible "Advanced & on-chain details" panel — progressive disclosure of chain machinery. */
export function Expander({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className="rounded-card border border-hairline bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[14px] font-bold text-ink"
      >
        {title}
        <ChevronDown
          aria-hidden="true"
          className={cn("h-5 w-5 shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={panelId} hidden={!open} className="border-t border-hairline px-4 py-3.5">
        {open && children}
      </div>
    </div>
  );
}

/** A label/value row used inside expanders and review panels. */
export function Row({ label, value, tone }: { label: string; value: ReactNode; tone?: "green" | "indigo" | "muted" }) {
  const valueClass =
    tone === "green"
      ? "text-green-dark"
      : tone === "indigo"
        ? "text-indigo"
        : tone === "muted"
          ? "text-muted"
          : "text-ink";
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-[14px]">
      <span className="min-w-0 flex-1 text-body [overflow-wrap:anywhere]">{label}</span>
      <span className={cn("min-w-0 flex-1 text-right font-semibold tnum [overflow-wrap:anywhere]", valueClass)}>
        {value}
      </span>
    </div>
  );
}
