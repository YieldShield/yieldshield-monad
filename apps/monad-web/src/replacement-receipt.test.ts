import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, parseAbi, type TransactionReceipt } from "viem";
import { replacementReceiptId } from "./replacement-receipt";

const pool = "0x1111111111111111111111111111111111111111";
const owner = "0x2222222222222222222222222222222222222222";
const other = "0x3333333333333333333333333333333333333333";
const transactionHash = `0x${"ab".repeat(32)}` as const;
const expected = { pool, owner, oldTokenId: 3n, withdrawAmount: 500000000000000000n } as const;
const eventAbi = parseAbi([
  "event PartialWithdrawal(address indexed user,uint256 indexed oldTokenId,uint256 indexed newTokenId,uint256 withdrawAmount,uint256 remainingAmount)",
]);
type Log = TransactionReceipt["logs"][number];
function log(overrides: Partial<Log> = {}): Log {
  return {
    address: pool,
    transactionHash,
    removed: false,
    blockHash: `0x${"cd".repeat(32)}`,
    blockNumber: 123n,
    logIndex: 1,
    transactionIndex: 0,
    topics: encodeEventTopics({
      abi: eventAbi,
      eventName: "PartialWithdrawal",
      args: { user: owner, oldTokenId: 3n, newTokenId: 4n },
    }) as Log["topics"],
    data: encodeAbiParameters(
      [{ type: "uint256" }, { type: "uint256" }],
      [expected.withdrawAmount, 500000000000000000n],
    ),
    ...overrides,
  };
}
const receipt = (logs: Log[]) => ({ status: "success" as const, transactionHash, logs });

describe("replacement position navigation", () => {
  it("uses the confirmed replacement ID for the exact old receipt and withdrawal", () => {
    expect(replacementReceiptId(receipt([log()]), expected)).toBe(4n);
  });
  it("ignores events from another pool and refuses an unrelated owner, receipt or amount", () => {
    expect(replacementReceiptId(receipt([log({ address: other })]), expected)).toBeNull();
    for (const mismatch of [{ owner: other }, { oldTokenId: 2n }, { withdrawAmount: 1n }] as const)
      expect(replacementReceiptId(receipt([log()]), { ...expected, ...mismatch })).toBeNull();
  });
  it("does not invent a remaining position from failed, removed, malformed, duplicate or foreign receipts", () => {
    expect(replacementReceiptId({ ...receipt([log()]), status: "reverted" }, expected)).toBeNull();
    for (const logs of [
      [],
      [log({ removed: true })],
      [log({ data: "0x" })],
      [log(), log()],
      [log({ transactionHash: `0x${"ef".repeat(32)}` })],
    ])
      expect(replacementReceiptId(receipt(logs), expected)).toBeNull();
  });
  it("requires a different receipt and a positive remaining position", () => {
    const reused = encodeEventTopics({
      abi: eventAbi,
      eventName: "PartialWithdrawal",
      args: { user: owner, oldTokenId: 3n, newTokenId: 3n },
    }) as Log["topics"];
    expect(replacementReceiptId(receipt([log({ topics: reused })]), expected)).toBeNull();
    const empty = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [expected.withdrawAmount, 0n]);
    expect(replacementReceiptId(receipt([log({ data: empty })]), expected)).toBeNull();
  });
});
