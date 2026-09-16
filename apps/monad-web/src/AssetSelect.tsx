import { useEffect, useId, useRef, useState } from "react";
import { TokenIcon } from "./AssetImage";
import type { Asset } from "./types";

/** Search preserves the current choice until an option is explicitly selected. */
export function AssetSelect({
  label,
  assets,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  assets: Asset[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const uid = useId(),
    root = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [active, setActive] = useState(0);
  const selected = assets.find((a) => a.id === value);
  const results = assets.filter((a) =>
    `${a.name} ${a.symbol} ${a.address}`.toLowerCase().includes(query.toLowerCase().trim()),
  );
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const choose = (id: string) => {
    onChange(id);
    close();
  };
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div
      className="field asset-selector"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.preventDefault();
          close();
        }
        if (e.key === "Tab") setOpen(false);
      }}
    >
      <span id={`${uid}-label`}>{label}</span>
      <button
        ref={trigger}
        type="button"
        className="market-select-trigger"
        aria-labelledby={`${uid}-label ${uid}-value`}
        aria-expanded={open}
        aria-controls={`${uid}-options`}
        disabled={disabled || !assets.length}
        onClick={() => {
          setQuery("");
          setActive(0);
          setOpen(!open);
        }}
      >
        <span className="market-select-value" id={`${uid}-value`}>
          {selected ? (
            <>
              <TokenIcon asset={selected} />
              <span>
                {selected.symbol}
                <small>{selected.name}</small>
              </span>
            </>
          ) : (
            `Choose ${label.toLowerCase()}`
          )}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="asset-dropdown">
          <input
            ref={search}
            role="combobox"
            aria-label={`Search ${label.toLowerCase()}`}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={`${uid}-options`}
            aria-activedescendant={results[active] ? `${uid}-${results[active].id}` : undefined}
            placeholder="Search name or address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, Math.min(results.length - 1, i + (e.key === "ArrowDown" ? 1 : -1))));
              }
              if (e.key === "Enter" && results[active]) {
                e.preventDefault();
                choose(results[active].id);
              }
            }}
          />
          <div role="listbox" id={`${uid}-options`} aria-label={label} className="asset-options">
            {results.map((a, i) => (
              <div
                role="option"
                aria-selected={value === a.id}
                id={`${uid}-${a.id}`}
                key={a.id}
                className={`market-choice ${active === i ? "active" : ""}`}
                onPointerMove={() => setActive(i)}
                onClick={() => choose(a.id)}
              >
                <TokenIcon asset={a} />
                <span className="market-choice-label">
                  <strong>{a.symbol}</strong>
                  <small>
                    {a.name}
                    {a.kind === "synthetic" ? " · Demo asset" : ""}
                  </small>
                </span>
                {value === a.id && <span aria-hidden="true">✓</span>}
              </div>
            ))}
          </div>
          {!results.length && <p role="status">No matching assets.</p>}
        </div>
      )}
    </div>
  );
}
