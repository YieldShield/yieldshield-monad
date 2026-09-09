/**
 * @yieldshield/core — the chain-agnostic middleware contract for YieldShield frontends.
 *
 * Defines the identifiers, view models, and chain-port interfaces (reads + tx intents) that the
 * web app consumes and every chain adapter implements. Pure TypeScript, zero chain dependencies.
 */
export * from "./ids.js";
export * from "./money.js";
export * from "./views.js";
export * from "./port.js";
