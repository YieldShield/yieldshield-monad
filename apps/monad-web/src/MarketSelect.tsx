import { useId, useRef } from "react";
import { AssetPair } from "./AssetImage";
import { assetVisual } from "./asset-visuals";
import { marketTerms, percent, short } from "./lib";
import type { Market, Snapshot } from "./types";

function PairLabel({ market }: { market: Market }) {
  return (
    <>
      <AssetPair asset={market.shield} backing={market.backing} />
      <span className="market-choice-label">
        <strong>
          {market.symbol} <span>/ {market.backingSymbol}</span>
        </strong>
        <small>
          {assetVisual(market.shield).name} · {assetVisual(market.backing).name}
        </small>
        <small>
          {percent(market.collateralBps)} collateral · {percent(marketTerms(market)?.totalFeeBps)} gains shared ·{" "}
          {short(market.address)}
        </small>
      </span>
    </>
  );
}

export function MarketSelect({ data, id, setId }: { data: Snapshot; id: string; setId: (id: string) => void }) {
  const uid = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = data.markets.find((market) => market.id === id);

  return (
    <div className="field market-selector">
      <span id={`${uid}-label`}>Asset / backing</span>
      <button
        ref={trigger}
        className="market-select-trigger"
        type="button"
        aria-labelledby={`${uid}-label ${uid}-selected`}
        aria-haspopup="dialog"
        aria-controls={`${uid}-dialog`}
        disabled={!data.markets.length}
        onClick={() => {
          dialog.current?.showModal();
          dialog.current?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
        }}
      >
        <span id={`${uid}-selected`} className="market-select-value">
          {selected ? <PairLabel market={selected} /> : "Choose a pool"}
        </span>
        <span className="market-select-change" aria-hidden="true">
          Change <span>⌄</span>
        </span>
      </button>
      <dialog
        ref={dialog}
        id={`${uid}-dialog`}
        className="market-picker"
        aria-labelledby={`${uid}-title`}
        aria-describedby={`${uid}-note`}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <div className="market-picker-content">
          <div className="market-picker-heading">
            <div>
              <h2 id={`${uid}-title`}>Choose a pool</h2>
              <p id={`${uid}-note`}>Monad testnet · Test tokens only</p>
            </div>
            <button
              type="button"
              className="market-picker-close"
              aria-label="Close pool selector"
              onClick={() => dialog.current?.close()}
            >
              ×
            </button>
          </div>
          {(["reference", "scenario"] as const).map((environment) => {
            const markets = data.markets.filter((market) => market.environment === environment);
            return markets.length ? (
              <section className="market-picker-group" key={environment} aria-labelledby={`${uid}-${environment}`}>
                <h3 id={`${uid}-${environment}`}>{environment === "reference" ? "Monad assets" : "Demo assets"}</h3>
                {markets.map((market) => (
                  <button
                    type="button"
                    key={market.id}
                    className="market-choice"
                    aria-current={market.id === id ? "true" : undefined}
                    onClick={() => {
                      dialog.current?.close();
                      setId(market.id);
                    }}
                  >
                    <PairLabel market={market} />
                    <span className="market-choice-state">
                      {!market.ready && <small>Unavailable</small>}
                      {market.id === id && <span aria-hidden="true">✓</span>}
                    </span>
                  </button>
                ))}
              </section>
            ) : null;
          })}
        </div>
      </dialog>
    </div>
  );
}
