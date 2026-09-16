import { Link } from "react-router-dom";
import { ExitCalculator } from "./ExitCalculator";
import "./how-it-works.css";

export function HowItWorks() {
  return (
    <div className="how-it-works">
      <header className="how-intro">
        <div>
          <p className="eyebrow">How it works</p>
          <h1>
            Your asset.
            <br />
            <em>Two ways to exit.</em>
          </h1>
        </div>
        <p className="how-lead">
          Deposit an asset into a backed position. When you leave, take the remaining asset or exchange it for an
          eligible backing payout. A separate participant supplies the backing and takes the first losses.
        </p>
      </header>

      <nav className="how-sections" aria-label="On this page">
        <a href="#overview">
          Watch the overview <span aria-hidden="true">↗</span>
        </a>
        <a href="#roles">
          Understand the roles <span aria-hidden="true">↗</span>
        </a>
        <a href="#calculator">
          Try the numbers <span aria-hidden="true">↗</span>
        </a>
        <a href="#before-you-start">
          Before you start <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section id="overview" className="how-video-section" aria-labelledby="overview-title">
        <div className="how-section-copy">
          <p className="eyebrow">01 / Watch</p>
          <h2 id="overview-title">See the full picture.</h2>
          <p>A two-minute guide to the testnet app, with examples of both exits and the provider’s role.</p>
          <a className="text-link" href="/media/how-it-works-20260916.txt">
            Read the transcript ↗
          </a>
        </div>
        <figure className="how-video">
          <video
            controls
            playsInline
            preload="metadata"
            poster="/media/how-it-works-20260916.jpg"
            aria-label="YieldShield on Monad product overview"
            aria-describedby="overview-caption"
          >
            <source src="/media/how-it-works-20260916.mp4" type="video/mp4" />
            <track default kind="captions" src="/media/how-it-works-20260916.vtt" srcLang="en" label="English" />
            <a href="/media/how-it-works-20260916.mp4">Watch the product overview</a>
          </video>
          <figcaption id="overview-caption">
            <span>2:08 · 1080p · English captions</span>
            <a href="/media/how-it-works-20260916.mp4">Open video ↗</a>
          </figcaption>
          <p className="how-video-note">
            Recorded September 2026 with the current testnet app. Examples are illustrative; wallet signing is not
            shown.
          </p>
        </figure>
      </section>

      <section id="roles" className="how-section" aria-labelledby="roles-title">
        <div className="how-section-heading">
          <p className="eyebrow">02 / Understand</p>
          <h2 id="roles-title">Two roles. One pool.</h2>
          <p>One participant deposits the asset. Another supplies the capital behind its backing exit.</p>
        </div>
        <div className="how-roles">
          <article className="how-role how-holder">
            <span className="tag senior">Protected holder</span>
            <h3>Keep the choice.</h3>
            <p>
              Deposit an eligible token into a pool with available backing. Your position records the asset and its
              backing cap.
            </p>
            <dl>
              <div>
                <dt>Take the asset</dt>
                <dd>Withdraw your remaining deposited tokens, after applicable gain-sharing fees.</dd>
              </div>
              <div>
                <dt>Use the backing exit</dt>
                <dd>
                  Surrender the position for its eligible backing payout once the waiting period and other conditions
                  are met.
                </dd>
              </div>
            </dl>
            <Link className="text-link" to="/protect">
              Explore protection ↗
            </Link>
          </article>
          <article className="how-role how-provider">
            <span className="tag junior">Backing provider</span>
            <h3>Supply the backing.</h3>
            <p>Deposit backing tokens to support protected positions. This is the pool’s first-loss capital.</p>
            <dl>
              <div>
                <dt>Share in realized gains</dt>
                <dd>Earn the provider’s share of gain-sharing fees when the pool realizes eligible asset gains.</dd>
              </div>
              <div>
                <dt>Take the downside</dt>
                <dd>
                  When backing is used, the pool pays the holder and receives the surrendered asset. Losses can reduce
                  your capital.
                </dd>
              </div>
            </dl>
            <Link className="text-link" to="/provide">
              Explore providing ↗
            </Link>
          </article>
        </div>

        <div className="how-journey">
          <h3>From deposit to exit.</h3>
          <ol>
            <li>
              <span className="how-step" aria-hidden="true">
                1
              </span>
              <h4>Choose a pool</h4>
              <p>Review its asset, backing token, fees, available capacity and waiting periods.</p>
            </li>
            <li>
              <span className="how-step" aria-hidden="true">
                2
              </span>
              <h4>Review and deposit</h4>
              <p>
                Connect your wallet, review any token approval, then confirm the deposit. Find your position under
                Positions.
              </p>
            </li>
            <li>
              <span className="how-step" aria-hidden="true">
                3
              </span>
              <h4>Choose how to leave</h4>
              <p>
                Compare the available exits for your position. The app shows its current payout and when an action is
                available.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section id="calculator" className="how-section" aria-labelledby="calculator-title">
        <div className="how-section-heading">
          <p className="eyebrow">03 / Try it</p>
          <h2 id="calculator-title">What if the price changes?</h2>
          <p>
            Start with a $100 asset and $150 of backing. Move the sliders to compare the holder’s exits and the
            provider’s outcome.
          </p>
        </div>
        <ExitCalculator />
        <p className="how-calculator-note">
          This example assumes 12% of realized asset gains goes to fees: 10% to providers and 2% to the creator and
          protocol. Check the selected pool for its actual terms.
        </p>
      </section>

      <section id="before-you-start" className="how-section how-terms" aria-labelledby="terms-title">
        <div className="how-section-copy">
          <p className="eyebrow">04 / Know the terms</p>
          <h2 id="terms-title">Before you start.</h2>
          <p>Your position’s terms determine the payout and when you can leave.</p>
        </div>
        <div className="how-questions">
          <details open>
            <summary>What does the backing cap mean?</summary>
            <p>
              Each protected position has a maximum payout in backing-token units. The amount payable also depends on
              the pool’s valuation rules and position state. A cap is not a guaranteed cash value: backing tokens can
              change in value, and vault shares can have their own redemption conditions.
            </p>
          </details>
          <details>
            <summary>When can I withdraw?</summary>
            <p>
              A holder’s backing exit has a waiting period. Providers must give withdrawal notice and use the withdrawal
              window; capital supporting active protection may remain committed. Check Positions for the timing and
              amount available to your position. Staked assets and vault shares can have additional redemption steps.
            </p>
          </details>
          <details>
            <summary>How do fees affect my position?</summary>
            <p>
              Gain-sharing fees apply when eligible gains are realized and can reduce the tokens remaining in a
              protected position. Fees already realized are not refunded if the asset later falls. Review the pool’s fee
              split before depositing; wallet transactions also require network gas.
            </p>
          </details>
          <details>
            <summary>What risks remain?</summary>
            <p>
              Backing does not remove smart-contract, pricing, token or liquidity risk. Providers take first losses and
              can lose their committed capital; fee income is not guaranteed. An action may be unavailable when pricing,
              capacity or timing requirements are not met.
            </p>
          </details>
          <details>
            <summary>Am I using real money here?</summary>
            <p>
              This app runs on Monad testnet with valueless test assets. TestUSDC is a demo token, not Circle USDC.
              Scenario pools use simulated prices; reference pools use an external MON price. Get test tokens from the{" "}
              <Link to="/faucet">Faucet</Link> and check <Link to="/status">Network status</Link> for availability.
            </p>
          </details>
        </div>
      </section>

      <section className="how-start" aria-labelledby="start-title">
        <div>
          <p className="eyebrow">Try it on testnet</p>
          <h2 id="start-title">Start with test tokens.</h2>
          <p>Get set up, choose a pool and see how a position works.</p>
        </div>
        <div className="how-start-actions">
          <Link className="button purple-button" to="/faucet">
            Get test tokens ↗
          </Link>
          <Link className="text-link" to="/markets">
            Compare pools ↗
          </Link>
        </div>
      </section>
    </div>
  );
}
