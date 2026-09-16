import { useState } from "react";
import catalog from "../../../config/asset-catalog.json";
export function AssetCatalog() {
  const [query, setQuery] = useState("");
  const assets = catalog.assets.filter((a) =>
    `${a.symbol} ${a.name} ${a.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <details className="asset-catalog">
      <summary>More Monad assets</summary>
      <p>Available on mainnet. Not enabled in this testnet app.</p>
      <label className="field">
        Find an asset
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search yield assets"
        />
      </label>
      <div className="catalog-grid">
        {assets.map((a) => (
          <article key={a.id}>
            <img
              src={`/assets/tokens/${a.symbol.toLowerCase()}.svg`}
              width="32"
              height="32"
              alt=""
              loading="lazy"
              onError={(e) => {
                e.currentTarget.onerror = null;
                e.currentTarget.src = "/assets/tokens/unknown.svg";
              }}
            />
            <div>
              <strong>{a.symbol}</strong>
              <small>{a.category} · Mainnet</small>
              <p>{a.description}</p>
              <a href={a.sourceUrl} target="_blank" rel="noreferrer">
                Learn more ↗
              </a>
            </div>
          </article>
        ))}
      </div>
      {!assets.length && <p role="status">No matching assets.</p>}
    </details>
  );
}
