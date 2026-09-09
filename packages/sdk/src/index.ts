/**
 * @yieldshield/sdk — framework-agnostic, headless on-chain SDK for the YieldShield split-risk pool.
 *
 * The SDK is the ONLY layer that talks to chain. It returns unsigned instructions/transactions;
 * signing happens at the boundary (a wallet in the app, a keypair in Node services). It exposes
 * raw + derived read models; UI layers map those to user-facing language.
 *
 * Public surface is assembled module-by-module as the SDK is built (see the milestone plan).
 */
export * from "./config.js";

// Generated, kit-native program clients (Codama). Vendored + committed; regenerate with
// `npm run codegen`. Namespaced to avoid symbol collisions between the two programs.
export * as poolClient from "./generated/pool/index.js";
export * as oracleClient from "./generated/oracle/index.js";

// Hand-written SDK surface.
export * from "./pdas.js";
export * from "./accounts.js";
export * from "./oracle.js";
export * from "./money.js";
export * from "./discovery.js";
export * from "./activity.js";
export * from "./readModels.js";
export * from "./actions/index.js";
