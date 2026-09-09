import { address, type Address } from "@solana/kit";

/**
 * Program IDs and cluster defaults for the YieldShield protocol.
 *
 * Defaults target the local surfnet used by `e2e/smoke.cjs`. Every value is overridable via
 * {@link resolveConfig} so the app can inject env (`VITE_*`) and Node services can point at
 * another cluster — the SDK never hard-codes a runtime dependency on the parent Anchor repo.
 */

/** split-risk-pool program (localnet deploy). */
export const POOL_PROGRAM_ID: Address = address("AW9jQVRL1Eo2QBB9Aea3iHfyDLWuUtcCNwZ2Rdo9RRXs");

/** composite-oracle program (localnet deploy). */
export const ORACLE_PROGRAM_ID: Address = address("2KUapyvHxDg8gnSFnT9vy43DxZp5th71mkDcukg851Mt");

/** Default local surfnet RPC (matches `e2e/smoke.cjs`). */
export const DEFAULT_RPC_URL = "http://127.0.0.1:8899";

// Protocol-wide constants live in @yieldshield/core (shared by every chain); re-exported for
// SDK consumers: USD prices are 8-decimal, default slippage floor is 0.5%.
export { DEFAULT_SLIPPAGE_BPS, USD_DECIMALS } from "@yieldshield/core";

export type YieldShieldConfig = {
  readonly rpcUrl: string;
  readonly poolProgramId: Address;
  readonly oracleProgramId: Address;
};

export type YieldShieldConfigOverrides = {
  readonly rpcUrl?: string;
  readonly poolProgramId?: Address | string;
  readonly oracleProgramId?: Address | string;
};

/** Resolve a full config from partial overrides, falling back to the localnet defaults. */
export function resolveConfig(overrides: YieldShieldConfigOverrides = {}): YieldShieldConfig {
  return {
    rpcUrl: overrides.rpcUrl ?? DEFAULT_RPC_URL,
    poolProgramId: overrides.poolProgramId ? address(overrides.poolProgramId.toString()) : POOL_PROGRAM_ID,
    oracleProgramId: overrides.oracleProgramId ? address(overrides.oracleProgramId.toString()) : ORACLE_PROGRAM_ID,
  };
}
