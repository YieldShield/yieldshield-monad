import { useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Donut } from "@/components/Donut";
import { ChevronRight, PlusIcon, ShieldIcon, SwapIcon } from "@/components/icons";
import { AssetGlyph, Button, Card, Dot } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatToken, formatUsd8 } from "@/lib/format";
import { AvailabilityNotice } from "@/components/AvailabilityNotice";
import { usePositions, type ProtectorVM, type ShieldVM } from "@/data/positions";

export function Home() {
  const { loading, error, shield, protector } = usePositions();
  if (loading) return <div className="h-72 animate-pulse rounded-card bg-subtle" />;
  if (error)
    return (
      <Card>
        <p role="alert">Your on-chain positions are unavailable. Refresh to retrieve verified balances and quotes.</p>
      </Card>
    );
  if (shield.length === 0 && protector.length === 0) return <HomeEmpty />;
  return <HomeFunded shield={shield} protector={protector} />;
}

// --- Funded ----------------------------------------------------------------

function HomeFunded({ shield, protector }: { shield: ShieldVM[]; protector: ProtectorVM[] }) {
  const navigate = useNavigate();

  const value = useMemo(
    () =>
      shield.length > 0 && shield.every((p) => p.currentValueUsd !== null)
        ? shield.reduce((total, p) => total + p.currentValueUsd!, 0n)
        : null,
    [shield],
  );
  const firstShield = shield.find((p) => p.view);
  const coveragePcts = shield.map((p) => p.view?.stats.coverageBps);
  const minimumCoverage =
    shield.length > 0 && coveragePcts.every((p) => p !== null && p !== undefined)
      ? Math.min(...coveragePcts.map((p) => Number(p) / 100))
      : null;

  return (
    <div className="animate-fade-up md:grid md:grid-cols-[1fr_280px] md:items-start md:gap-6">
      <div className="min-w-0">
        <h1 className="page-title mb-5">My positions</h1>
        <Card>
          <div className="text-[14px] font-semibold text-body">Protected asset value</div>
          <div className="mt-1 hero-num text-[44px] md:text-[52px]">
            {value === null ? "Unavailable" : formatUsd8(value)}
          </div>
          <p className="mt-3 text-[13px] text-muted">Oracle value. Backing balances are shown separately.</p>

          <div className="mt-3 grid grid-cols-3 gap-2">
            <QuickAction
              icon={<PlusIcon className="h-5 w-5" />}
              role="senior"
              label="Get protection"
              onClick={() => navigate("/markets")}
            />
            <QuickAction
              icon={<SwapIcon className="h-5 w-5" />}
              role="senior"
              label="Review exits"
              disabled={!firstShield}
              onClick={() => firstShield && navigate(`/position/${firstShield.id}`)}
            />
            <QuickAction
              icon={<ShieldIcon className="h-5 w-5" />}
              role="junior"
              label="Provide"
              onClick={() => navigate("/provide")}
            />
          </div>
        </Card>

        {/* Protected savings */}
        <Group title="Protected positions" dot="green">
          {shield.length === 0 ? (
            <EmptyPrompt tone="green" text="Choose an asset to protect." onClick={() => navigate("/markets")} />
          ) : (
            shield.map((p) => <ShieldRow key={p.id} p={p} onClick={() => navigate(`/position/${p.id}`)} />)
          )}
        </Group>

        {/* Earning premium */}
        <Group title="Backing positions" dot="indigo">
          {protector.length === 0 ? (
            <EmptyPrompt
              tone="indigo"
              text="Provide backing for a share of gains."
              onClick={() => navigate("/provide")}
            />
          ) : (
            protector.map((p) => <ProtectorRow key={p.id} p={p} onClick={() => navigate(`/underwriter/${p.id}`)} />)
          )}
        </Group>
      </div>

      {/* Desktop right rail: coverage gauge + provide-protection promo */}
      <aside className="sticky top-10 hidden flex-col gap-4 md:flex">
        <Card className="flex flex-col items-center">
          <Donut
            pct={minimumCoverage === null ? 0 : Math.min(100, minimumCoverage)}
            centerLabel={minimumCoverage === null ? "—" : `${Math.round(minimumCoverage)}%`}
            sublabel="collateral coverage"
          />
          <p className="mt-3 text-center text-[13px] text-body">
            {minimumCoverage === null ? "No coverage data available." : "Lowest collateral coverage across your pools."}
          </p>
        </Card>
        <button
          onClick={() => navigate("/provide")}
          className="rounded-card bg-junior hover:bg-junior-accent focus-visible:outline-junior p-5 text-left text-white"
        >
          <div className="text-[15px] font-extrabold">Provide collateral</div>
          <div className="mt-1 text-[13px] text-white/85">Junior tranche: gain share and first-loss exposure.</div>
        </button>
      </aside>
    </div>
  );
}

function ShieldRow({ p, onClick }: { p: ShieldVM; onClick: () => void }) {
  const preset = p.view?.preset;
  const sym = p.view?.shielded.symbol ?? "";
  const valueLabel = p.currentValueUsd === null ? "Unavailable" : formatUsd8(p.currentValueUsd);
  const earnedLabel =
    p.earnedUsd === null ? "Price gain unavailable" : `${formatUsd8(p.earnedUsd)} price gain before fees`;
  return (
    <Row
      onClick={onClick}
      glyph={p.view ? <AssetGlyph glyph={preset!.glyph} label={preset!.asset} symbol={sym} /> : null}
      title={`${preset?.asset ?? sym} position`}
      role="senior"
      sub="Priority over reserved backing"
      value={valueLabel}
      earned={earnedLabel}
    />
  );
}

function ProtectorRow({ p, onClick }: { p: ProtectorVM; onClick: () => void }) {
  const backing = p.view?.backing;
  const shielded = p.view?.shielded;
  const sym = backing?.symbol ?? "Token";
  return (
    <Row
      onClick={onClick}
      glyph={
        <div className="flex h-10 w-10 items-center justify-center rounded-chip bg-indigo-tint text-indigo">◇</div>
      }
      title={`${sym} backing`}
      role="junior"
      sub="Gain share · junior backing"
      value={backing ? formatToken(p.collateral, backing.decimals, sym) : "Unavailable"}
      earned={
        p.claimableCommission !== undefined && shielded
          ? `${formatToken(p.claimableCommission, shielded.decimals, shielded.symbol)} claimable`
          : "Claimable rewards unavailable"
      }
    />
  );
}

function Row({
  glyph,
  title,
  sub,
  value,
  earned,
  role,
  onClick,
}: {
  glyph: ReactNode;
  title: string;
  sub: string;
  value: string;
  earned: string;
  role: "senior" | "junior";
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-card border border-hairline bg-surface p-4 text-left hover:shadow-card"
    >
      {glyph}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{title}</div>
        <div className="truncate text-[12.5px] text-muted">{sub}</div>
      </div>
      <div className="text-right">
        <div className="text-[15px] font-bold tnum text-ink">{value}</div>
        <div className={cn("text-[12.5px] font-semibold tnum", role === "senior" ? "text-senior-dark" : "text-junior")}>
          {earned}
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-faint" />
    </button>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
  disabled,
  role,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  role: "senior" | "junior";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-input py-3 text-[12.5px] font-semibold",
        role === "senior"
          ? "bg-senior-tint text-senior-dark focus-visible:outline-senior"
          : "bg-junior-tint text-junior focus-visible:outline-junior",
        disabled ? "opacity-40" : "hover:opacity-80",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Group({ title, dot, children }: { title: string; dot: "green" | "indigo"; children: ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center gap-2">
        <Dot tone={dot} />
        <span className="section-label">{title}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function EmptyPrompt({ tone, text, onClick }: { tone: "green" | "indigo"; text: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-card border border-dashed p-4 text-left text-[13.5px] font-semibold",
        tone === "green" ? "border-green/40 text-green-dark" : "border-indigo/40 text-indigo",
      )}
    >
      {text}
    </button>
  );
}

function HomeEmpty() {
  const navigate = useNavigate();
  return (
    <div className="animate-fade-up">
      <Card className="overflow-hidden">
        <div className="section-label">Make your first move</div>
        <h1 className="page-title mt-2">Your first position.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-body">
          Choose protection, or supply the backing for a share of gains.
        </p>
        <div className="mt-5 rounded-card bg-subtle p-5 text-[14px] leading-relaxed text-body">
          Start with free test tokens, then choose a pool.
        </div>
      </Card>
      <div className="mt-5">
        <AvailabilityNotice />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button variant="primary" full onClick={() => navigate("/markets")}>
          Explore assets
        </Button>
        <Button variant="secondary" full onClick={() => navigate("/test-tokens")}>
          Get test tokens
        </Button>
      </div>
    </div>
  );
}
