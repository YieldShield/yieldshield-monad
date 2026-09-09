/**
 * Money correctness: unit/decimal handling, slippage floors, and the reserved-fees rule.
 *
 * Two invariants from the design spec:
 *   - Every deposit/withdraw carries a `minReceived` floor (default 0.5% slippage → 0.995×).
 *   - A saver's withdrawable balance NEVER includes reserved fees (commission / pool fee /
 *     protocol fee / epoch+historical commission reserves). Those belong to protectors/protocol.
 *
 * All on-chain amounts are unsigned integers (bigint). USD prices are 8-decimal (see USD_DECIMALS).
 */
import type { Pool } from "./generated/pool/accounts/index.js";
import type { ShieldPosition } from "./generated/pool/accounts/index.js";

// Pure unit/slippage math lives in @yieldshield/core (shared by every chain); re-exported here so
// SDK consumers keep a single import. Only the account-shaped helpers below are Solana-specific.
export { applyBps, fromBaseUnits, minReceived, toBaseUnits } from "@yieldshield/core";

/**
 * Total reserved (non-saver) fees held by a pool, in shielded-token units. These are owed to
 * protectors (commission), the pool creator (pool fee), and the protocol (protocol fee) — plus
 * epoch/historical commission reserves. Never surface any of this as a saver's withdrawable.
 */
export function reservedFees(
  pool: Pick<
    Pool,
    | "accumulatedCommissions"
    | "accumulatedPoolFee"
    | "accumulatedProtocolFee"
    | "currentEpochCommissionReserve"
    | "historicalCommissionReserve"
  >,
): bigint {
  return (
    pool.accumulatedCommissions +
    pool.accumulatedPoolFee +
    pool.accumulatedProtocolFee +
    pool.currentEpochCommissionReserve +
    pool.historicalCommissionReserve
  );
}

/**
 * A shield (saver) position's withdrawable principal in shielded-token units.
 *
 * On-chain, premium is skimmed in-kind from `amount` when `accrue_fees` crystallizes it, so the
 * stored `amount` is already net of *settled* fees. Premium accrued since the last crystallization
 * is NOT reflected here — call `accrueFees` first to settle it, then re-read. This deliberately
 * does not re-implement the price-driven fee engine client-side (a source of drift); it returns the
 * settled, conservative principal.
 */
export function shieldWithdrawable(position: Pick<ShieldPosition, "amount">): bigint {
  return position.amount;
}
