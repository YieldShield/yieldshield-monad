import { useId } from "react";
import { cn } from "@/lib/cn";

/** Amount entry keeps the typed value intact; invalid syntax is explained instead of silently changed. */
export function AmountInput({
  value,
  onChange,
  symbol,
  presets = [],
  accent = "ink",
  balanceLabel,
  onMax,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  symbol: string;
  presets?: number[];
  accent?: "ink" | "senior" | "junior" | "indigo";
  balanceLabel?: string;
  onMax?: () => void;
  error?: string | null;
}) {
  const id = useId();
  const junior = accent === "junior" || accent === "indigo";
  const focus = junior
    ? "focus-within:ring-junior"
    : accent === "senior"
      ? "focus-within:ring-senior"
      : "focus-within:ring-ink";
  const presetStyle = junior
    ? "bg-junior-tint text-junior hover:bg-junior-tint-2 focus-visible:outline-junior"
    : accent === "senior"
      ? "bg-senior-tint text-senior-dark hover:bg-senior/20 focus-visible:outline-senior"
      : "bg-subtle-2 text-ink hover:bg-hairline";
  const syntaxError = /^\d*(?:\.\d*)?$/.test(value.trim())
    ? null
    : "Use a decimal point, without commas, signs or other symbols.";
  const message = syntaxError ?? error;
  const description =
    [balanceLabel ? `${id}-balance` : null, message ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-[13px] font-semibold text-body">
        Amount in {symbol}
      </label>
      <div
        className={cn(
          "flex items-baseline gap-2 rounded-card border border-hairline bg-surface px-5 py-6 focus-within:ring-2",
          focus,
        )}
      >
        <input
          id={id}
          name="amount"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!message}
          aria-describedby={description}
          placeholder="0"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "hero-num min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-disabled",
            value.length > 8 ? "text-[28px] sm:text-[36px]" : "text-[44px]",
          )}
        />
        <span className="shrink-0 text-[18px] font-bold text-body">{symbol}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
        {balanceLabel ? (
          <span id={`${id}-balance`} className="min-w-0 break-words text-[13px] text-body tnum">
            {balanceLabel}
          </span>
        ) : (
          <span />
        )}
        {onMax && (
          <button
            type="button"
            onClick={onMax}
            className="ml-auto min-h-11 min-w-11 shrink-0 text-[13px] font-bold text-ink"
          >
            Max
          </button>
        )}
      </div>

      {presets.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onChange(String(p))}
              aria-label={`Set amount to ${p} ${symbol}`}
              aria-pressed={value.trim() !== "" && !syntaxError && Number(value) === p}
              className={cn(
                "h-11 rounded-input text-[14px] font-bold tnum transition-colors",
                presetStyle,
                value.trim() !== "" && !syntaxError && Number(value) === p && "ring-2 ring-inset ring-current",
              )}
            >
              {p.toLocaleString()}
            </button>
          ))}
        </div>
      )}

      {message && (
        <p id={`${id}-error`} role="status" className="mt-3 px-1 text-[13px] font-medium text-amber-deep">
          {message}
        </p>
      )}
    </div>
  );
}
