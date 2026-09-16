import React, { useState, useEffect, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  NavLink,
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import useSWR from "swr";
import { parseEventLogs, parseAbi, formatUnits, type Abi, type Address } from "viem";
import config from "../../../config/monad.json";
import registryJson from "../../../config/deployment.json";
import abisJson from "../../../config/browser-abis.json";
import { WalletProvider, useWallet, useBalance, useNativeBalance, client } from "./wallet";
import { FundingNotice, FundingGate, AssetFundingHint, monadFaucet, type FundingAsset } from "./Funding";
import { amount, minOut, netAsset, noticeState, fmt, usd, short, fetcher, explorer, errorMessage } from "./lib";
import type { Asset, Market, Position, Snapshot, Registry, CreationOption } from "./types";
import { selectMarket } from "./market-selection";
import "./styles.css";
import "./app-layout.css";
import "./asset-images.css";
import { TokenIcon, AssetPair } from "./AssetImage";
import { assetVisual } from "./asset-visuals";
import { AssetSelect } from "./AssetSelect";
import { creationVersion, creationFingerprint, assertCreationIdentity } from "./creation";
import { MarketSelect } from "./MarketSelect";
import { Landing } from "./Landing";
import { HowItWorks } from "./HowItWorks";
import { TaskAside } from "./TaskAside";
const registry = registryJson as unknown as Registry;
const abi = (name: string) => (abisJson as unknown as Record<string, Abi>)[name];
const contract = (name: string) => registry.contracts[name]?.address;
const useSnapshot = () => useSWR<Snapshot>("/api/status", fetcher, { refreshInterval: 12000, errorRetryCount: 2 });
const kind = (a: Asset) =>
  ({
    "external-reference": registry.referenceOracle === "redstone" ? "RedStone reference" : "Pyth reference",
    "redemption-nav": "Staking NAV",
    synthetic: "Scenario price",
    "synthetic-unit": "Test unit",
    "test-vault-nav": "Funded test NAV",
  })[a.kind] || a.kind;
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brandmark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="6" fill="#0E1114" />
        <rect x="11" y="11" width="18" height="18" rx="6" fill="#6E54FF" fillOpacity="0.92" />
        <rect x="11" y="11" width="10" height="10" rx="4" fill="#0E1114" fillOpacity="0.45" />
      </svg>
    </span>
  );
}
function Brand() {
  return (
    <Link to="/" className="brand">
      <Mark />
      <span>
        YieldShield<span className="brand-network">on Monad</span>
      </span>
    </Link>
  );
}
function Tag({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function WalletButton() {
  const w = useWallet();
  return (
    <button
      className={w.account ? "wallet-connected" : "button dark"}
      disabled={w.busy}
      onClick={w.account ? w.disconnect : w.connect}
    >
      {w.account ? (
        <>
          <span className="dot" />
          {short(w.account)} <span aria-hidden>×</span>
        </>
      ) : (
        "Connect wallet"
      )}
    </button>
  );
}
const primaryNav = [
  ["/protect", "Protect", "◇"],
  ["/provide", "Provide", "＋"],
  ["/positions", "Positions", "▤"],
  ["/faucet", "Faucet", "◉"],
];
const moreNav = [
  ["/markets", "Compare pools", "◈"],
  ["/how-it-works", "How it works", "↗"],
  ["/status", "Network status", "≋"],
  ["/create-pool", "Create a pool", "⊕"],
];
function Header() {
  const { pathname } = useLocation();
  return (
    <>
      <aside className="sidebar" aria-label="Sidebar">
        <Brand />
        <div className="network-label">
          <span className="dot purple" /> Monad testnet
        </div>
        <nav aria-label="Main navigation">
          {primaryNav.map(([to, label, icon]) => (
            <NavLink key={to} to={to}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <nav className="sidebar-secondary" aria-label="More tools">
          {moreNav.map(([to, label, icon]) => (
            <NavLink key={to} to={to}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href={monadFaucet} target="_blank" rel="noreferrer">
            Get testnet MON ↗
          </a>
        </div>
      </aside>
      <header className="simple-header">
        <Brand />
        <div className="header-notice">
          Monad testnet · Test tokens only. <Link to="/legal">Details</Link>
        </div>
        <WalletButton />
      </header>
      <nav className="primary-nav" aria-label="Mobile navigation">
        {primaryNav.map(([to, label]) => (
          <NavLink key={to} to={to}>
            {label}
          </NavLink>
        ))}
        <details
          className="more-menu"
          key={pathname}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.currentTarget.open = false;
              event.currentTarget.querySelector("summary")?.focus();
            }
          }}
        >
          <summary>More</summary>
          <div className="more-links">
            {moreNav.map(([to, label]) => (
              <NavLink key={to} to={to}>
                {label}
              </NavLink>
            ))}
          </div>
        </details>
      </nav>
    </>
  );
}
function Footer() {
  return (
    <footer className="simple-footer">
      <span>YieldShield on Monad</span>
      <nav aria-label="Project information">
        <Link to="/legal">Legal & privacy</Link>
        <a href="https://github.com/YieldShield/yieldshield-monad" target="_blank" rel="noreferrer">
          Source ↗
        </a>
        <a href="https://www.monad.xyz/developers/hackathons/metropolis" target="_blank" rel="noreferrer">
          Metropolis ↗
        </a>
      </nav>
    </footer>
  );
}
function ReleaseNotice() {
  if (registry.status === "complete") return null;
  return (
    <div className="release-notice" role="status">
      <span>
        Preview build ·{" "}
        {registry.status === "scenario-complete"
          ? "Reference markets are being connected."
          : "Protection markets are being prepared."}
      </span>
      <Link to="/status">View status ↗</Link>
    </div>
  );
}
function Home() {
  const { data, error } = useSnapshot();
  return (
    <div className="simple-site">
      <Header />
      <ReleaseNotice />
      <main id="main" tabIndex={-1} className="simple-home">
        <FundingNotice />
        <Landing data={data} error={error} />
      </main>
      <Footer />
    </div>
  );
}
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="simple-site">
      <Header />
      <main id="main" tabIndex={-1} className="simple-workspace">
        <ReleaseNotice />
        <FundingNotice />
        {children}
      </main>
      <Footer />
    </div>
  );
}
function PageTitle({ title, copy, children }: { title: string; copy?: string; children?: ReactNode }) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {copy && <p>{copy}</p>}
      </div>
      {children}
    </div>
  );
}
function Loading({ error }: { error?: Error }) {
  return (
    <div className={`notice ${error ? "warning" : ""}`} role="status">
      {error ? error.message : "Loading pools…"}
      {error && (
        <button className="text-link" onClick={() => location.reload()}>
          Refresh
        </button>
      )}
    </div>
  );
}
function MarketCard({ market: m }: { market: Market }) {
  return (
    <article className="market-card">
      <div className={`card-top pool-art ${assetVisual(m.shield).theme}`}>
        <AssetPair asset={m.shield} backing={m.backing} />
        <Tag tone={m.ready ? "success" : "pending"}>{m.ready ? "Available" : "Action needed"}</Tag>
      </div>
      <h3>
        {m.symbol}
        <span> / {m.backingSymbol}</span>
      </h3>
      <p>
        {m.environment === "scenario"
          ? "Synthetic test asset"
          : m.symbol === "shMON"
            ? "Valued at delayed withdrawal rate"
            : "Wrapped MON"}
      </p>
      <div className="market-price">
        {usd(m.shield?.price)}
        <small>{m.shield && kind(m.shield)}</small>
      </div>
      <div className="mini-metrics">
        <div>
          <span>Total backing</span>
          <strong>
            {fmt(m.totalBacking, m.backing?.decimals)} {m.backingSymbol}
          </strong>
        </div>
        <div>
          <span>Reserve requirement</span>
          <strong>150%</strong>
        </div>
      </div>
      {m.reason && <p className="inline-warning">{m.reason}</p>}
      <div className="card-actions">
        <Link className="button purple-button" to={`/protect?market=${m.id}`}>
          Protect ↗
        </Link>
        <Link className="button outline" to={`/provide?market=${m.id}`}>
          Provide
        </Link>
      </div>
    </article>
  );
}
function Markets() {
  const { data, error } = useSnapshot();
  const [environment, setEnvironment] = useState<"reference" | "scenario">("reference");
  const markets = data?.markets.filter((m) => m.environment === environment) || [];
  return (
    <Shell>
      <PageTitle title="Compare pools" />
      <div className="filter-row">
        <div className="segmented">
          <button className={environment === "reference" ? "selected" : ""} onClick={() => setEnvironment("reference")}>
            Monad assets
          </button>
          <button className={environment === "scenario" ? "selected" : ""} onClick={() => setEnvironment("scenario")}>
            Demo assets
          </button>
        </div>
        <Link to="/create-pool" className="text-link">
          Create a pool ↗
        </Link>
      </div>
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="notice">
            {environment === "reference"
              ? "shMON uses its delayed withdrawal value, not a spot sell quote."
              : "Synthetic tokens follow an 8-minute price cycle and have no claim on MON."}
          </div>
          <div className="market-grid">
            {markets.map((m) => (
              <MarketCard key={m.id} market={m} />
            ))}
          </div>
          {!markets.length && (
            <div className="empty-state">
              <span className="big-glyph">◈</span>
              <h2>
                {environment === "reference"
                  ? "Reference markets are being connected."
                  : "Scenario pools are being deployed."}
              </h2>
              <p>
                {environment === "reference"
                  ? "The live-price route requires a fresh, verified MON reference before protection can open. Native wrapping and shMON staking remain separate actions."
                  : "Contract deployment is in progress. No placeholder pool addresses are used."}
              </p>
              <div className="row">
                <Link className="button purple-button" to="/faucet">
                  Go to Faucet ↗
                </Link>
                {environment === "reference" && (
                  <button className="button outline" onClick={() => setEnvironment("scenario")}>
                    Try scenario markets
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="compact-risk">
            Backing exits exchange your asset for a payout capped by entry value and reserved backing.{" "}
            <Link to="/how-it-works">How it works ↗</Link>
          </p>
        </>
      )}
    </Shell>
  );
}
function Submit({
  label,
  onClick,
  disabled = false,
  asset,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  asset?: FundingAsset;
}) {
  const w = useWallet();
  return (
    <FundingGate asset={asset}>
      <button
        className="button purple-button full"
        disabled={w.busy || (!!w.account && disabled)}
        onClick={w.account ? onClick : w.connect}
      >
        {w.busy ? "Transaction in progress…" : !w.account ? "Connect wallet" : label}
      </button>
    </FundingGate>
  );
}
function useSelectedMarket(data: Snapshot | undefined) {
  const [params, setParams] = useSearchParams();
  const m = selectMarket(data?.markets || [], params.get("market"));
  const setId = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("market", id);
    setParams(next, { replace: true });
  };
  return { m, id: m?.id || "", setId };
}
function PositionForm({ side }: { side: "senior" | "junior" }) {
  const { data, error } = useSnapshot();
  const { m, id, setId } = useSelectedMarket(data);
  const [input, setInput] = useState(side === "senior" ? "1" : "1000");
  const w = useWallet();
  const token = side === "senior" ? m?.shield : m?.backing;
  const tokenBalance = useBalance(token?.address);
  const balance = tokenBalance.error ? undefined : tokenBalance.data;
  const fundingAsset = token ? { symbol: token.symbol, balance } : undefined;
  let value = 0n,
    validation = "";
  try {
    if (token) value = amount(input, token.decimals);
  } catch (e) {
    validation = errorMessage(e);
  }
  const entry = token?.price ? (value * BigInt(token.price)) / 10n ** BigInt(token.decimals) : null;
  const reserve =
    entry && m?.backing.price
      ? (((entry * 15000n + 9999n) / 10000n) * 10n ** BigInt(m.backing.decimals)) / BigInt(m.backing.price)
      : null;
  const available = Boolean(m?.actions[side === "senior" ? "protect" : "provide"]);
  const tooMuch = balance != null && value > balance;
  const overCapacity = side === "senior" && m?.capacity != null && value > BigInt(m.capacity);
  async function submit() {
    if (!m || !token) return;
    await w.execute(side === "senior" ? "Prepare protection" : "Prepare junior liquidity", async () => {
      if (!data || data.chainId !== 10143 || Date.now() - data.observedAt > 30000 || Date.now() < data.observedAt)
        throw new Error("The market snapshot expired. Refresh before continuing.");
      if (m.environment === "reference") await w.updatePrice();
      await w.approve(token.address, m.address, value);
      await w.send({
        address: m.address,
        abi: abi("SplitRiskPool"),
        functionName: side === "senior" ? "depositShieldedAsset" : "depositBackingAsset",
        args: [token.address, value, value],
      });
    });
  }
  return (
    <Shell>
      <div className="task-page">
        <PageTitle title={side === "senior" ? "Protect" : "Provide liquidity"} />
        {!data ? (
          <Loading error={error} />
        ) : !m ? (
          <div className="empty-state">
            <h2>Pool unavailable</h2>
            <Link to="/markets">Choose a pool ↗</Link>
          </div>
        ) : (
          <div className="task-layout">
            <section className={`action-panel ${side}`}>
              <MarketSelect data={data} id={id} setId={setId} />
              <div className="pool-context">
                <Tag>{m.environment === "scenario" ? "Synthetic demo asset" : "Monad asset"}</Tag>
              </div>
              <label className="field">
                {side === "senior" ? "Amount to protect" : "Backing to provide"}
                <div className="amount-field">
                  <input
                    name="amount"
                    inputMode="decimal"
                    aria-label={side === "senior" ? "Amount to protect" : "Backing to provide"}
                    aria-describedby="deposit-balance"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoComplete="off"
                  />
                  <b className="amount-token">
                    <TokenIcon asset={token} />
                    {token?.symbol}
                  </b>
                </div>
                <span className="field-hint" id="deposit-balance">
                  {!w.account
                    ? "Connect to see your balance"
                    : tokenBalance.error
                      ? "Balance unavailable"
                      : `Balance: ${fmt(balance, token?.decimals, 5)} ${token?.symbol}`}
                </span>
              </label>
              <AssetFundingHint asset={fundingAsset} />
              <dl className="review-list">
                <div>
                  <dt>Entry value</dt>
                  <dd>{usd(entry)}</dd>
                </div>
                {side === "senior" ? (
                  <>
                    <div>
                      <dt>Backing reserved</dt>
                      <dd>
                        {fmt(reserve, m.backing.decimals, 4)} {m.backingSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Fee</dt>
                      <dd>12% of realized gains</dd>
                    </div>
                    <div>
                      <dt>Backing exit after</dt>
                      <dd>60 seconds</dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <dt>Reward share</dt>
                      <dd>10% of realized gains, shared by providers</dd>
                    </div>
                    <div>
                      <dt>Withdrawal notice</dt>
                      <dd>120 seconds</dd>
                    </div>
                  </>
                )}
              </dl>
              <p className="compact-risk">
                {side === "senior"
                  ? `Withdraw your ${m.symbol} after fees, or surrender it for backing capped by entry value and reserved backing.`
                  : "Your backing absorbs losses first. Only unreserved backing can be withdrawn."}
              </p>
              {side === "junior" && (
                <p className="compact-risk">Rewards are paid in {m.symbol}; returns are not guaranteed.</p>
              )}
              {m.symbol === "shMON" && (
                <p className="compact-risk">shMON uses withdrawal value, not a spot price. Unstaking is delayed.</p>
              )}
              {m.backingSymbol === "vTestUSDC" && (
                <p className="compact-risk">Backing is paid in vault shares. Redeem them separately for TestUSDC.</p>
              )}
              {(!available || validation || tooMuch || overCapacity) && (
                <p className="inline-warning" role="status">
                  {validation ||
                    (!available
                      ? m.reason || "No capacity available."
                      : tooMuch
                        ? "Insufficient token balance."
                        : overCapacity
                          ? "Amount exceeds available protection."
                          : "")}
                </p>
              )}
              <Submit
                label={side === "senior" ? "Approve & protect" : "Approve & provide"}
                asset={fundingAsset}
                disabled={!available || !!validation || tooMuch || overCapacity || value === 0n}
                onClick={submit}
              />
              <details className="disclosure">
                <summary>Pool details</summary>
                <div className="disclosure-body">
                  <dl className="review-list">
                    <div>
                      <dt>Reserve requirement</dt>
                      <dd>150%</dd>
                    </div>
                    <div>
                      <dt>Total backing</dt>
                      <dd>
                        {fmt(m.totalBacking, m.backing.decimals)} {m.backingSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Price source</dt>
                      <dd>{kind(m.shield)}</dd>
                    </div>
                  </dl>
                  <p>Your receipt NFT controls the position. Fees already paid are not refunded after later losses.</p>
                  <a href={explorer("address", m.address)} target="_blank" rel="noreferrer">
                    View pool contract ↗
                  </a>
                </div>
              </details>
            </section>
            <TaskAside
              title={side === "senior" ? "Choose your exit." : "Supply the backing."}
              asset={m.shield}
              backing={m.backing}
            >
              <p>
                {side === "senior"
                  ? `Keep your ${m.symbol} after fees, or take capped ${m.backingSymbol} backing.`
                  : `Provide ${m.backingSymbol} to earn a share of realized gains, paid in ${m.symbol}.`}
              </p>
              <p>
                {side === "senior"
                  ? "Waiting periods and pool checks apply."
                  : "Backing takes losses first. Returns are not guaranteed."}
              </p>
              <Link to="/how-it-works">How it works ↗</Link>
              <Link to="/markets">Compare pools ↗</Link>
            </TaskAside>
          </div>
        )}
      </div>
    </Shell>
  );
}
function PositionStack() {
  return (
    <span className="position-stack" aria-hidden="true">
      <i />
      <i />
    </span>
  );
}
function Positions() {
  const w = useWallet();
  const { data: state } = useSnapshot();
  const { data, error } = useSWR<{ positions: Position[] }>(
    w.account ? `/api/positions?owner=${w.account}` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  return (
    <Shell>
      <PageTitle title="Your positions" />
      {!w.account ? (
        <div className="empty-state">
          <PositionStack />
          <h2>Your positions, in one place.</h2>
          <p>Connect to view protected assets and supplied backing.</p>
          <WalletButton />
        </div>
      ) : !data ? (
        <Loading error={error} />
      ) : !data.positions.length ? (
        <div className="empty-state">
          <PositionStack />
          <h2>No positions yet</h2>
          <Link className="button purple-button" to="/protect">
            Protect tokens ↗
          </Link>
        </div>
      ) : (
        <div className="position-list">
          {(["senior", "junior"] as const).map((side) => {
            const positions = data.positions.filter((p) => p.side === side);
            return positions.length ? (
              <section
                className="position-group"
                key={side}
                aria-label={side === "senior" ? "Protected assets" : "Supplied backing"}
              >
                <h2>{side === "senior" ? "Protected assets" : "Supplied backing"}</h2>
                {positions.map((p) => {
                  const m = state?.markets.find((m) => m.id === p.poolId);
                  return (
                    <Link key={p.key} className="position-row" to={`/positions/${encodeURIComponent(p.key)}`}>
                      <TokenIcon asset={p.side === "senior" ? m?.shield : m?.backing} />
                      <div>
                        <strong>
                          {p.side === "senior" ? "Protected" : "Liquidity"}{" "}
                          {m ? (p.side === "senior" ? m.symbol : m.backingSymbol) : "position"}
                        </strong>
                        <span>
                          {!m
                            ? "Asset details unavailable"
                            : m.environment === "scenario"
                              ? "Demo asset"
                              : "Monad asset"}{" "}
                          · Receipt #{p.id}
                        </span>
                      </div>
                      <b>
                        {m
                          ? fmt(p.position.amount, p.side === "senior" ? m.shield.decimals : m.backing.decimals, 5)
                          : "—"}
                      </b>
                      <Tag tone={p.side}>{p.side === "senior" ? "Protected" : "First loss"}</Tag>
                      <span>↗</span>
                    </Link>
                  );
                })}
              </section>
            ) : null;
          })}
        </div>
      )}
    </Shell>
  );
}
function PositionDetail() {
  const { key } = useParams();
  const w = useWallet();
  const { data: state, error: stateError } = useSnapshot();
  const { data, error } = useSWR<{ positions: Position[] }>(
    w.account ? `/api/positions?owner=${w.account}` : null,
    fetcher,
    { refreshInterval: 10000 },
  );
  const p = data?.positions.find((p) => p.key === key);
  const m = state?.markets.find((m) => m.id === p?.poolId);
  const [withdraw, setWithdraw] = useState("");
  const [partial, setPartial] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!w.account) return <Positions />;
  if (!data || !state)
    return (
      <Shell>
        <Loading error={error || stateError} />
      </Shell>
    );
  if (!p || !m)
    return (
      <Shell>
        <div className="empty-state">
          <h2>Position is closed or not in this wallet.</h2>
          <Link to="/positions">Back to positions ↗</Link>
        </div>
      </Shell>
    );
  const senior = p.side === "senior",
    pos = p.position;
  const unlocked = Number(pos.depositTime) * 1000 + 60000 <= now;
  const {
    readyAt: noticeReady,
    active: activeNotice,
    expired: noticeExpired,
  } = noticeState(pos.unlockRequestTime, now);
  let assetExit: bigint | null = null,
    backingExit: bigint | null = null;
  try {
    assetExit = netAsset(
      BigInt(pos.amount),
      BigInt(pos.valueAtDeposit || 0),
      BigInt(p.feeBaseline || 0),
      BigInt(m.shield.price || 0),
      m.shield.decimals,
    );
    if (m.backing.price && pos.valueAtDeposit) {
      backingExit = (BigInt(pos.valueAtDeposit) * 10n ** BigInt(m.backing.decimals)) / BigInt(m.backing.price);
      const cap = BigInt(pos.collateralAmount || 0);
      if (backingExit > cap) backingExit = cap;
    }
  } catch {}
  const act = (label: string, fn: string, args: unknown[], refreshPrice = false) =>
    w.execute(label, async () => {
      if (refreshPrice && m.environment === "reference") await w.updatePrice();
      await w.send({ address: p.pool, abi: abi("SplitRiskPool"), functionName: fn, args });
    });
  return (
    <Shell>
      <Link className="back-link" to="/positions">
        ← All positions
      </Link>
      <PageTitle
        title={`${senior ? "Protected " + m.symbol : m.backingSymbol + " liquidity"}`}
        copy={m.environment === "scenario" ? "Synthetic test asset" : undefined}
      >
        <Tag tone={senior ? "senior" : "junior"}>{senior ? "Protected holder" : "First-loss provider"}</Tag>
      </PageTitle>
      <div className="summary-grid">
        <div>
          <span>{senior ? "Remaining asset" : "Current backing amount"}</span>
          <strong>
            {fmt(pos.amount, senior ? m.shield.decimals : m.backing.decimals, 5)}
            <small>{senior ? m.symbol : m.backingSymbol}</small>
          </strong>
        </div>
        <div>
          <span>{senior ? "Recorded entry value" : "Available excess backing"}</span>
          <strong>{senior ? usd(pos.valueAtDeposit) : fmt(p.available, m.backing.decimals, 4)}</strong>
        </div>
        <div>
          <span>{senior ? "Maximum reserved backing" : "Claimable asset rewards"}</span>
          <strong>
            {fmt(senior ? pos.collateralAmount : p.commission, senior ? m.backing.decimals : m.shield.decimals, 4)}
            <small>{senior ? m.backingSymbol : m.symbol}</small>
          </strong>
        </div>
      </div>
      {m.reason && (
        <p className="inline-warning">
          {m.reason} <Link to="/status">View prices and refresh options ↗</Link>
        </p>
      )}
      {senior ? (
        <div className="exit-grid">
          <section className="exit-card">
            <h2>Withdraw your asset</h2>
            <p>Close this position and receive the remaining {m.symbol}, after realized-gain fees.</p>
            <strong className="exit-amount">
              {fmt(assetExit, m.shield.decimals, 6)} <small>{m.symbol}</small>
            </strong>
            {!m.shield.healthy && (
              <p className="inline-warning">A fresh price is needed to settle fees. Refresh it on Network status.</p>
            )}
            <Submit
              label="Withdraw asset & close"
              disabled={!m.actions.withdrawAsset || assetExit === null || assetExit <= 0n}
              onClick={() =>
                act("Withdraw asset", "shieldedWithdraw", [BigInt(p.id), m.shieldedToken, minOut(assetExit!)], true)
              }
            />
            <details className="partial-exit">
              <summary>Withdraw part of this position</summary>
              <p>
                Fees settle on the whole position first. The remainder receives a new receipt with proportionally
                reduced entry value and backing cap. The original waiting period is preserved.
              </p>
              <label className="field">
                Asset amount to receive
                <input
                  inputMode="decimal"
                  value={partial}
                  onChange={(e) => setPartial(e.target.value)}
                  placeholder={m.symbol}
                />
              </label>
              <Submit
                label="Withdraw part & replace receipt"
                disabled={!partial || assetExit === null || !m.actions.withdrawAsset}
                onClick={() => {
                  try {
                    const n = amount(partial, m.shield.decimals);
                    if (assetExit === null || n >= assetExit)
                      throw new Error("Use the full exit to close this position.");
                    if (assetExit - n < BigInt(m.config?.[0] || 1))
                      throw new Error("The remaining position would be below the pool minimum.");
                    void act(
                      "Withdraw part of position",
                      "partialWithdrawShielded",
                      [BigInt(p.id), n, m.shieldedToken, minOut(n)],
                      true,
                    );
                  } catch (e) {
                    w.setError(errorMessage(e));
                  }
                }}
              />
            </details>
          </section>
          <section className="exit-card protected">
            <h2>Take the backing</h2>
            <p>Surrender your remaining {m.symbol} for the backing payout. This closes the position.</p>
            <strong className="exit-amount">
              {fmt(backingExit, m.backing.decimals, 6)} <small>{m.backingSymbol}</small>
            </strong>
            {!unlocked && (
              <p className="inline-warning">
                Available in {Math.max(0, Math.ceil((Number(pos.depositTime) * 1000 + 60000 - now) / 1000))} seconds.
              </p>
            )}
            <Submit
              label="Surrender asset & receive backing"
              disabled={!unlocked || !m.actions.withdrawBacking || backingExit === null || backingExit <= 0n}
              onClick={() =>
                act("Use backing exit", "shieldedWithdraw", [BigInt(p.id), m.backingToken, minOut(backingExit!)], true)
              }
            />
            {m.backingSymbol === "vTestUSDC" && (
              <p className="consent-note">Payout is vault shares. Redeem them separately on the Faucet page.</p>
            )}
          </section>
        </div>
      ) : (
        <div className="form-layout">
          <section className="action-panel">
            <h2>Manage liquidity</h2>
            <dl className="review-list">
              <div>
                <dt>Notice period</dt>
                <dd>120 seconds</dd>
              </div>
              <div>
                <dt>Withdrawal window</dt>
                <dd>7 days after notice</dd>
              </div>
              <div>
                <dt>Notice status</dt>
                <dd>
                  {!Number(pos.unlockRequestTime)
                    ? "Not started"
                    : activeNotice
                      ? "Ready"
                      : now < noticeReady
                        ? `${Math.ceil((noticeReady - now) / 1000)} seconds remaining`
                        : "Expired — restart notice"}
                </dd>
              </div>
            </dl>
            {!Number(pos.unlockRequestTime) || noticeExpired ? (
              <Submit
                label="Start withdrawal notice"
                onClick={() => act("Start notice", "startUnlockProcess", [BigInt(p.id)])}
              />
            ) : (
              <button
                className="button outline full"
                disabled={w.busy}
                onClick={() => act("Cancel notice", "cancelUnlockProcess", [BigInt(p.id)])}
              >
                Cancel notice
              </button>
            )}
            <label className="field">
              Backing to withdraw
              <div className="amount-field">
                <input
                  inputMode="decimal"
                  value={withdraw}
                  onChange={(e) => setWithdraw(e.target.value)}
                  placeholder={fmt(p.available, m.backing.decimals)}
                />
                <b>{m.backingSymbol}</b>
              </div>
              <button
                className="text-link"
                onClick={() => setWithdraw(formatUnits(BigInt(p.available || 0), m.backing.decimals))}
              >
                Use available amount
              </button>
            </label>
            <Submit
              label="Withdraw available backing"
              disabled={!activeNotice || !withdraw || BigInt(p.available || 0) === 0n}
              onClick={() => {
                try {
                  const n = amount(withdraw, m.backing.decimals);
                  if (n > BigInt(p.available || 0)) throw new Error("That amount is still reserved for protection.");
                  void act(
                    "Withdraw excess backing",
                    "protectorWithdraw",
                    [BigInt(p.id), n, m.backingToken, minOut(n)],
                    true,
                  );
                } catch (e) {
                  w.setError(errorMessage(e));
                }
              }}
            />
            <button
              className="button outline full reward-button"
              disabled={w.busy || BigInt(p.commission || 0) <= 0n}
              onClick={() => act("Claim junior rewards", "claimCommission", [BigInt(p.id)])}
            >
              Claim {fmt(p.commission, m.shield.decimals, 5)} {m.symbol} rewards
            </button>
          </section>
          <p className="compact-risk">
            Only unreserved backing can be withdrawn. Your backing absorbs losses when the pool pays protection.
          </p>
        </div>
      )}
      <div className="receipt-links">
        <a href={explorer("address", p.nft)} target="_blank" rel="noreferrer">
          Receipt contract ↗
        </a>
        <a href={explorer("address", p.pool)} target="_blank" rel="noreferrer">
          Pool contract ↗
        </a>
      </div>
    </Shell>
  );
}
const nativeAbi = parseAbi([
  "function previewDeposit(uint256) view returns(uint256)",
  "function previewUnstake(uint256) view returns(uint256)",
  "function getUnstakeRequest(address) view returns(uint128 amountMon,uint64 completionEpoch)",
  "function requestUnstake(uint256) returns(uint64)",
  "function completeUnstake()",
  "function convertToAssets(uint256) view returns(uint256)",
  "function previewRedeem(uint256) view returns(uint256)",
  "function totalAssets() view returns(uint256)",
]);
function Disclosure({
  id,
  title,
  children,
  anchors = [],
  forceOpen = false,
}: {
  id: string;
  title: ReactNode;
  children: ReactNode;
  anchors?: string[];
  forceOpen?: boolean;
}) {
  const { hash } = useLocation();
  const requested = hash === `#${id}` || anchors.some((anchor) => hash === `#${anchor}`);
  const [open, setOpen] = useState(requested || forceOpen);
  useEffect(() => {
    if (requested || forceOpen) setOpen(true);
  }, [hash, requested, forceOpen]);
  useEffect(() => {
    if (!open || !requested) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, requested, hash]);
  return (
    <details id={id} className="disclosure" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{title}</summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
function Tokens() {
  const w = useWallet();
  const native = useNativeBalance();
  const [wrap, setWrap] = useState("0.01"),
    [stake, setStake] = useState("0.01"),
    [vaultInput, setVaultInput] = useState("100"),
    [unstake, setUnstake] = useState("0.001");
  const wmon = contract("WMON"),
    vault = contract("TestUSDVault"),
    usdToken = contract("TestUSDC"),
    faucet = contract("Faucet"),
    shmon = config.externalTokens.shMON as Address;
  const wb = useBalance(wmon),
    sb = useBalance(shmon),
    vb = useBalance(vault),
    ub = useBalance(usdToken);
  const [vaultMode, setVaultMode] = useState<"deposit" | "redeem">("deposit");
  const { data: faucetStatus } = useSWR(
    w.account && faucet ? `faucet:${w.account}` : null,
    () =>
      client
        .readContract({
          address: faucet,
          abi: abi("ConfigurableTokenFaucet"),
          functionName: "canDrip",
          args: [usdToken, w.account!],
        })
        .then((r) => r as [boolean, bigint]),
    { refreshInterval: 12000 },
  );
  const { data: request } = useSWR(
    w.account ? `unstake:${w.account}` : null,
    () =>
      client.readContract({ address: shmon, abi: nativeAbi, functionName: "getUnstakeRequest", args: [w.account!] }),
    { refreshInterval: 12000 },
  );
  const { data: nav } = useSWR(
    vault ? "vault-nav" : null,
    () => client.readContract({ address: vault, abi: nativeAbi, functionName: "convertToAssets", args: [1000000n] }),
    { refreshInterval: 15000 },
  );
  const parseAction = (label: string, fn: () => Promise<unknown>) => w.execute(label, fn);
  return (
    <Shell>
      <PageTitle title="Faucet" />
      <div className="faucet-steps">
        <section
          className={`faucet-step gas-step ${w.account && !native.error && native.data === 0n ? "needs-gas" : ""}`}
          id="monad-gas"
          aria-labelledby="gas-title"
        >
          <div>
            <div className="faucet-step-images">
              <span className="step-number" aria-hidden="true">
                1
              </span>
              <TokenIcon asset={{ symbol: "MON" }} />
            </div>
            <h2 id="gas-title">MON for fees.</h2>
            <p role="status">
              {!w.account
                ? "Connect to check your balance."
                : native.error
                  ? "MON balance unavailable. Retry below."
                  : native.data === undefined
                    ? "Checking MON balance…"
                    : native.data === 0n
                      ? "No MON. Use the faucet before continuing."
                      : `Balance: ${fmt(native.data, 18, 6)} MON. Keep some for fees.`}
            </p>
          </div>
          <div>
            <a className="button purple-button full" href={monadFaucet} target="_blank" rel="noreferrer">
              Open Monad faucet ↗
            </a>
            {w.account ? (
              <button
                className="button outline full"
                disabled={native.isValidating}
                onClick={() => void native.mutate().catch(() => undefined)}
              >
                {native.isValidating ? "Checking balance…" : "Refresh balance"}
              </button>
            ) : (
              <WalletButton />
            )}
          </div>
        </section>
        <section className="faucet-step" id="test-tokens">
          <div>
            <div className="faucet-step-images">
              <span className="step-number" aria-hidden="true">
                2
              </span>
              <AssetPair
                asset={registry.assets.find((a) => a.id === "scenario-mon")}
                backing={registry.assets.find((a) => a.id === "test-usd")}
              />
            </div>
            <h2>Tokens to try it.</h2>
            <p>25 sMON-demo + 10,000 TestUSDC. Once every 24 hours, while supplies last.</p>
          </div>
          <div>
            <Submit
              label="Claim test tokens"
              disabled={!faucetStatus?.[0]}
              onClick={() =>
                parseAction("Claim scenario assets", async () => {
                  await w.send({
                    address: faucet,
                    abi: abi("ConfigurableTokenFaucet"),
                    functionName: "dripAll",
                    args: [w.account!],
                  });
                })
              }
            />
            {w.account && faucetStatus && !faucetStatus[0] && (
              <p className="field-hint">
                {faucetStatus[1] > 0n
                  ? `Next claim: ${new Date(Number(faucetStatus[1]) * 1000).toLocaleString()}`
                  : "Faucet temporarily unavailable."}
              </p>
            )}
          </div>
        </section>
      </div>
      <p className="compact-risk">
        TestUSDC and sMON-demo have no monetary value. They are not issued by Circle or Kintsu.
      </p>
      <div className="asset-tools">
        <h2>Prepare other assets</h2>
        <Disclosure
          id="wrap-mon"
          title={
            <span className="asset-tool-title">
              <TokenIcon asset={{ address: wmon }} />
              Wrap or unwrap MON
            </span>
          }
        >
          <p>Wrap MON 1:1 using YieldShield’s testnet wrapper.</p>
          <label className="field">
            Amount
            <div className="amount-field">
              <input
                aria-label="MON wrap amount"
                inputMode="decimal"
                value={wrap}
                onChange={(e) => setWrap(e.target.value)}
              />
              <b className="amount-token">
                <TokenIcon asset={{ symbol: "MON" }} />
                MON
              </b>
            </div>
            <span className="field-hint">Wrapped balance: {fmt(wb.data, 18, 6)} WMON</span>
          </label>
          <Submit
            label="Wrap MON"
            disabled={!wmon}
            onClick={() =>
              parseAction("Wrap native MON", async () => {
                const value = amount(wrap, 18);
                await w.send({ address: wmon, abi: abi("MonadWrappedNative"), functionName: "deposit", value });
              })
            }
          />
          <button
            className="button outline full"
            disabled={!w.account || w.busy}
            onClick={() =>
              parseAction("Unwrap WMON", async () => {
                const value = amount(wrap, 18);
                await w.send({
                  address: wmon,
                  abi: abi("MonadWrappedNative"),
                  functionName: "withdraw",
                  args: [value],
                });
              })
            }
          >
            Unwrap WMON
          </button>
        </Disclosure>
        <Disclosure
          id="stake-mon"
          title={
            <span className="asset-tool-title">
              <TokenIcon asset={{ address: shmon }} />
              Stake or unstake MON
            </span>
          }
          anchors={["unstake-mon"]}
          forceOpen={Boolean(request && request[0] > 0n)}
        >
          <p>Receive shMON through shMonad. Its withdrawal value is not a spot sell quote.</p>
          <label className="field">
            Native MON to stake
            <div className="amount-field">
              <input
                aria-label="Native MON to stake"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
              <b className="amount-token">
                <TokenIcon asset={{ symbol: "MON" }} />
                MON
              </b>
            </div>
            <span className="field-hint">Balance: {fmt(sb.data, 18, 6)} shMON</span>
          </label>
          <Submit
            label="Stake MON for shMON"
            disabled={!contract("StakingRouter")}
            onClick={() =>
              parseAction("Stake with shMonad", async () => {
                const value = amount(stake, 18);
                const shares = await client.readContract({
                  address: shmon,
                  abi: nativeAbi,
                  functionName: "previewDeposit",
                  args: [value],
                });
                await w.send({
                  address: contract("StakingRouter"),
                  abi: abi("MonadStakingRouter"),
                  functionName: "stake",
                  args: [minOut(shares), BigInt(Math.floor(Date.now() / 1000) + 60)],
                  value,
                });
              })
            }
          />
          <a className="text-link" href="https://docs.shmonad.xyz/exchange-rate/" target="_blank" rel="noreferrer">
            shMonad exchange rate ↗
          </a>
          <section id="unstake-mon">
            <h3>Unstake shMON</h3>
            <p>Unstaking is delayed until shMonad’s completion epoch.</p>
            <label className="field">
              Shares to unstake
              <div className="amount-field">
                <input
                  aria-label="Shares to unstake"
                  value={unstake}
                  inputMode="decimal"
                  onChange={(e) => setUnstake(e.target.value)}
                />
                <b className="amount-token">
                  <TokenIcon asset={{ address: shmon }} />
                  shMON
                </b>
              </div>
            </label>
            <Submit
              label="Request unstaking"
              asset={{ symbol: "shMON", balance: sb.error ? undefined : sb.data }}
              disabled={Boolean(request && request[0] > 0n)}
              onClick={() =>
                parseAction("Request shMonad unstake", async () => {
                  await w.send({
                    address: shmon,
                    abi: nativeAbi,
                    functionName: "requestUnstake",
                    args: [amount(unstake, 18)],
                  });
                })
              }
            />
            {request && request[0] > 0n && (
              <>
                <p className="notice">
                  Pending: {fmt(request[0], 18, 6)} MON · Completion epoch {String(request[1])}. shMonad checks
                  readiness on completion.
                </p>
                <button
                  className="button outline full"
                  disabled={w.busy}
                  onClick={() =>
                    parseAction("Complete shMonad unstake", async () => {
                      await w.send({ address: shmon, abi: nativeAbi, functionName: "completeUnstake" });
                    })
                  }
                >
                  Complete unstaking
                </button>
              </>
            )}
          </section>
        </Disclosure>
        <Disclosure
          id="test-vault"
          title={
            <span className="asset-tool-title">
              <TokenIcon asset={{ address: vault }} />
              Deposit or redeem vault shares
            </span>
          }
        >
          <p>Deposit TestUSDC for vault shares, or redeem shares. Demo yield comes from funded donations.</p>
          <div className="segmented">
            <button className={vaultMode === "deposit" ? "selected" : ""} onClick={() => setVaultMode("deposit")}>
              Deposit
            </button>
            <button className={vaultMode === "redeem" ? "selected" : ""} onClick={() => setVaultMode("redeem")}>
              Redeem shares
            </button>
          </div>
          <label className="field">
            {vaultMode === "deposit" ? "TestUSDC to deposit" : "Vault shares to redeem"}
            <div className="amount-field">
              <input
                aria-label={vaultMode === "deposit" ? "TestUSDC to deposit" : "Vault shares to redeem"}
                inputMode="decimal"
                value={vaultInput}
                onChange={(e) => setVaultInput(e.target.value)}
              />
              <b className="amount-token">
                <TokenIcon asset={{ address: vaultMode === "deposit" ? usdToken : vault }} />
                {vaultMode === "deposit" ? "TestUSDC" : "vTestUSDC"}
              </b>
            </div>
            <span className="field-hint">
              {fmt(ub.data, 6)} TestUSDC · {fmt(vb.data, 6)} vault shares
            </span>
          </label>
          <p className="field-hint">1 share ≈ {fmt(nav, 6, 6)} TestUSDC</p>
          {vaultMode === "deposit" && (
            <AssetFundingHint asset={{ symbol: "TestUSDC", balance: ub.error ? undefined : ub.data }} />
          )}
          <Submit
            label={vaultMode === "deposit" ? "Approve & deposit" : "Redeem shares"}
            asset={
              vaultMode === "deposit" ? { symbol: "TestUSDC", balance: ub.error ? undefined : ub.data } : undefined
            }
            disabled={!vault}
            onClick={() =>
              parseAction("Use test vault", async () => {
                const n = amount(vaultInput, 6);
                const output = (await client.readContract({
                  address: vault,
                  abi: abi("MonadYieldVault"),
                  functionName: vaultMode === "deposit" ? "previewDeposit" : "previewRedeem",
                  args: [n],
                })) as bigint;
                if (vaultMode === "deposit") await w.approve(usdToken, vault, n);
                await w.send({
                  address: vault,
                  abi: abi("MonadYieldVault"),
                  functionName: vaultMode === "deposit" ? "depositWithMin" : "redeemWithMin",
                  args: [n, minOut(output), w.account!],
                });
              })
            }
          />
        </Disclosure>
        <Disclosure id="demo-yield" title="Fund demo yield">
          <p>
            Donate TestUSDC without receiving shares: 0.1% of vault assets per contribution, capped at 2% total
            share-rate growth. This demonstrates funded yield, not lending returns.
          </p>
          <button
            className="button outline"
            disabled={!w.account || w.busy}
            onClick={() =>
              parseAction("Fund test vault yield", async () => {
                const total = await client.readContract({
                  address: vault,
                  abi: nativeAbi,
                  functionName: "totalAssets",
                });
                const n = total / 1000n;
                await w.approve(usdToken, vault, n);
                await w.send({ address: vault, abi: abi("MonadYieldVault"), functionName: "fundTestYield", args: [n] });
              })
            }
          >
            Donate 0.1% of vault assets
          </button>
        </Disclosure>
      </div>
    </Shell>
  );
}
function HowItWorksPage() {
  return (
    <div className="simple-site">
      <Header />
      <main className="explain-page" id="main" tabIndex={-1}>
        <HowItWorks />
      </main>
      <Footer />
    </div>
  );
}
function Status() {
  const { data, error } = useSnapshot();
  const w = useWallet();
  return (
    <Shell>
      <PageTitle
        title="Know what is live."
        copy="Contract verification, price provenance and action availability — in one place."
      />
      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="summary-grid">
            <div>
              <span>Connected network</span>
              <strong>
                Monad <small>Testnet · 10143</small>
              </strong>
            </div>
            <div>
              <span>Last observed block</span>
              <strong>{Number(data.blockNumber).toLocaleString()}</strong>
            </div>
            <div>
              <span>Deployed contract checks</span>
              <strong>{data.contractsVerified ? "Verified" : "Action required"}</strong>
            </div>
          </div>
          <div className="notice">
            Last observation: {new Date(data.observedAt).toLocaleTimeString()}. A synthetic formula evaluation is not an
            external price publication.
          </div>
          <section className="status-panel">
            <h2>Price sources</h2>
            {data.assets.map((a) => (
              <div className="status-row" key={a.id}>
                <TokenIcon asset={a} />
                <div>
                  <strong>{a.symbol}</strong>
                  <span>
                    {kind(a)}
                    {a.publishedAt ? ` · Published ${new Date(a.publishedAt * 1000).toLocaleString()}` : ""}
                  </span>
                </div>
                <b>{usd(a.price)}</b>
                <Tag tone={a.healthy ? "success" : "pending"}>{a.healthy ? "Available" : "Unavailable"}</Tag>
              </div>
            ))}
            <div className="status-row">
              <div>
                <strong>
                  {data.referenceOracle === "redstone" ? "RedStone MON reference" : "Pyth update service"}
                </strong>
                <span>
                  {data.referenceOracle === "redstone"
                    ? "Read directly from Monad testnet. Prices older than 120 seconds are rejected."
                    : data.pythUpdateConfigured
                      ? "Authenticated signed price updates are configured."
                      : "Awaiting account/API key setup. No synthetic price fallback."}
                </span>
              </div>
              <Tag
                tone={
                  (
                    data.referenceOracle === "redstone"
                      ? data.assets.find((a) => a.id === "wmon")?.healthy
                      : data.pythUpdateConfigured
                  )
                    ? "success"
                    : "pending"
                }
              >
                {data.referenceOracle === "redstone"
                  ? data.assets.find((a) => a.id === "wmon")?.healthy
                    ? "Fresh"
                    : "Unavailable"
                  : data.pythUpdateConfigured
                    ? "Configured"
                    : "Setup needed"}
              </Tag>
            </div>
            {data.referenceOracle !== "redstone" && data.pythUpdateConfigured && (
              <Submit
                label="Publish the latest signed MON price"
                onClick={() => w.execute("Update Pyth price", w.updatePrice)}
              />
            )}
          </section>
          <section className="status-panel">
            <h2>Actions by market</h2>
            {data.markets.map((m) => (
              <div className="status-row" key={m.id}>
                <div>
                  <strong>
                    {m.symbol} / {m.backingSymbol}
                  </strong>
                  <span>{m.reason || "Fresh verified state available."}</span>
                </div>
                <div className="action-tags">
                  <Tag tone={m.actions.protect ? "success" : "pending"}>Protect {m.actions.protect ? "✓" : "—"}</Tag>
                  <Tag tone={m.actions.withdrawBacking ? "success" : "pending"}>
                    Backing exit {m.actions.withdrawBacking ? "✓" : "—"}
                  </Tag>
                  <Tag tone={m.actions.withdrawAsset ? "success" : "pending"}>
                    Asset exit {m.actions.withdrawAsset ? "✓" : "—"}
                  </Tag>
                </div>
              </div>
            ))}
          </section>
          <section className="status-panel">
            <h2>Deployment addresses</h2>
            {Object.entries(data.registry.contracts).map(([name, c]) => (
              <a
                className="contract-row"
                key={name}
                href={explorer("address", c.address)}
                target="_blank"
                rel="noreferrer"
              >
                <span>{name}</span>
                <code>{short(c.address)}</code>
                <span>↗</span>
              </a>
            ))}
          </section>
        </>
      )}
    </Shell>
  );
}
function CreatePool() {
  const { data, error, mutate } = useSnapshot();
  const w = useWallet();
  const [params, setParams] = useSearchParams();
  const protectedId = params.get("asset") || "wmon",
    backingId = params.get("backing") || "test-usd";
  const [created, setCreated] = useState<string>();
  const versions = data?.creation || [];
  const protectedAssets = data?.assets.filter((a) => versions.some((v) => v.protectedAssets.includes(a.id))) || [];
  const backingAssets =
    data?.assets.filter((a) =>
      versions.some((v) => v.protectedAssets.includes(protectedId) && v.backingAssets.includes(a.id)),
    ) || [];
  const token = protectedAssets.find((a) => a.id === protectedId),
    backing = backingAssets.find((a) => a.id === backingId);
  const version = creationVersion(versions, protectedId, backingId),
    quote = version?.backing.find((b) => b.id === backingId);
  const balance = useBalance(backing?.address),
    bond = BigInt(quote?.bond || "0");
  const fundingAsset = backing
    ? { symbol: backing.symbol, balance: balance.error ? undefined : balance.data }
    : undefined;
  const insufficient = !!w.account && (fundingAsset?.balance == null || fundingAsset.balance < bond);
  const unavailable =
    !token || !backing
      ? "Choose a supported asset and backing token."
      : !version?.available
        ? version?.reason || "Creation settings unavailable."
        : !quote?.available
          ? quote?.reason
          : !token.healthy
            ? "Asset price unavailable."
            : null;
  const select = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setCreated(undefined);
  };
  async function checkReview(review: string, chosen: CreationOption) {
    const fresh = await fetcher("/api/creation");
    if (fresh.chainId !== 10143 || Date.now() - fresh.observedAt > 30000 || fresh.observedAt > Date.now())
      throw new Error("Refresh the creation review.");
    const next = (fresh.creation as CreationOption[]).find((v) => v.id === chosen.id);
    if (!next || creationFingerprint(next, protectedId, backingId) !== review) {
      await mutate();
      throw new Error("Creation terms changed. Review the updated bond and try again.");
    }
    assertCreationIdentity(next, registry, protectedId, backingId);
  }
  return (
    <Shell>
      <PageTitle title="Create a pool" copy="Choose an asset and its backing." />
      {!data ? (
        <Loading error={error} />
      ) : (
        <div className="task-layout">
          <section className="action-panel">
            <AssetSelect
              label="Protected asset"
              assets={protectedAssets}
              value={protectedId}
              onChange={(v) => select("asset", v)}
              disabled={w.busy}
            />
            <AssetSelect
              label="Backing token"
              assets={backingAssets}
              value={backingId}
              onChange={(v) => select("backing", v)}
              disabled={w.busy}
            />
            {version && (
              <dl className="review-list">
                <div>
                  <dt>Collateral</dt>
                  <dd>{Number(version.collateralBps) / 100}%</dd>
                </div>
                <div>
                  <dt>Gains shared</dt>
                  <dd>
                    {Number(version.juniorFeeBps) / 100}% provider · {Number(version.creatorFeeBps) / 100}% creator ·{" "}
                    {Number(version.protocolFeeBps) / 100}% protocol
                  </dd>
                </div>
                <div>
                  <dt>Creation bond</dt>
                  <dd>
                    {quote?.bond && backing
                      ? `${formatUnits(bond, backing.decimals)} ${backing.symbol}`
                      : "Unavailable"}
                  </dd>
                </div>
                <div>
                  <dt>Earliest protected exit</dt>
                  <dd>{version.minimumPoolTime / 60} minute</dd>
                </div>
                <div>
                  <dt>Backing withdrawal notice</dt>
                  <dd>{version.unlockDuration / 60} minutes</dd>
                </div>
              </dl>
            )}
            <p className="field-hint">
              Balance: {fmt(fundingAsset?.balance, backing?.decimals)} {backing?.symbol}
            </p>
            <AssetFundingHint asset={fundingAsset} />
            {unavailable && (
              <p className="inline-warning" role="status">
                {unavailable}
              </p>
            )}
            {insufficient && fundingAsset?.balance !== undefined && fundingAsset.balance > 0n && (
              <p className="field-hint">
                More {backing?.symbol} is needed for the bond. <Link to="/faucet">Get tokens ↗</Link>
              </p>
            )}
            <Submit
              label="Approve bond & create pool"
              asset={fundingAsset}
              disabled={!!unavailable || insufficient || bond <= 0n}
              onClick={() =>
                w.execute("Create pool", async () => {
                  if (!version || !token || !backing || unavailable) throw new Error("Choose an available pair.");
                  assertCreationIdentity(version, registry, protectedId, backingId);
                  for (const selected of [token, backing]) {
                    const pinned = registry.assets.find((a) => a.id === selected.id);
                    if (
                      !pinned ||
                      pinned.address.toLowerCase() !== selected.address.toLowerCase() ||
                      pinned.decimals !== selected.decimals ||
                      pinned.symbol !== selected.symbol
                    )
                      throw new Error("Asset identity changed. Reload the app.");
                  }
                  const review = creationFingerprint(version, protectedId, backingId);
                  await checkReview(review, version);
                  await w.approve(backing.address, version.factory, bond);
                  await checkReview(review, version);
                  const receipt = await w.send({
                    address: version.factory,
                    abi: abi("SplitRiskPoolFactory"),
                    functionName: "createPool",
                    args: [
                      token.address,
                      token.symbol,
                      backing.address,
                      backing.symbol,
                      BigInt(version.juniorFeeBps),
                      BigInt(version.creatorFeeBps),
                      BigInt(version.collateralBps),
                      bond,
                    ],
                  });
                  const logs = parseEventLogs({
                    abi: parseAbi([
                      "event PoolCreated(address indexed poolAddress,address indexed shieldedToken,address indexed backingToken,uint256 commissionRate,uint256 poolFee,uint256 collateralRatio,address creator)",
                    ]),
                    logs: receipt.logs,
                    eventName: "PoolCreated",
                    strict: true,
                  }).filter((e) => e.address.toLowerCase() === version.factory.toLowerCase());
                  if (logs.length !== 1)
                    throw new Error("Pool confirmed. Open the transaction receipt to find its address.");
                  setCreated(logs[0].args.poolAddress.toLowerCase());
                })
              }
            />
            {created && (
              <p className="notice">
                Pool created. <Link to={`/provide?market=${created}`}>Provide backing ↗</Link>
              </p>
            )}
          </section>
          <TaskAside title="Back it to begin." asset={token} backing={backing}>
            <p>The bond stays locked until the factory’s closure rules allow recovery.</p>
            <p>Provide backing before holders can open protection.</p>
            <Link to="/markets">View pools ↗</Link>
          </TaskAside>
        </div>
      )}
    </Shell>
  );
}
function Legal() {
  return (
    <div className="simple-site">
      <Header />
      <main className="legal-page" id="main" tabIndex={-1}>
        <h1>Legal & privacy</h1>
        <h2>Operator</h2>
        <p>
          Hawig Ventures UG (haftungsbeschränkt)
          <br />
          Herzogin-Juliana-Straße 7<br />
          55469 Simmern, Germany
        </p>
        <p>
          Managing Director: David Hawig
          <br />
          Commercial Register: HRB 24975, Amtsgericht Bad Kreuznach
          <br />
          Email: <a href="mailto:david@yieldshield.ai">david@yieldshield.ai</a>
        </p>
        <h2>Experimental testnet application</h2>
        <p>
          This application demonstrates the YieldShield protocol on Monad testnet. Test assets have no monetary value.
          TestUSDC is a YieldShield demonstration token, not Circle USDC, a redeemable dollar or a deposit. sMON-demo is
          a synthetic scenario token and is not Kintsu sMON. The YieldShield WMON wrapper is explicitly deployed for
          this demo.
        </p>
        <h2>Risk and exit mechanics</h2>
        <p>
          Protection is limited by the pool’s code, available collateral, price feeds and each position’s native
          backing-token cap. A backing exit surrenders the remaining asset. It does not pay a loss reimbursement while
          leaving the holder with that asset. Junior providers bear first losses and have no guaranteed return or
          protected principal.
        </p>
        <p>
          Gain-sharing fees can be realized before the final exit and are not refunded after a later price decrease. An
          exit in vault shares requires a separate redemption to obtain the underlying test asset. shMON is valued using
          delayed withdrawal NAV; market discounts, protocol liquidity, slashing and unstaking delays can affect
          realizable value.
        </p>
        <h2>External integrations</h2>
        <p>
          RedStone, Pyth and shMonad are external protocols. Their use does not imply endorsement or partnership. No
          stock trading, tokenized equities or real-money payments are enabled here.
        </p>
        <h2>Privacy</h2>
        <p>
          Dynamic provides optional email authentication and embedded wallets. Its authentication screens handle email
          verification, device checks and wallet confirmations. The frontend is hosted on Vercel and the read-only API
          on Railway. Requests necessarily reach those providers and the configured Monad RPC. Wallet addresses and
          on-chain transactions are public; the app uses an address to read positions when you connect. It does not
          receive your wallet’s private keys. No advertising analytics, marketing cookies or account database are
          configured. Interface fonts are hosted with the app. The browser temporarily stores a pending transaction hash
          to recover its confirmation after a reload.
        </p>
        <p>
          Contact the operator for privacy questions or requests. This page describes this testnet release; it does not
          replace provider privacy terms.
        </p>
        <h2>Source and prior work</h2>
        <p>
          This build reuses the attributed YieldShield Base foundation. The repository records the import, new Monad
          work, dependency licenses and AI assistance. Repository publication is a prerequisite for the later hackathon
          submission.
        </p>
        <a href="https://github.com/YieldShield/yieldshield-monad" target="_blank" rel="noreferrer">
          View source repository ↗
        </a>
      </main>
      <Footer />
    </div>
  );
}
class Boundary extends React.Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="empty-state">
        <h1>Something did not load.</h1>
        <p>Your wallet still controls your funds. Reload to reconnect to the current application state.</p>
        <button className="button dark" onClick={() => location.reload()}>
          Reload app
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function LegacyTokensRedirect() {
  const { search, hash } = useLocation();
  return <Navigate replace to={`/faucet${search}${hash}`} />;
}
function ScrollToSection() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    else {
      window.scrollTo({ top: 0, behavior: "instant" });
      document.getElementById("main")?.focus({ preventScroll: true });
    }
  }, [pathname, hash]);
  return null;
}
function App() {
  return (
    <Boundary>
      <BrowserRouter>
        <ScrollToSection />
        <WalletProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/protect" element={<PositionForm key="senior" side="senior" />} />
            <Route path="/provide" element={<PositionForm key="junior" side="junior" />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/positions/:key" element={<PositionDetail />} />
            <Route path="/faucet" element={<Tokens />} />
            <Route path="/tokens" element={<LegacyTokensRedirect />} />
            <Route path="/lab" element={<Navigate replace to="/how-it-works#calculator" />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
            <Route path="/status" element={<Status />} />
            <Route path="/evidence" element={<Navigate replace to="/how-it-works" />} />
            <Route path="/create-pool" element={<CreatePool />} />
            <Route path="/legal" element={<Legal />} />
            <Route
              path="*"
              element={
                <Shell>
                  <div className="empty-state">
                    <h1>Page not found.</h1>
                    <Link to="/markets">Explore markets ↗</Link>
                  </div>
                </Shell>
              }
            />
          </Routes>
        </WalletProvider>
      </BrowserRouter>
    </Boundary>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
