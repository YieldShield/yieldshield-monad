import { useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import { stockBrand } from "@/config/stocks";
import { cn } from "@/lib/cn";
import { chain } from "@/chain/adapter";
import type { PoolGlyph } from "@/config/pools";

// --- Card -------------------------------------------------------------------
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-hairline bg-surface p-[18px] md:p-6", className)} {...props} />;
}

// --- Buttons ----------------------------------------------------------------
type Variant = "primary" | "ink" | "senior" | "junior" | "green" | "indigo" | "secondary" | "ghost";
type ButtonStyleProps = { variant?: Variant; full?: boolean; className?: string };

const VARIANTS: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink/90 focus-visible:outline-ink",
  senior: "bg-senior text-white hover:bg-senior-dark focus-visible:outline-senior",
  junior: "bg-junior text-white hover:bg-junior-accent focus-visible:outline-junior",
  ink: "bg-ink text-white hover:bg-ink/90",
  green: "bg-senior text-white hover:bg-senior-dark focus-visible:outline-senior",
  indigo: "bg-junior text-white hover:bg-junior-accent focus-visible:outline-junior",
  secondary: "bg-subtle-2 text-ink hover:bg-hairline",
  ghost: "bg-transparent text-body hover:bg-subtle-2",
};

/** Shared action styling for buttons and links, with room for wrapped labels. */
export function buttonStyles({ variant = "ink", full, className }: ButtonStyleProps = {}) {
  return cn(
    "inline-flex min-h-[52px] min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal rounded-input px-5 py-3 text-center text-[15px] font-bold transition-colors",
    "disabled:cursor-not-allowed disabled:bg-disabled disabled:text-white/80 disabled:hover:bg-disabled",
    full && "w-full",
    VARIANTS[variant],
    className,
  );
}

export function Button({
  variant = "ink",
  className,
  full,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps) {
  return <button className={buttonStyles({ variant, full, className })} {...props} />;
}

// --- Pill / Badge -----------------------------------------------------------
export function Pill({
  tone = "neutral",
  className,
  children,
}: {
  tone?: "senior" | "junior" | "green" | "indigo" | "amber" | "neutral";
  className?: string;
  children: ReactNode;
}) {
  const tones = {
    senior: "bg-senior-tint text-senior-dark",
    junior: "bg-junior-tint text-junior",
    green: "bg-senior-tint text-senior-dark",
    indigo: "bg-junior-tint text-junior",
    amber: "bg-amber-tint text-amber-deep",
    neutral: "bg-subtle-2 text-body",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-3 py-1 text-[13px] font-semibold tnum",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: "green" | "indigo" | "amber" | "solana" }) {
  const c = { green: "bg-green", indigo: "bg-indigo", amber: "bg-amber", solana: "bg-solana" }[tone];
  return <span className={cn("inline-block h-2 w-2 rounded-full", c)} />;
}

export function ChainBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted", className)}>
      <span className="h-2.5 w-2.5 rounded-[3px] bg-[#0052FF]" />
      {chain.label}
    </span>
  );
}

// --- Stat tile --------------------------------------------------------------
export function StatTile({
  label,
  value,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  tone?: "green" | "indigo" | "neutral";
  sub?: string;
}) {
  const tones = {
    green: "bg-green-tint-2 text-green-dark",
    indigo: "bg-indigo-tint-3 text-indigo",
    neutral: "bg-subtle text-ink",
  } as const;
  return (
    <div className={cn("rounded-input p-3.5", tones[tone])}>
      <div className="text-[11px] font-bold uppercase tracking-[0.3px] opacity-70">{label}</div>
      <div className="mt-1 text-[18px] font-extrabold tnum">{value}</div>
      {sub && <div className="text-[12px] font-medium opacity-70">{sub}</div>}
    </div>
  );
}

// --- Thin bars --------------------------------------------------------------
export function Bar({ pct, tone = "green" }: { pct: number; tone?: "green" | "ink" | "indigo" }) {
  const fill = { green: "bg-gradient-to-r from-green to-green-bright", ink: "bg-ink", indigo: "bg-indigo" }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-pill bg-subtle-2">
      <div className={cn("h-full rounded-pill", fill)} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

// --- Asset glyph ------------------------------------------------------------
/** Decorative identity next to a visible company/token name. Never accepts remote image URLs. */
export function AssetGlyph({
  glyph,
  label,
  symbol,
  size = 40,
}: {
  glyph: PoolGlyph;
  label: string;
  symbol?: string;
  size?: number;
}) {
  const brand = stockBrand(symbol ?? label);
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const logo = brand?.logo;
  const showLogo = logo && failedLogo !== logo;
  const styles = {
    usdc: "bg-usdc-bg text-usdc-fg",
    jitosol: "bg-jitosol-bg text-jitosol-fg",
    generic: "bg-subtle-2 text-body",
  } as const;
  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-chip font-extrabold",
        showLogo ? "border border-hairline bg-white" : styles[glyph],
      )}
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {showLogo ? (
        <img
          src={logo}
          alt=""
          width={Math.min(32, size * 0.65)}
          height={Math.min(32, size * 0.65)}
          className="object-contain"
          decoding="async"
          draggable={false}
          onError={() => setFailedLogo(logo)}
        />
      ) : (
        (brand?.name ?? label).slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

// --- Spinner ----------------------------------------------------------------
export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("h-5 w-5 animate-spin", className)} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

// --- Section label ----------------------------------------------------------
export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("section-label", className)}>{children}</div>;
}
