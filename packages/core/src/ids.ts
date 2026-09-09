/**
 * Chain-neutral identifiers. Plain strings in each chain's native encoding — base58 on Solana,
 * 0x-hex on EVM. The UI treats them as opaque: it routes, compares and displays them, never
 * parses them. Adapters convert to/from chain-native types at their boundary.
 */

/** A wallet address. */
export type AccountId = string;

/** A fungible asset: SPL mint on Solana, ERC-20 contract on EVM. */
export type TokenId = string;

/** A pool: pool account on Solana, pool contract on EVM. */
export type PoolId = string;

/**
 * A position. Solana: the position NFT's mint address. EVM: a pool-scoped receipt-NFT id
 * (adapter-defined encoding). Routable — must be a single URL-safe segment.
 */
export type PositionId = string;

/** A transaction: signature on Solana, tx hash on EVM. */
export type TxId = string;
