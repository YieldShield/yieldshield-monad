/** Original overlapping ink and Base-blue squares. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="6" fill="#0E1114" />
      <rect x="11" y="11" width="18" height="18" rx="6" fill="#0052FF" fillOpacity="0.92" />
      <rect x="11" y="11" width="10" height="10" rx="4" fill="#0E1114" fillOpacity="0.45" />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={size} />
      <span className="text-[18px] font-extrabold tracking-tight2 text-ink">YieldShield</span>
      <span className="rounded bg-subtle-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted">
        Base
      </span>
    </div>
  );
}
