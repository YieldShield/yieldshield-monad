import { useId } from "react";
import { formatUnits } from "viem";
import type { CreationOption } from "./types";
import type { CreationInputs, CreationErrors } from "./creation";
import { usd } from "./lib";
import "./pool-terms.css";

export function PoolTermsFields({
  version,
  backingId,
  symbol,
  decimals,
  input,
  errors,
  disabled,
  onChange,
}: {
  version: CreationOption;
  backingId: string;
  symbol: string;
  decimals: number;
  input: CreationInputs;
  errors: CreationErrors;
  disabled: boolean;
  onChange: (field: keyof CreationInputs, value: string) => void;
}) {
  const uid = useId();
  const quote = version.backing.find((b) => b.id === backingId);
  const percent = (bps: string | undefined) => (bps == null ? "—" : formatUnits(BigInt(bps), 2));
  const fields = [
    {
      name: "collateral",
      label: "Collateral",
      unit: "%",
      hint: `Backing reserved relative to entry value. ${percent(quote?.minCollateralBps)}–${percent(version.limits?.maxCollateralBps)}% for this token.`,
    },
    {
      name: "junior",
      label: "Provider share",
      unit: "%",
      hint: `Share of realized gains paid to backing providers. ${percent(version.limits?.minJuniorFeeBps)}–${percent(version.limits?.maxJuniorFeeBps)}%.`,
    },
    {
      name: "creator",
      label: "Creator share",
      unit: "%",
      hint: `Your share of realized gains. ${percent(version.limits?.minCreatorFeeBps)}–${percent(version.limits?.maxCreatorFeeBps)}%.`,
    },
    {
      name: "bond",
      label: "Creation bond",
      unit: symbol,
      hint: `Minimum ${quote?.bond == null ? "unavailable" : formatUnits(BigInt(quote.bond), decimals)} ${symbol} (${usd(version.minimumUsd)} required value). You can provide more.`,
    },
  ] as const;
  return (
    <fieldset className="pool-terms" disabled={disabled}>
      <legend>Set your pool terms</legend>
      <p className="field-hint">Choose the backing requirement and how gains are shared.</p>
      <div className="pool-terms-grid">
        {fields.map((field) => (
          <label className="field" key={field.name} htmlFor={`${uid}-${field.name}`}>
            {field.label}
            <span className="amount-field">
              <input
                id={`${uid}-${field.name}`}
                name={field.name}
                inputMode="decimal"
                autoComplete="off"
                value={input[field.name]}
                onChange={(e) => onChange(field.name, e.target.value)}
                aria-invalid={!!errors[field.name]}
                aria-describedby={`${uid}-${field.name}-hint${errors[field.name] ? ` ${uid}-${field.name}-error` : ""}`}
              />
              <b aria-hidden="true">{field.unit}</b>
            </span>
            <span className="field-hint" id={`${uid}-${field.name}-hint`}>
              {field.hint}
            </span>
            {errors[field.name] && (
              <span className="pool-term-error" id={`${uid}-${field.name}-error`} role="status">
                {errors[field.name]}
              </span>
            )}
          </label>
        ))}
      </div>
      <p className="pool-protocol-note">
        The {percent(version.protocolFeeBps)}% protocol share and minimum bond are set by protocol governance. Your bond
        stays locked until the pool qualifies for closure.
      </p>
    </fieldset>
  );
}
