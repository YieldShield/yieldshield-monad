import assert from "node:assert/strict";
import { decodeEventLog } from "viem";
import { activityAbi } from "../services/monad/envio.mjs";

export function assertActivityLogMatch(event, log) {
  const { eventName, args } = decodeEventLog({ abi: activityAbi, data: log.data, topics: log.topics, strict: true });
  assert.equal(eventName, event.eventName);
  const actor = args.depositor || args.withdrawer || args.user || args.protector || args.protectorAddress;
  assert.equal(actor.toLowerCase(), event.actor.toLowerCase());
  const amount = args.amount ?? args.assets ?? args.withdrawAmount;
  assert.equal(amount == null ? null : String(amount), event.amount);
  const receiptId = args.receiptTokenId ?? args.tokenId ?? args.oldTokenId;
  assert.equal(receiptId == null ? null : String(receiptId), event.receiptId);
}
