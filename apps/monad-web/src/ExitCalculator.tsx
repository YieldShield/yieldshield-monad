import { useState } from "react";
import { scenarioExits } from "./scenario-model";

export function ExitCalculator() {
  const [change, setChange] = useState(-20);
  const [backingYield, setBackingYield] = useState(0);
  const { market, fee, assetExit, sharePrice, shares, junior } = scenarioExits(change, backingYield);
  return (
    <>
      <div className="scenario-layout">
        <section className="scenario-controls">
          <div className="control-label">
            <label htmlFor="asset-change">Asset price change</label>
            <strong className={change >= 0 ? "positive" : "negative"}>
              {change > 0 ? "+" : ""}
              {change}%
            </strong>
          </div>
          <input
            id="asset-change"
            type="range"
            min="-80"
            max="80"
            step="1"
            aria-valuetext={`${change > 0 ? "+" : ""}${change}%`}
            value={change}
            onChange={(e) => setChange(Number(e.target.value))}
          />
          <div className="range-labels">
            <span>−80%</span>
            <span>Unchanged</span>
            <span>+80%</span>
          </div>
          <div className="control-label">
            <label htmlFor="backing-yield">Backing vault appreciation</label>
            <strong>+{backingYield}%</strong>
          </div>
          <input
            id="backing-yield"
            type="range"
            min="0"
            max="2"
            step=".1"
            aria-valuetext={`+${backingYield}%`}
            value={backingYield}
            onChange={(e) => setBackingYield(Number(e.target.value))}
          />
          <p>Vault appreciation changes the shares paid, not your entry value.</p>
          <div className="scenario-ledger">
            <div>
              <span>Original asset value</span>
              <b>$100.00</b>
            </div>
            <div>
              <span>Backing at entry</span>
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
          <span className="tag senior">Protected holder</span>
          <h3 className="calculator-exit-title">Choose your exit.</h3>
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
          <span className="tag junior">Backing provider</span>
          <h3>What happens when backing is used?</h3>
          <p>Providers pay the backing exit and receive the surrendered asset.</p>
          <div className="junior-outcome">
            <span>Illustrative residual value</span>
            <strong>${junior.toFixed(2)}</strong>
          </div>
          <small>
            Remaining backing + surrendered asset + provider fees. Excludes creator/protocol fees. Earlier fees, token
            rounding, delays and sale costs are omitted.
          </small>
        </section>
      </div>
      <div className="notice">
        This calculator is an illustration, not an on-chain quote. Fees already realized earlier are not refunded after
        a later loss. Actual positions keep a fixed cap in backing-token units.
      </div>
    </>
  );
}
