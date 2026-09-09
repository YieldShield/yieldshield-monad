import type { Address } from "viem";
import type { PositionId } from "@yieldshield/core";

/**
 * EVM position identity. Positions are receipt-NFT tokenIds scoped to a pool contract, so the
 * port's opaque `PositionId` encodes all three parts as one URL-safe segment:
 *
 *   `<poolAddress>-<s|p>-<tokenId>`   (s = shield/saver side, p = protector side)
 */
export type PositionSide = "shield" | "protector";

export function encodePositionId(pool: Address, side: PositionSide, tokenId: bigint): PositionId {
  return `${pool}-${side === "shield" ? "s" : "p"}-${tokenId}`;
}

export function decodePositionId(id: PositionId): { pool: Address; side: PositionSide; tokenId: bigint } {
  const m = /^(0x[0-9a-fA-F]{40})-(s|p)-(\d+)$/.exec(id);
  if (!m) throw new Error(`invalid EVM position id: ${id}`);
  return { pool: m[1] as Address, side: m[2] === "s" ? "shield" : "protector", tokenId: BigInt(m[3]!) };
}
