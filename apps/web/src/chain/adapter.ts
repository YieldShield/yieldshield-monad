/**
 * The app's single chain seam. Which implementation backs `@chain-impl` is decided at build time
 * in vite.config.ts (`VITE_CHAIN_FAMILY`: "solana" default, or "evm"), so each deployment bundles
 * exactly one adapter. Screens and data hooks import from this folder only — never an adapter
 * package (or @solana/* / wagmi / viem) directly.
 */
import { impl } from "@chain-impl";

/** Chain identity for badges, explorer links, and copy ("Confirmed on X"). */
export const chain = impl.adapter.info;

/** A missing EVM deployment uses the zero address until verified contracts are published. */
export const protocolDeployed = !/^0x0{40}$/i.test(chain.protocolId);

/** The port's read side — data hooks fetch through this. */
export const reader = impl.adapter.reader;
