/**
 * @yieldshield/adapter-solana — Solana implementation of the @yieldshield/core chain port.
 *
 * Framework-free half: `createSolanaAdapter` (info + reader + client/rpc) and `buildIntent`.
 * React half: `SolanaChainProvider` + `useWalletAddress` / `useWalletConnection` / `useIntentSender`.
 */
export * from "./adapter.js";
export * from "./errors.js";
export { buildIntent, type BuiltIntent } from "./intents.js";
export { makeRpc, type SolanaRpc } from "./rpc.js";
export * from "./react.js";
