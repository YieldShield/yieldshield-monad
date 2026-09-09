import {
  toBaseUnits,
  type CreatePoolIntentParams,
  type PoolCreationOptions,
  type TokenId,
} from "@yieldshield/core";

export type PoolCreationForm = {
  collateralPct: string;
  commissionPct: string;
  poolFeePct: string;
  bond: string;
};

type CreationReview = { params: CreatePoolIntentParams; error: null } | { params: null; error: string };

/** Keep the signed amounts exact: percentages have basis-point precision, never rounded floats. */
export function reviewPoolCreation(
  form: PoolCreationForm,
  protectedToken: TokenId | null,
  backingToken: TokenId | null,
  options: PoolCreationOptions | undefined,
  now: number,
): CreationReview {
  const fail = (error: string): CreationReview => ({ params: null, error });
  if (!options || now < options.evaluatedAt || now >= options.validUntil)
    return fail("Refresh the pool creation settings before continuing.");
  if (options.activePools >= options.maxActivePools)
    return fail("The factory has reached its active-pool limit.");
  const asset = options.protectedAssets.find((token) => token.token === protectedToken);
  const backing = options.backingAssets.find((token) => token.token === backingToken);
  if (!asset || !backing || protectedToken === backingToken)
    return fail("Choose a supported asset and backing pair.");

  const values: Record<string, number> = {};
  const floor = Math.max(options.bounds.collateralMinBp, Number(backing.minCollateralRatioBp));
  for (const [key, label, min, max] of [
    ["collateralPct", "Collateral ratio", floor, options.bounds.collateralMaxBp],
    ["commissionPct", "Junior gain share", options.bounds.commissionMinBp, options.bounds.commissionMaxBp],
    ["poolFeePct", "Creator fee", options.bounds.poolFeeMinBp, options.bounds.poolFeeMaxBp],
  ] as const) {
    let amount: bigint;
    try {
      if (form[key].length > 30) throw new Error("amount too long");
      amount = toBaseUnits(form[key], 2);
    } catch {
      return fail(`${label} needs a number with at most two decimal places.`);
    }
    if (amount < BigInt(min) || amount > BigInt(max))
      return fail(`${label} must be between ${min / 100}% and ${max / 100}%.`);
    values[key] = Number(amount);
  }
  if (values.commissionPct! + values.poolFeePct! + options.fixed.protocolFeeBp >= 10_000)
    return fail("Total fees must leave a positive share of gains for Senior holders.");

  let bond: bigint;
  try {
    if (form.bond.length > 80) throw new Error("amount too long");
    bond = toBaseUnits(form.bond, backing.decimals);
    if (bond > (1n << 256n) - 1n) throw new Error("amount too large");
  } catch {
    return fail(`Enter a valid creation bond with at most ${backing.decimals} decimal places.`);
  }
  if (bond < backing.minimumBondAmount)
    return fail("The creation bond is below the current required minimum.");

  return {
    error: null,
    params: {
      shieldedToken: asset.token,
      backingToken: backing.token,
      collateralRatioBp: values.collateralPct!,
      commissionRateBp: values.commissionPct!,
      poolFeeBp: values.poolFeePct!,
      ...options.fixed,
      creationBondAmount: bond,
    },
  };
}
