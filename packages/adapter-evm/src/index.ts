/**
 * @yieldshield/adapter-evm — EVM implementation of the @yieldshield/core chain port.
 *
 * Framework-free half: `createEvmAdapter` (info + reader + publicClient), `planIntent`, chain
 * defs and deployment addresses. React half: `EvmChainProvider` + `useWalletAddress` /
 * `useWalletConnection` / `useIntentSender` (wagmi).
 */
export * from "./adapter.js";
export * from "./chains.js";
export * from "./deployments.js";
export * from "./errors.js";
export { planIntent, type EvmIntentDeps, type EvmStep, type IntentPlan } from "./intents.js";
export { decodePositionId, encodePositionId, type PositionSide } from "./positionId.js";
export * from "./react.js";
export { readFaucetStatus, type EvmFaucetStatus } from "./faucet.js";

export * from "./demo-trading.js";
export * from "./demo-deployments.js";
