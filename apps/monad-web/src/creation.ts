import { formatUnits, parseUnits } from "viem";
import type { Asset, CreationOption, Registry } from "./types";
export function creationVersion(options: CreationOption[], asset: string, backing: string) {
  return options.find((v) => v.protectedAssets.includes(asset) && v.backingAssets.includes(backing));
}
export function creationFingerprint(v: CreationOption, asset: string, backing: string, terms?: CreationTerms) {
  const quote = v.backing.find((b) => b.id === backing);
  if (!v.available || !quote?.available || quote.bond == null || BigInt(quote.bond) < 0n)
    throw new Error(v.reason || quote?.reason || "Choose a supported pair.");
  return JSON.stringify([
    v.id,
    v.factory.toLowerCase(),
    asset,
    backing,
    quote.bond,
    v.minimumUsd,
    v.collateralBps,
    v.juniorFeeBps,
    v.creatorFeeBps,
    v.protocolFeeBps,
    v.minimumPoolTime,
    v.unlockDuration,
    quote.minCollateralBps,
    v.limits,
    terms && Object.values(terms).map(String),
  ]);
}
export function assertCreationIdentity(v: CreationOption, registry: Registry, protectedId: string, backingId: string) {
  const pinned = registry.factories.find((p) => p.id === v.id);
  if (
    !pinned ||
    registry.contracts[pinned.contract]?.address.toLowerCase() !== v.factory.toLowerCase() ||
    !pinned.protectedAssets.includes(protectedId) ||
    !pinned.backingAssets.includes(backingId)
  )
    throw new Error("Unverified pool configuration.");
}

export type CreationInputs = { collateral: string; junior: string; creator: string; bond: string };
export type CreationTerms = { collateralBps: bigint; juniorFeeBps: bigint; creatorFeeBps: bigint; bond: bigint };
export type CreationErrors = Partial<Record<keyof CreationInputs, string>>;

export function creationInputs(
  v: CreationOption | undefined,
  backingId: string,
  decimals: number,
  draft: Partial<CreationInputs>,
): CreationInputs {
  const quote = v?.backing.find((b) => b.id === backingId);
  const minimum = BigInt(quote?.minCollateralBps || "10000");
  const suggested = BigInt(v?.collateralBps || "15000");
  return {
    collateral: draft.collateral ?? formatUnits(minimum > suggested ? minimum : suggested, 2),
    junior: draft.junior ?? formatUnits(BigInt(v?.juniorFeeBps || "1000"), 2),
    creator: draft.creator ?? formatUnits(BigInt(v?.creatorFeeBps || "100"), 2),
    bond: draft.bond ?? (quote?.bond == null ? "" : formatUnits(BigInt(quote.bond), decimals)),
  };
}

function decimalInput(value: string, decimals: number) {
  if (!/^\d+(\.\d*)?$/.test(value) || (value.split(".")[1]?.length || 0) > decimals)
    throw new Error(`Enter a number with up to ${decimals} decimal places.`);
  return parseUnits(value, decimals);
}

export function validateCreationTerms(
  v: CreationOption | undefined,
  backingId: string,
  decimals: number,
  input: CreationInputs,
): { terms?: CreationTerms; errors: CreationErrors } {
  const errors: CreationErrors = {};
  const quote = v?.backing.find((b) => b.id === backingId);
  if (!v?.available || !v.limits || !quote?.available || quote.bond == null || quote.minCollateralBps == null)
    return { errors: { collateral: "Verified creation limits are unavailable. Refresh to try again." } };
  const limits = v.limits;
  const values: Partial<Record<keyof CreationInputs, bigint>> = {};
  const minCollateral =
    BigInt(quote.minCollateralBps) > BigInt(limits.minCollateralBps) ? quote.minCollateralBps : limits.minCollateralBps;
  for (const [field, min, max] of [
    ["collateral", minCollateral, limits.maxCollateralBps],
    ["junior", limits.minJuniorFeeBps, limits.maxJuniorFeeBps],
    ["creator", limits.minCreatorFeeBps, limits.maxCreatorFeeBps],
  ] as const) {
    try {
      const bps = decimalInput(input[field], 2);
      if (bps < BigInt(min) || bps > BigInt(max))
        throw new Error(`Choose ${formatUnits(BigInt(min), 2)}% to ${formatUnits(BigInt(max), 2)}%.`);
      values[field] = bps;
    } catch (e) {
      errors[field] = (e as Error).message;
    }
  }
  try {
    values.bond = decimalInput(input.bond, decimals);
    if (values.bond < BigInt(quote.bond))
      throw new Error(`The minimum bond is ${formatUnits(BigInt(quote.bond), decimals)} backing tokens.`);
    if (values.bond > 2n ** 256n - 1n) throw new Error("Bond amount is too large.");
  } catch (e) {
    errors.bond = (e as Error).message;
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors,
    terms: {
      collateralBps: values.collateral!,
      juniorFeeBps: values.junior!,
      creatorFeeBps: values.creator!,
      bond: values.bond!,
    },
  };
}

export function createPoolArgs(
  token: Pick<Asset, "address" | "symbol">,
  backing: Pick<Asset, "address" | "symbol">,
  terms: CreationTerms,
) {
  return [
    token.address,
    token.symbol,
    backing.address,
    backing.symbol,
    terms.juniorFeeBps,
    terms.creatorFeeBps,
    terms.collateralBps,
    terms.bond,
  ] as const;
}
