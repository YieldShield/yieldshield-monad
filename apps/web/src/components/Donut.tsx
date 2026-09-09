import { TRANCHE_COLORS } from "@/lib/tranche-colors";

/** Coverage donut — a senior-purple arc over a hairline track, with a hero figure in the centre. */
export function Donut({
  pct,
  centerLabel,
  sublabel,
  size = 140,
}: {
  pct: number;
  centerLabel: string;
  sublabel?: string;
  size?: number;
}) {
  const stroke = 12;
  const r = (size - stroke) / 2 - 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  const cx = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <defs>
          <linearGradient id="donut-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={TRANCHE_COLORS.senior.DEFAULT} />
            <stop offset="100%" stopColor={TRANCHE_COLORS.senior.bright} />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#ECEEF1" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="url(#donut-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      </svg>
      <div className="absolute text-center">
        <div className="hero-num text-[24px] text-senior-dark">{centerLabel}</div>
        {sublabel && <div className="text-[11px] font-semibold text-muted">{sublabel}</div>}
      </div>
    </div>
  );
}
