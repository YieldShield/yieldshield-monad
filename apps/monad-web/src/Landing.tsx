import { Link } from "react-router-dom";
import { TokenIcon } from "./AssetImage";
import { assetVisual } from "./asset-visuals";
import { ExitExplainer } from "./ExitExplainer";
import { landingMarkets } from "./landing-markets";
import { useNativeBalance, useWallet } from "./wallet";
import type { Snapshot } from "./types";
import "./landing.css";

export function Landing({ data, error }: { data?: Snapshot; error?: Error }) {
  const { account } = useWallet();
  const native = useNativeBalance();
  const needsGas = !!account && !native.error && native.data === 0n;
  const markets = landingMarkets(data);
  return (
    <>
      <section className="clarity-hero">
        <div className="clarity-hero-copy">
          <h1>
            Keep your
            <br />
            upside.
            <br />
            <em>Choose your exit.</em>
          </h1>
          <p>Keep your asset, or exchange it for capped backing.</p>
          <div className="hero-actions">
            <Link className="button purple-button" to={needsGas ? "/faucet#monad-gas" : "/protect"}>
              {needsGas ? "Get testnet MON" : "Protect tokens"} <span aria-hidden="true">↗</span>
            </Link>
            <Link className="text-link" to="/how-it-works">
              How it works <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
        <ExitExplainer />
      </section>
      <section className="landing-assets" aria-labelledby="landing-assets-title">
        <div className="landing-section-heading">
          <h2 id="landing-assets-title">Start with an asset.</h2>
          <span>Monad testnet</span>
        </div>
        {markets.length ? (
          <div className="landing-asset-grid">
            {markets.map((market) => (
              <Link
                className="landing-asset"
                key={market.shield.address.toLowerCase()}
                to={`/protect?${new URLSearchParams({ market: market.id })}`}
              >
                <TokenIcon asset={market.shield} />
                <span>
                  <strong>{assetVisual(market.shield).name}</strong>
                  <small>
                    {!market.actions.protect
                      ? `${market.symbol} · Unavailable`
                      : market.environment === "scenario"
                        ? "Synthetic demo"
                        : market.symbol}
                  </small>
                </span>
                <span className="landing-arrow" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="landing-asset-status" role="status">
            <p>{error || data ? "Asset list unavailable." : "Loading assets…"}</p>
            <Link to={error || data ? "/status" : "/markets"}>
              {error || data ? "Check network status ↗" : "Compare pools ↗"}
            </Link>
          </div>
        )}
      </section>
      <div className="built-with" aria-label="Product integrations">
        <span>Built with</span>
        <a href="https://www.dynamic.xyz/" target="_blank" rel="noreferrer">
          Dynamic
        </a>
        <Link to="/faucet#stake-mon">shMonad</Link>
        <Link to="/status">RedStone</Link>
        <span>on Monad</span>
      </div>
    </>
  );
}
