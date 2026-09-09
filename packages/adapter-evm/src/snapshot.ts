import { zeroHash, type Hash, type PublicClient } from "viem";

/** Availability must still be current when a complete read finishes. */
export const SNAPSHOT_VALIDITY_SECONDS = 20n;
type SnapshotBlock = { number: bigint; hash: Hash; timestamp: bigint };

function checkedBlock(value: unknown, label: string): SnapshotBlock {
  const block = value as Partial<SnapshotBlock> | null;
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (
    !block ||
    typeof block.number !== "bigint" ||
    block.number <= 0n ||
    typeof block.hash !== "string" ||
    !/^0x[0-9a-fA-F]{64}$/.test(block.hash) ||
    block.hash.toLowerCase() === zeroHash ||
    typeof block.timestamp !== "bigint" ||
    block.timestamp <= 0n ||
    block.timestamp > now ||
    now - block.timestamp >= SNAPSHOT_VALIDITY_SECONDS
  )
    throw new Error(`${label} data is out of date or unconfirmed. Refresh before continuing.`);
  return { number: block.number, hash: block.hash, timestamp: block.timestamp };
}

/** Pin reads to a sealed, fresh block and recheck canonical evidence before returning any result. */
export async function readSnapshot(client: PublicClient, label: string) {
  const block = checkedBlock(await client.getBlock({ blockTag: "latest" }), label);
  return {
    block,
    validUntil: block.timestamp + SNAPSHOT_VALIDITY_SECONDS,
    async finish<T>(result: T): Promise<T> {
      const canonical = checkedBlock(await client.getBlock({ blockNumber: block.number }), label);
      if (
        canonical.number !== block.number ||
        canonical.hash.toLowerCase() !== block.hash.toLowerCase() ||
        canonical.timestamp !== block.timestamp
      )
        throw new Error(`${label} state changed during verification. Refresh before continuing.`);
      // Recheck the original time as well: a long RPC call must not extend this snapshot's lifetime.
      checkedBlock(block, label);
      return result;
    },
  };
}
