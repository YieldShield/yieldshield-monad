import React, { useState, useEffect, useMemo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, NavLink, useParams, useNavigate } from "react-router-dom";
import useSWR from "swr";
import { parseAbi, formatUnits, type Abi, type Address } from "viem";
import config from "../../../config/monad.json";
import registryJson from "../../../config/deployment.json";
import abisJson from "../../../config/browser-abis.json";
import { WalletProvider, useWallet, useBalance, client } from "./wallet";
import { amount, minOut, netAsset, noticeState, fmt, usd, short, fetcher, explorer, errorMessage } from "./lib";
import type { Asset, Market, Position, Snapshot, Registry } from "./types";
import "./styles.css";
const registry = registryJson as unknown as Registry;
const abi = (name: string) => (abisJson as unknown as Record<string, Abi>)[name];
const contract = (name: string) => registry.contracts[name]?.address;
const useSnapshot = () => useSWR<Snapshot>("/api/status", fetcher, { refreshInterval: 12000, errorRetryCount: 2 });
const same = (a?: string, b?: string) => Boolean(a && b && a.toLowerCase() === b.toLowerCase());
const kind = (a: Asset) =>
  ({
    "external-reference": "Pyth reference",
    "redemption-nav": "Staking NAV",
    synthetic: "Scenario price",
    "synthetic-unit": "Test unit",
    "test-vault-nav": "Funded test NAV",
  })[a.kind] || a.kind;
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brandmark ${small ? "small" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 34">
        <path d="M4 4h24v15c0 6-12 12-12 12S4 25 4 19Z" />
        <path d="m10 12 6 5 6-5M16 17v8" />
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
function TokenIcon({ symbol = "MON" }: { symbol?: string }) {
  return (
    <span
      className={`token-icon ${symbol.includes("USD") ? "usd" : symbol.includes("demo") ? "lab" : symbol === "shMON" ? "staking" : ""}`}
      aria-hidden="true"
    >
      {symbol.includes("USD") ? "$" : symbol === "shMON" ? "s" : symbol.includes("demo") ? "◇" : "◈"}
    </span>
  );
}
function Tag({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={`tag ${tone}`}>{children}</span>;
}
function WalletButton() {
  const w = useWallet();
  return (
    <button className={w.account ? "wallet-connected" : "button dark"} onClick={w.account ? w.disconnect : w.connect}>
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
function Header() {
  return (
    <header className="public-header">
      <Brand />
      <nav aria-label="Main navigation">
        <Link to="/markets">Explore</Link>
        <Link to="/how-it-works">How it works</Link>
        <Link to="/status">Status</Link>
      </nav>
      <WalletButton />
    </header>
  );
}
function Footer() {
  return (
    <footer>
      <Brand />
      <p>Built for a different way to hold.</p>
      <div>
        <Link to="/legal">Legal & privacy</Link>
        <a href="https://github.com/YieldShield/yieldshield-monad" target="_blank" rel="noreferrer">
          Source ↗
        </a>
        <a href="https://x.com/yieldshield_ai" target="_blank" rel="noreferrer">
          X ↗
        </a>
      </div>
      <small>Monad testnet · Experimental software · Test tokens have no monetary value</small>
    </footer>
  );
}
function HeroArt() {
  return (
    <div className="hero-art" aria-label="Protected holders and liquidity providers form two sides of one pool">
      <div className="orbital orbit-one" />
      <div className="orbital orbit-two" />
      <div className="asset-coin">
        <span>◈</span>
        <small>MON</small>
      </div>
      <div className="tranche-card senior-art">
        <span className="eyebrow">01 / Protected holder</span>
        <strong>Keep the upside.</strong>
        <div className="art-chart">
          <svg viewBox="0 0 220 55">
            <path d="M0 44 30 40 52 47 81 19 100 29 122 17 151 27 180 10 220 0" />
          </svg>
        </div>
        <span>Your asset. Two ways to exit.</span>
      </div>
      <div className="tranche-card junior-art">
        <span className="eyebrow">02 / Liquidity provider</span>
        <strong>Provide the backing.</strong>
        <div className="backing-blocks">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <span>Earn a share of realized gains.</span>
      </div>
      <div className="art-label">
        <span className="dot" /> One pool. Clear priorities.
      </div>
    </div>
  );
}
function Home() {
  return (
    <div className="public-page">
      <Header />
      <main id="main">
        <section className="hero">
          <div>
            <p className="eyebrow">A new way to hold · Monad edition</p>
            <h1>
              Keep your
              <br />
              upside.
              <br />
              <em>Choose your exit.</em>
            </h1>
            <p className="hero-copy">
              Hold MON with a second way out.
              <br />
              Choose protection, or provide the backing.
            </p>
            <div className="hero-actions">
              <Link className="button dark" to="/markets">
                Explore markets <span>↗</span>
              </Link>
              <Link className="text-link" to="/how-it-works">
                See how it works
              </Link>
            </div>
            <p className="hero-note">
              <span className="dot purple" /> Built on Monad testnet. Try it with free test assets.
            </p>
          </div>
          <HeroArt />
        </section>
        <section className="benefit-strip">
          <div>
            <b>Two ways to exit</b>
            <span>Take your asset or use your backing option.</span>
          </div>
          <div>
            <b>No recurring premium</b>
            <span>Fees come from realized gains.</span>
          </div>
          <div>
            <b>Backing comes first</b>
            <span>Protection opens only when reserves permit.</span>
          </div>
        </section>
        <section className="two-roles">
          <div>
            <p className="eyebrow">Your risk. Your role.</p>
            <h2>
              Pick your side
              <br />
              of the pool.
            </h2>
            <p>Each role has different rewards and responsibilities. The rules stay visible before you commit.</p>
          </div>
          <Link to="/protect" className="role-card senior">
            <span>01 / Senior position</span>
            <h3>
              I want
              <br />
              protection.
            </h3>
            <p>Deposit a supported asset. Keep its upside after gain-sharing fees, with a capped backing-token exit.</p>
            <b>Get protection ↗</b>
          </Link>
          <Link to="/provide" className="role-card junior">
            <span>02 / Junior position</span>
            <h3>
              I want to
              <br />
              provide liquidity.
            </h3>
            <p>
              Provide backing tokens, earn a share of realized gains, and accept first losses when protection is used.
            </p>
            <b>Provide liquidity ↗</b>
          </Link>
        </section>
        <section className="lab-banner">
          <div>
            <p className="eyebrow">Try the whole story</p>
            <h2>
              A market drop.
              <br />
              An exit you can see.
            </h2>
            <p>
              The scenario lab uses clearly labeled synthetic prices so you can experience both sides of a protected
              exit in minutes.
            </p>
          </div>
          <Link to="/lab" className="button light">
            Open scenario lab ↗
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
const nav = [
  ["/markets", "◈", "Explore markets"],
  ["/trade", "⇄", "Trade"],
  ["/protect", "◇", "Get protection"],
  ["/positions", "▤", "My positions"],
  ["/provide", "＋", "Provide liquidity"],
  ["/tokens", "◉", "Test assets"],
  ["/lab", "↗", "Scenario lab"],
  ["/status", "≋", "Network status"],
];
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <div className="network-label">
          <span className="dot purple" /> Monad Testnet <small>10143</small>
        </div>
        <nav aria-label="App navigation">
          {nav.map(([to, icon, label]) => (
            <NavLink to={to} key={to}>
              <span aria-hidden>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
            Get testnet MON ↗
          </a>
          <Link to="/how-it-works">How it works</Link>
          <Link to="/legal">Legal & privacy</Link>
          <span>Built for Metropolis</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <Link className="mobile-brand" to="/">
            <Mark small />
            YieldShield
          </Link>
          <div className="testnet-label">
            Experiment with confidence<span> · Test tokens, no monetary value</span>
          </div>
          <WalletButton />
        </header>
        <nav className="mobile-nav" aria-label="Mobile app navigation">
          {nav.map(([to, _, label]) => (
            <NavLink to={to} key={to}>
              {label}
            </NavLink>
          ))}
        </nav>
        <main id="main" className="workspace">
          {children}
        </main>
        <div className="app-foot">
          YieldShield · Monad testnet{" "}
          <a href="https://www.monad.xyz/developers/hackathons/metropolis" target="_blank" rel="noreferrer">
            Metropolis ↗
          </a>
        </div>
      </div>
    </div>
  );
}
function PageTitle({
  kicker,
  title,
  copy,
  children,
}: {
  kicker: string;
  title: string;
  copy: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <p className="eyebrow">{kicker}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {children}
    </div>
  );
}
function Loading({ error }: { error?: Error }) {
  return (
    <div className={`notice ${error ? "warning" : ""}`} role="status">
      {error ? error.message : "Reading the latest verified Monad state…"}
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
      <div className="card-top">
        <TokenIcon symbol={m.symbol} />
        <Tag tone={m.ready ? "success" : "pending"}>{m.ready ? "Available" : "Action needed"}</Tag>
      </div>
      <h3>
        {m.symbol}
        <span> / {m.backingSymbol}</span>
      </h3>
      <p>
        {m.environment === "scenario"
          ? "Synthetic market for a repeatable demo"
          : m.symbol === "shMON"
            ? "Liquid-staking withdrawal NAV"
            : "MON with a Pyth reference price"}
      </p>
      <div className="market-price">
        {usd(m.shield?.price)}
        <small>{m.shield && kind(m.shield)}</small>
      </div>
      <div className="mini-metrics">
        <div>
          <span>Junior backing</span>
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
      <PageTitle
        kicker="Explore / Monad"
        title="Make room for your upside."
        copy="Choose an asset, understand its backing, and find your place in the pool."
      />
      <div className="filter-row">
        <div className="segmented">
          <button className={environment === "reference" ? "selected" : ""} onClick={() => setEnvironment("reference")}>
            Monad reference markets
          </button>
          <button className={environment === "scenario" ? "selected" : ""} onClick={() => setEnvironment("scenario")}>
            Scenario markets
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
              ? "Reference markets use external MON prices. shMON is valued at delayed withdrawal NAV; it is not a spot-market sell quote."
              : "Scenario assets have a predictable 8-minute price cycle. They are separate tokens and contracts, with no claim on MON."}
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
                  ? "The live-price route needs authenticated Pyth updates before protection can open. Native wrapping and shMON staking remain separate actions."
                  : "Contract deployment is in progress. No placeholder pool addresses are used."}
              </p>
              <div className="row">
                <Link className="button purple-button" to="/tokens">
                  Explore test assets ↗
                </Link>
                {environment === "reference" && (
                  <button className="button outline" onClick={() => setEnvironment("scenario")}>
                    Try scenario markets
                  </button>
                )}
              </div>
            </div>
          )}
          <section className="understand-panel">
            <h3>What does protection mean here?</h3>
            <p>
              Your position records its entry value in USD terms. The backing exit exchanges your remaining deposited
              asset for a capped quantity of backing tokens. It does not promise a fixed number of MON or make the
              junior side risk-free.
            </p>
            <Link to="/how-it-works">Read the rules ↗</Link>
          </section>
        </>
      )}
    </Shell>
  );
}
function Submit({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  const w = useWallet();
  return (
    <button
      className="button purple-button full"
      disabled={w.busy || (!!w.account && disabled)}
      onClick={w.account ? onClick : w.connect}
    >
      {w.busy ? "Transaction in progress…" : !w.account ? "Connect wallet" : label}
    </button>
  );
}
function useSelectedMarket(data: Snapshot | undefined) {
  const [id, setId] = useState(new URLSearchParams(location.search).get("market") || "");
  const m = data?.markets.find((m) => m.id === id) || data?.markets[0];
  return { m, id: m?.id || "", setId };
}
function MarketSelect({ data, id, setId }: { data: Snapshot; id: string; setId: (id: string) => void }) {
  return (
    <label className="field">
      Market
      <select value={id} onChange={(e) => setId(e.target.value)}>
        {data.markets.map((m) => (
          <option key={m.id} value={m.id}>
            {m.symbol} / {m.backingSymbol} · {m.environment === "scenario" ? "Scenario" : "Reference"}
          </option>
        ))}
      </select>
    </label>
  );
}
function PositionForm({ side }: { side: "senior" | "junior" }) {
  const { data, error } = useSnapshot();
  const { m, id, setId } = useSelectedMarket(data);
  const [input, setInput] = useState(side === "senior" ? "1" : "1000");
  const w = useWallet();
  const token = side === "senior" ? m?.shield : m?.backing;
  const { data: balance } = useBalance(token?.address);
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
      <PageTitle
        kicker={side === "senior" ? "Senior / Protected holder" : "Junior / Liquidity provider"}
        title={side === "senior" ? "A second way out." : "Back the upside."}
        copy={
          side === "senior"
            ? "Hold a supported asset with an additional, capped backing-token exit."
            : "Supply the backing. Share realized gains. Accept the first losses."
        }
      />
      {!data ? (
        <Loading error={error} />
      ) : !m ? (
        <div className="empty-state">
          <h2>No executable pools yet.</h2>
          <p>Verified pools appear here when deployment is complete.</p>
          <Link to="/markets">Back to markets ↗</Link>
        </div>
      ) : (
        <div className="form-layout">
          <section className={`action-panel ${side}`}>
            <div className="panel-heading">
              <TokenIcon symbol={token?.symbol} />
              <h2>{side === "senior" ? "Get protection" : "Provide liquidity"}</h2>
              <Tag>{m.environment === "scenario" ? "Scenario" : "Reference"}</Tag>
            </div>
            <MarketSelect data={data} id={id} setId={setId} />
            <label className="field">
              {side === "senior" ? "Asset to protect" : "Backing to provide"}
              <div className="amount-field">
                <input
                  inputMode="decimal"
                  aria-label="Deposit amount"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  autoComplete="off"
                />
                <b>{token?.symbol}</b>
              </div>
              <span className="field-hint">
                Balance: {fmt(balance, token?.decimals, 5)} {token?.symbol}
              </span>
            </label>
            <dl className="review-list">
              <div>
                <dt>Reference entry value</dt>
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
                    <dt>Gain-sharing fee</dt>
                    <dd>12% of realized gains</dd>
                  </div>
                  <div>
                    <dt>Backing exit available after</dt>
                    <dd>60 seconds</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Share of realized gains</dt>
                    <dd>10% distributed to junior holders</dd>
                  </div>
                  <div>
                    <dt>Withdrawal notice</dt>
                    <dd>120 seconds</dd>
                  </div>
                  <div>
                    <dt>Principal protection</dt>
                    <dd>None — first-loss capital</dd>
                  </div>
                </>
              )}
            </dl>
            {(!available || validation || tooMuch || overCapacity) && (
              <p className="inline-warning">
                {validation ||
                  (!available
                    ? m.reason || "No capacity is currently available."
                    : tooMuch
                      ? "Your token balance is too low."
                      : overCapacity
                        ? "This amount exceeds currently available protection capacity."
                        : "")}
              </p>
            )}
            <Submit
              label={side === "senior" ? "Approve & protect" : "Approve & provide"}
              disabled={!available || !!validation || tooMuch || overCapacity || value === 0n}
              onClick={submit}
            />
            <p className="consent-note">
              You approve only this token amount. The pool issues a receipt NFT that controls your position.
            </p>
          </section>
          <aside className="explanation-panel">
            <span className="step-number">{side === "senior" ? "01" : "02"}</span>
            <h2>{side === "senior" ? "One position.\nTwo choices." : "Rewards come\nwith responsibility."}</h2>
            {side === "senior" ? (
              <>
                <h3>Take your asset</h3>
                <p>Withdraw the remaining asset after any gain-sharing fees. This also closes its protection.</p>
                <h3>Use the backing exit</h3>
                <p>
                  Surrender the remaining asset and receive backing tokens up to the position’s entry-value and
                  collateral limits. You do not keep both.
                </p>
                {m.backingSymbol === "vTestUSDC" && (
                  <div className="notice">
                    This pool pays vault shares. Redeeming those shares for TestUSDC is a separate action.
                  </div>
                )}
              </>
            ) : (
              <>
                <h3>Earn when holders realize gains</h3>
                <p>Junior rewards are paid in the protected asset. There is no promised yield or fixed APY.</p>
                <h3>Absorb the first loss</h3>
                <p>
                  When protection is used, junior capital pays the backing exit and receives the surrendered asset
                  through the pool’s accounting.
                </p>
                <h3>Only excess backing can leave</h3>
                <p>
                  Finishing the notice period does not release collateral that is still reserved for protected
                  positions.
                </p>
              </>
            )}
            <Link to="/positions">View your positions ↗</Link>
          </aside>
        </div>
      )}
    </Shell>
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
      <PageTitle
        kicker="Portfolio / Monad"
        title="Your positions."
        copy="Your receipt NFTs hold the record. Choose the next step for each position."
      />
      {!w.account ? (
        <div className="empty-state">
          <span className="big-glyph">▤</span>
          <h2>Your wallet, your positions.</h2>
          <p>Connect to view protected assets and junior liquidity.</p>
          <WalletButton />
        </div>
      ) : !data ? (
        <Loading error={error} />
      ) : !data.positions.length ? (
        <div className="empty-state">
          <h2>Your first position starts here.</h2>
          <p>Try the scenario market with free test assets, or explore Monad reference assets.</p>
          <Link className="button purple-button" to="/markets">
            Explore markets ↗
          </Link>
        </div>
      ) : (
        <div className="position-list">
          {data.positions.map((p) => {
            const m = state?.markets.find((m) => m.id === p.poolId);
            return (
              <Link key={p.key} className="position-row" to={`/positions/${encodeURIComponent(p.key)}`}>
                <TokenIcon symbol={p.side === "senior" ? m?.symbol : m?.backingSymbol} />
                <div>
                  <strong>
                    {p.side === "senior" ? "Protected" : "Junior"} {p.side === "senior" ? m?.symbol : m?.backingSymbol}
                  </strong>
                  <span>
                    {m?.environment === "scenario" ? "Scenario market" : "Reference market"} · Receipt #{p.id}
                  </span>
                </div>
                <b>{fmt(p.position.amount, p.side === "senior" ? m?.shield.decimals : m?.backing.decimals, 5)}</b>
                <Tag tone={p.side}>{p.side === "senior" ? "Protected" : "First loss"}</Tag>
                <span>↗</span>
              </Link>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
function PositionDetail() {
  const { key } = useParams();
  const w = useWallet();
  const { data: state } = useSnapshot();
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
        <Loading error={error} />
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
        kicker={`${senior ? "Senior" : "Junior"} / Receipt #${p.id}`}
        title={`${senior ? "Protected " + m.symbol : m.backingSymbol + " liquidity"}`}
        copy={
          m.environment === "scenario" ? "A position in the synthetic scenario market." : "A position on Monad testnet."
        }
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
            <span className="eyebrow">Option 01</span>
            <h2>Take your asset.</h2>
            <p>Close this position and receive the remaining {m.symbol}, after realized-gain fees.</p>
            <strong className="exit-amount">
              {fmt(assetExit, m.shield.decimals, 6)} <small>{m.symbol}</small>
            </strong>
            {!m.shield.healthy && (
              <p className="inline-warning">
                A current asset price is needed to settle gain-sharing fees. Refresh the signed MON price on Market
                status.
              </p>
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
            <span className="eyebrow">Option 02</span>
            <h2>Use your backing exit.</h2>
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
              <p className="consent-note">Payout is vault shares. Redeem them separately on the Test assets page.</p>
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
          <aside className="explanation-panel">
            <h2>Reserved means reserved.</h2>
            <p>
              The notice period only controls timing. The pool must still have enough backing for every active protected
              position.
            </p>
            <p>
              Rewards and surrendered assets are accounted for on-chain. Your backing amount can decrease when the pool
              pays protection.
            </p>
          </aside>
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
function Trade() {
  const { data, error } = useSnapshot();
  const { m, id, setId } = useSelectedMarket(
    data ? { ...data, markets: data.markets.filter((m) => m.environment === "scenario") } : undefined,
  );
  const [input, setInput] = useState("1"),
    [side, setSide] = useState<"buy" | "sell">("buy");
  const w = useWallet();
  let value = 0n;
  try {
    if (m) value = amount(input, m.shield.decimals);
  } catch {}
  const { data: quote, error: quoteError } = useSWR(
    m && value > 0n ? `/api/quote?market=${id}&amount=${value}&side=${side}` : null,
    fetcher,
    { dedupingInterval: 2000, refreshInterval: 10000 },
  );
  return (
    <Shell>
      <PageTitle
        kicker="Trade / Scenario exchange"
        title="A trade is just the beginning."
        copy="Buy or sell test assets. Protection is a separate choice after the trade."
      />
      {!data ? (
        <Loading error={error} />
      ) : !m ? (
        <div className="empty-state">
          <h2>The test exchange is being prepared.</h2>
          <Link to="/tokens">Wrap MON or stake with shMON ↗</Link>
        </div>
      ) : (
        <div className="form-layout">
          <section className="action-panel">
            <div className="segmented">
              <button className={side === "buy" ? "selected" : ""} onClick={() => setSide("buy")}>
                Buy
              </button>
              <button className={side === "sell" ? "selected" : ""} onClick={() => setSide("sell")}>
                Sell
              </button>
            </div>
            <MarketSelect
              data={{ ...data, markets: data.markets.filter((m) => m.environment === "scenario") }}
              id={id}
              setId={setId}
            />
            <label className="field">
              {m.symbol} amount
              <div className="amount-field">
                <input
                  aria-label="Trade amount"
                  value={input}
                  inputMode="decimal"
                  onChange={(e) => setInput(e.target.value)}
                />
                <b>{m.symbol}</b>
              </div>
              <span className="field-hint">Maximum 25 tokens per trade</span>
            </label>
            <dl className="review-list">
              <div>
                <dt>{side === "buy" ? "You pay" : "You receive"}</dt>
                <dd>{fmt(quote?.total, 6, 4)} TestUSDC</dd>
              </div>
              <div>
                <dt>Included exchange fee</dt>
                <dd>0.30%</dd>
              </div>
              <div>
                <dt>Price source</dt>
                <dd>Synthetic scenario formula</dd>
              </div>
              <div>
                <dt>Slippage limit</dt>
                <dd>0.50%</dd>
              </div>
            </dl>
            {quoteError && <p className="inline-warning">{quoteError.message}</p>}
            <Submit
              label={side === "buy" ? "Approve & buy test asset" : "Approve & sell test asset"}
              disabled={!quote || !!quoteError}
              onClick={() =>
                w.execute("Prepare scenario trade", async () => {
                  if (quote.expiresAt < Date.now()) throw new Error("Quote expired. Wait for a fresh quote.");
                  const usdToken = registry.assets.find((a) => a.id === "test-usd")!;
                  const total = BigInt(quote.total),
                    limit = side === "buy" ? (total * 1005n + 999n) / 1000n : minOut(total);
                  await w.approve(
                    side === "buy" ? usdToken.address : m.shieldedToken,
                    contract("ScenarioExchange"),
                    side === "buy" ? limit : value,
                  );
                  await w.send({
                    address: contract("ScenarioExchange"),
                    abi: abi("MonadAssetExchange"),
                    functionName: "swap",
                    args: [m.shieldedToken, side === "buy", value, limit, BigInt(Math.floor(Date.now() / 1000) + 60)],
                  });
                })
              }
            />
          </section>
          <aside className="explanation-panel">
            <span className="step-number">⇄</span>
            <h2>
              Trade first.
              <br />
              Protect next.
            </h2>
            <p>
              This inventory-funded test exchange lets you experience buying and selling, with synthetic prices and
              valueless assets.
            </p>
            <p>
              It is not a live market venue. For Monad ecosystem trading, use a supported external venue and bring an
              eligible token back to YieldShield.
            </p>
            <a href="https://www.kuru.io/" target="_blank" rel="noreferrer">
              Explore Kuru ↗
            </a>
            <Link to={`/protect?market=${id}`}>Protect a test position ↗</Link>
          </aside>
        </div>
      )}
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
function Tokens() {
  const w = useWallet();
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
  const { data: state } = useSnapshot();
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
      <PageTitle
        kicker="Prepare / Test assets"
        title="Start with the right assets."
        copy="Wrap native MON, stake through shMON, or try the scenario with free test tokens."
      />
      <div className="notice">
        Every transaction here uses Monad testnet. TestUSDC and sMON-demo have no monetary value and are not issued by
        Circle or Kintsu.
      </div>
      <section className="faucet-banner">
        <div>
          <span className="eyebrow">Your scenario starter kit</span>
          <h2>25 sMON-demo + 10,000 TestUSDC</h2>
          <p>One free claim per wallet every 24 hours, while the faucet has inventory.</p>
        </div>
        <div>
          <Submit
            label="Claim free test assets"
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
          <a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">
            Need MON for gas? Official faucet ↗
          </a>
        </div>
      </section>
      <div className="token-tools">
        <section className="action-panel">
          <div className="panel-heading">
            <TokenIcon />
            <h2>Wrap MON</h2>
          </div>
          <p>Convert native testnet MON into YieldShield WMON, 1:1. This is our explicitly deployed wrapper.</p>
          <label className="field">
            Amount
            <div className="amount-field">
              <input
                aria-label="MON wrap amount"
                inputMode="decimal"
                value={wrap}
                onChange={(e) => setWrap(e.target.value)}
              />
              <b>MON</b>
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
        </section>
        <section className="action-panel">
          <div className="panel-heading">
            <TokenIcon symbol="shMON" />
            <h2>Stake MON</h2>
          </div>
          <p>
            Receive shMON from the external shMonad protocol. The exchange rate reflects staking NAV, not a guaranteed
            sell price.
          </p>
          <label className="field">
            Native MON to stake
            <div className="amount-field">
              <input
                aria-label="MON stake amount"
                inputMode="decimal"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
              />
              <b>MON</b>
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
            Understand the staking rate ↗
          </a>
        </section>
        <section className="action-panel">
          <div className="panel-heading">
            <TokenIcon symbol="vTestUSDC" />
            <h2>Test USD vault</h2>
          </div>
          <p>
            Vault shares are backed by actual TestUSDC balances. Any demonstrated yield comes from funded donations.
          </p>
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
                aria-label="Vault amount"
                inputMode="decimal"
                value={vaultInput}
                onChange={(e) => setVaultInput(e.target.value)}
              />
              <b>{vaultMode === "deposit" ? "TestUSDC" : "vTestUSDC"}</b>
            </div>
            <span className="field-hint">
              {fmt(ub.data, 6)} TestUSDC · {fmt(vb.data, 6)} vault shares
            </span>
          </label>
          <p className="field-hint">1 share ≈ {fmt(nav, 6, 6)} TestUSDC</p>
          <Submit
            label={vaultMode === "deposit" ? "Approve & deposit into vault" : "Redeem vault shares"}
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
        </section>
        <section className="action-panel">
          <div className="panel-heading">
            <TokenIcon symbol="shMON" />
            <h2>Unstake shMON</h2>
          </div>
          <p>Native unstaking is a separate, delayed protocol flow. Its completion epoch is determined by shMonad.</p>
          <label className="field">
            Shares to unstake
            <div className="amount-field">
              <input
                aria-label="shMON unstake amount"
                value={unstake}
                inputMode="decimal"
                onChange={(e) => setUnstake(e.target.value)}
              />
              <b>shMON</b>
            </div>
          </label>
          <Submit
            label="Request native unstaking"
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
                Pending: {fmt(request[0], 18, 6)} MON · Completion epoch {String(request[1])}. The protocol validates
                readiness when you complete.
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
      </div>
      <section className="understand-panel">
        <h3>Fund an explicit test-yield demonstration</h3>
        <p>
          Add real TestUSDC to the vault without minting shares. Each contribution is capped at 0.1% of its accounted
          assets, with a 2% total share-rate budget. This is a funded demonstration, not a lending strategy or APY.
        </p>
        <button
          className="button outline"
          disabled={!w.account || w.busy}
          onClick={() =>
            parseAction("Fund test vault yield", async () => {
              const total = await client.readContract({ address: vault, abi: nativeAbi, functionName: "totalAssets" });
              const n = total / 1000n;
              await w.approve(usdToken, vault, n);
              await w.send({ address: vault, abi: abi("MonadYieldVault"), functionName: "fundTestYield", args: [n] });
            })
          }
        >
          Fund the next 0.1% test-yield step
        </button>
      </section>
    </Shell>
  );
}
function Lab({ standalone = false }: { standalone?: boolean }) {
  const [change, setChange] = useState(-20),
    [backingYield, setBackingYield] = useState(0);
  const entry = 100,
    backing = 150,
    market = entry * (1 + change / 100),
    fee = change > 0 ? change * 0.12 : 0;
  const assetExit = market - fee,
    payout = 100,
    sharePrice = 1 + backingYield / 100,
    shares = payout / sharePrice,
    junior = backing - payout + market;
  const content = (
    <>
      <PageTitle
        kicker="Scenario lab / Learn by doing"
        title="See where the risk goes."
        copy="An illustrative $100 position, with $150 of junior backing. Move the market and compare the exits."
      />
      <div className="scenario-layout">
        <section className="scenario-controls">
          <div className="control-label">
            <label htmlFor="change">Asset price change</label>
            <strong className={change >= 0 ? "positive" : "negative"}>
              {change > 0 ? "+" : ""}
              {change}%
            </strong>
          </div>
          <input
            id="change"
            type="range"
            min="-80"
            max="80"
            step="1"
            value={change}
            onChange={(e) => setChange(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>−80%</span>
            <span>Unchanged</span>
            <span>+80%</span>
          </div>
          <div className="control-label">
            <label htmlFor="yield">Backing vault appreciation</label>
            <strong>+{backingYield}%</strong>
          </div>
          <input
            id="yield"
            type="range"
            min="0"
            max="2"
            step=".1"
            value={backingYield}
            onChange={(e) => setBackingYield(Number(e.target.value))}
          />
          <p>
            Share appreciation changes the number of shares paid. It does not increase the recorded USD entry value.
          </p>
          <div className="scenario-ledger">
            <div>
              <span>Original asset value</span>
              <b>$100.00</b>
            </div>
            <div>
              <span>Junior backing at entry</span>
              <b>$150.00</b>
            </div>
            <div>
              <span>Current asset value</span>
              <b>${market.toFixed(2)}</b>
            </div>
            <div>
              <span>Gain-sharing fee on asset exit</span>
              <b>${fee.toFixed(2)}</b>
            </div>
          </div>
        </section>
        <section className="scenario-result">
          <Tag tone="senior">Protected holder</Tag>
          <h2>Choose your exit.</h2>
          <div className="result-comparison">
            <div>
              <span>Take the asset</span>
              <strong>${assetExit.toFixed(2)}</strong>
              <small>After realized-gain fees</small>
            </div>
            <span className="or">or</span>
            <div>
              <span>Use the backing exit</span>
              <strong>$100.00</strong>
              <small>
                {shares.toFixed(4)} vault shares at ${sharePrice.toFixed(3)}/share
              </small>
            </div>
          </div>
          <div className="scenario-divider" />
          <Tag tone="junior">Junior provider</Tag>
          <h3>What happens when backing is used?</h3>
          <p>
            Junior capital pays the backing exit and receives the surrendered asset through the pool. The holder does
            not also keep the asset.
          </p>
          <div className="junior-outcome">
            <span>Illustrative residual value</span>
            <strong>${(junior + (backing * backingYield) / 100).toFixed(2)}</strong>
          </div>
          <small>
            Remaining backing value + surrendered asset value. No earlier fees, delays, trading costs or asset-sale
            discounts are included.
          </small>
        </section>
      </div>
      <div className="notice">
        This calculator is an illustration, not an on-chain quote. Fees already realized earlier are not refunded after
        a later loss. Actual positions keep a fixed cap in backing-token units.
      </div>
      <section className="lab-next">
        <div>
          <h2>Now try it on-chain.</h2>
          <p>
            The separate scenario token moves through an 8-minute cycle: baseline → +25% → baseline → −25% → baseline.
            Every transaction gets a Monad receipt.
          </p>
        </div>
        <ol>
          <li>
            <Link to="/tokens">Claim test assets</Link>
            <span>Keep testnet MON for gas.</span>
          </li>
          <li>
            <Link to="/provide">Provide junior liquidity</Link>
            <span>See the first-loss side of the pool.</span>
          </li>
          <li>
            <Link to="/protect">Open protection</Link>
            <span>Record the entry value and reserved backing.</span>
          </li>
          <li>
            <Link to="/positions">Choose an exit</Link>
            <span>After a price drop, use the backing option.</span>
          </li>
        </ol>
      </section>
    </>
  );
  return standalone ? (
    <div className="public-page">
      <Header />
      <main className="explain-page" id="main">
        {content}
      </main>
      <Footer />
    </div>
  ) : (
    <Shell>{content}</Shell>
  );
}
function Status() {
  const { data, error } = useSnapshot();
  const w = useWallet();
  return (
    <Shell>
      <PageTitle
        kicker="Transparency / Network status"
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
                <TokenIcon symbol={a.symbol} />
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
                <strong>Pyth update service</strong>
                <span>
                  {data.pythUpdateConfigured
                    ? "Authenticated signed price updates are configured."
                    : "Awaiting account/API key setup. No synthetic price fallback."}
                </span>
              </div>
              <Tag tone={data.pythUpdateConfigured ? "success" : "pending"}>
                {data.pythUpdateConfigured ? "Configured" : "Setup needed"}
              </Tag>
            </div>
            {data.pythUpdateConfigured && (
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
  const { data, error } = useSnapshot();
  const w = useWallet();
  const [backing, setBacking] = useState("test-usd");
  const [created, setCreated] = useState(false);
  const token = data?.assets.find((a) => a.id === "scenario-mon");
  const usdAsset = data?.assets.find((a) => a.id === backing);
  return (
    <Shell>
      <PageTitle
        kicker="Build / New pool"
        title="Create a protection market."
        copy="Use the verified scenario assets and fixed demonstration settings."
      />
      {!data ? (
        <Loading error={error} />
      ) : (
        <div className="form-layout">
          <section className="action-panel">
            <h2>New scenario pool</h2>
            <label className="field">
              Protected asset
              <input readOnly value="sMON-demo · synthetic scenario MON" />
            </label>
            <label className="field">
              Backing token
              <select value={backing} onChange={(e) => setBacking(e.target.value)}>
                <option value="test-usd">TestUSDC</option>
                <option value="test-usd-vault">vTestUSDC · test vault shares</option>
              </select>
            </label>
            <dl className="review-list">
              <div>
                <dt>Collateral requirement</dt>
                <dd>150%</dd>
              </div>
              <div>
                <dt>Gain sharing</dt>
                <dd>10% junior + 1% creator + 1% protocol</dd>
              </div>
              <div>
                <dt>Creation bond</dt>
                <dd>1,000 {usdAsset?.symbol}</dd>
              </div>
            </dl>
            <Submit
              label="Approve bond & create pool"
              disabled={!token || !usdAsset || !contract("Factory")}
              onClick={() =>
                w.execute("Create scenario pool", async () => {
                  const bond = 1000n * 10n ** 6n;
                  await w.approve(usdAsset!.address, contract("Factory"), bond);
                  await w.send({
                    address: contract("Factory"),
                    abi: abi("SplitRiskPoolFactory"),
                    functionName: "createPool",
                    args: [
                      token!.address,
                      token!.symbol,
                      usdAsset!.address,
                      usdAsset!.symbol,
                      1000n,
                      100n,
                      15000n,
                      bond,
                    ],
                  });
                  setCreated(true);
                })
              }
            />
            {created && (
              <p className="notice">
                Pool created. The verified market list will refresh shortly. Provide backing before holders can open
                protection.
              </p>
            )}
          </section>
          <aside className="explanation-panel">
            <h2>
              A pool starts
              <br />
              with responsibility.
            </h2>
            <p>
              The creation bond is locked by the factory. Recovery depends on its closure rules; creating a pool is not
              a way to withdraw the bond immediately.
            </p>
            <p>
              New pools require junior liquidity before they can protect assets. Fee settings and asset identities are
              part of the on-chain record.
            </p>
            <Link to="/markets">View markets ↗</Link>
          </aside>
        </div>
      )}
    </Shell>
  );
}
function Legal() {
  return (
    <div className="public-page">
      <Header />
      <main className="legal-page" id="main">
        <p className="eyebrow">Legal / Privacy / Risk</p>
        <h1>
          Clear terms.
          <br />
          Open development.
        </h1>
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
          Pyth and shMonad are external protocols. Their use does not imply endorsement or partnership. Mainnet trading
          links leave YieldShield and use separate services. No stock trading, tokenized equities or real-money payments
          are enabled here.
        </p>
        <h2>Privacy</h2>
        <p>
          The frontend is hosted on Vercel and the read-only API on Railway. Requests necessarily reach those providers
          and the configured Monad RPC. Wallet addresses and on-chain transactions are public; the app uses an address
          to read positions when you connect. It does not receive your wallet’s private keys. No advertising analytics,
          marketing cookies or account database are configured.
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
function App() {
  return (
    <Boundary>
      <BrowserRouter>
        <WalletProvider>
          <a href="#main" className="skip-link">
            Skip to content
          </a>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/markets" element={<Markets />} />
            <Route path="/protect" element={<PositionForm side="senior" />} />
            <Route path="/provide" element={<PositionForm side="junior" />} />
            <Route path="/positions" element={<Positions />} />
            <Route path="/positions/:key" element={<PositionDetail />} />
            <Route path="/trade" element={<Trade />} />
            <Route path="/tokens" element={<Tokens />} />
            <Route path="/lab" element={<Lab />} />
            <Route path="/how-it-works" element={<Lab standalone />} />
            <Route path="/status" element={<Status />} />
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
