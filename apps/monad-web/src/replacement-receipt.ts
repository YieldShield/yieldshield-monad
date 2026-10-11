import { parseAbi, parseEventLogs, type Address, type TransactionReceipt } from "viem";

const partialWithdrawalAbi = parseAbi([
  "event PartialWithdrawal(address indexed user,uint256 indexed oldTokenId,uint256 indexed newTokenId,uint256 withdrawAmount,uint256 remainingAmount)",
]);

// A confirmed pool event identifies the replacement; a guessed next NFT ID does not.
export function replacementReceiptId(
  receipt: Pick<TransactionReceipt, "status" | "logs" | "transactionHash">,
  expected: { pool: Address; owner: Address; oldTokenId: bigint; withdrawAmount: bigint },
) {
  if (receipt.status !== "success") return null;
  const events = parseEventLogs({
    abi: partialWithdrawalAbi,
    logs: receipt.logs,
    eventName: "PartialWithdrawal",
    strict: true,
  }).filter((event) => !event.removed && event.address.toLowerCase() === expected.pool.toLowerCase());
  if (events.length !== 1) return null;
  const event = events[0];
  if (
    event.transactionHash !== receipt.transactionHash ||
    event.args.user.toLowerCase() !== expected.owner.toLowerCase() ||
    event.args.oldTokenId !== expected.oldTokenId ||
    event.args.withdrawAmount !== expected.withdrawAmount ||
    event.args.newTokenId === expected.oldTokenId ||
    event.args.remainingAmount <= 0n
  )
    return null;
  return event.args.newTokenId;
}
