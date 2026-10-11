import { formatUnits } from "viem";
import type { Asset } from "./types";

export function depositLimitError(
  value: bigint,
  side: "senior" | "junior",
  config: readonly string[] | undefined,
  token: Pick<Asset, "decimals" | "symbol">,
) {
  const offset = side === "senior" ? 0 : 2;
  const minimum = config?.[offset];
  const maximum = config?.[offset + 1];
  if (minimum == null || maximum == null || !/^\d+$/.test(minimum) || !/^\d+$/.test(maximum))
    return "Pool deposit limits unavailable. Refresh before continuing.";
  const min = BigInt(minimum),
    max = BigInt(maximum);
  if (min > max) return "Pool deposit limits unavailable. Refresh before continuing.";
  if (value < min) return `Minimum deposit: ${formatUnits(min, token.decimals)} ${token.symbol}.`;
  if (value > max) return `Maximum deposit: ${formatUnits(max, token.decimals)} ${token.symbol}.`;
  return "";
}
