import { formatUnits } from "viem";

// Never round a minimum upward or turn a recoverable token balance into zero.
// formatUnits keeps exact decimal text and removes unnecessary trailing zeros.
export const formatKuruAmount = (value: bigint | undefined, decimals: number) =>
  value === undefined ? "—" : formatUnits(value, decimals);
