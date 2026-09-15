/** Illustrative USD accounting; excludes prior fee realization and token rounding. */
export function scenarioExits(change: number, backingYield: number) {
  const entry = 100;
  const backing = 150;
  const market = entry * (1 + change / 100);
  const gain = Math.max(0, market - entry);
  const fee = gain * 0.12;
  const providerCommission = gain * 0.1;
  const outsideFees = gain * 0.02;
  const assetExit = market - fee;
  const payout = entry;
  const sharePrice = 1 + backingYield / 100;
  const shares = payout / sharePrice;
  // ShieldExit accrues all gain fees before forfeiture, then credits provider commission.
  const junior = backing * sharePrice - payout + assetExit + providerCommission;
  return { entry, backing, market, fee, assetExit, payout, sharePrice, shares, junior, outsideFees };
}
