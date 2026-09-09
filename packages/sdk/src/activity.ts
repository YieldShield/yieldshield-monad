/**
 * Transaction-history activity — the real on-chain history of an account's interactions with the
 * split-risk-pool program, derived from `getSignaturesForAddress` + `getTransaction` and classified
 * by the Anchor instruction discriminator (no account reconstruction needed to classify).
 */
import {
  getBase58Encoder,
  type Address,
  type GetSignaturesForAddressApi,
  type GetTransactionApi,
  type Rpc,
  type Signature,
} from "@solana/kit";
import { POOL_PROGRAM_ID } from "./config.js";
import { identifySplitRiskPoolInstruction, SplitRiskPoolInstruction } from "./generated/pool/programs/splitRiskPool.js";
import { getDepositBackingInstructionDataDecoder } from "./generated/pool/instructions/depositBacking.js";
import { getDepositShieldedInstructionDataDecoder } from "./generated/pool/instructions/depositShielded.js";

export type ActivityKind = "deposit" | "backing" | "withdraw" | "activate" | "collect" | "notice";

export type ActivityEntry = {
  signature: string;
  kind: ActivityKind;
  /** Unix seconds (block time), or null if unavailable. */
  timestamp: number | null;
  /** Amount in base units when carried by the instruction (deposits/backings); null otherwise. */
  rawAmount: bigint | null;
  /** The asset mint when known (deposits/backings — account index 4); null otherwise. */
  mint: Address | null;
};

/** RPC capable of the two history reads (a kit RPC client satisfies this). */
export type ActivityRpc = Rpc<GetSignaturesForAddressApi & GetTransactionApi>;

const KIND_OF = new Map<SplitRiskPoolInstruction, ActivityKind>([
  [SplitRiskPoolInstruction.DepositShielded, "deposit"],
  [SplitRiskPoolInstruction.DepositBacking, "backing"],
  [SplitRiskPoolInstruction.WithdrawShielded, "withdraw"],
  [SplitRiskPoolInstruction.PartialWithdrawShielded, "withdraw"],
  [SplitRiskPoolInstruction.WithdrawProtector, "withdraw"],
  [SplitRiskPoolInstruction.PartialWithdrawProtector, "withdraw"],
  [SplitRiskPoolInstruction.ActivateShielded, "activate"],
  [SplitRiskPoolInstruction.ClaimCommission, "collect"],
  [SplitRiskPoolInstruction.ClaimRewards, "collect"],
  [SplitRiskPoolInstruction.StartUnlock, "notice"],
  [SplitRiskPoolInstruction.CancelUnlock, "notice"],
]);

type CompiledMessage = {
  accountKeys: Address[];
  instructions: Array<{ programIdIndex: number; accounts: number[]; data: string }>;
};

/** Fetch + classify an owner's recent split-risk-pool transactions (most recent first). */
export async function getAccountActivity(rpc: ActivityRpc, owner: Address, limit = 25): Promise<ActivityEntry[]> {
  const sigs = await rpc.getSignaturesForAddress(owner, { limit }).send();
  const base58 = getBase58Encoder();
  const entries: ActivityEntry[] = [];

  for (const s of sigs) {
    if (s.err) continue;
    const tx = await rpc
      .getTransaction(s.signature as Signature, { encoding: "json", maxSupportedTransactionVersion: 0 })
      .send();
    if (!tx) continue;
    const message = tx.transaction.message as unknown as CompiledMessage;

    for (const ix of message.instructions) {
      if (message.accountKeys[ix.programIdIndex] !== POOL_PROGRAM_ID) continue;
      const data = base58.encode(ix.data);
      const type = identifySplitRiskPoolInstruction({ data });
      const kind = KIND_OF.get(type);
      if (!kind) break; // governance / non-user instruction — skip this tx

      let rawAmount: bigint | null = null;
      let mint: Address | null = null;
      if (type === SplitRiskPoolInstruction.DepositShielded) {
        rawAmount = getDepositShieldedInstructionDataDecoder().decode(data).amount;
        mint = message.accountKeys[ix.accounts[4]!] ?? null;
      } else if (type === SplitRiskPoolInstruction.DepositBacking) {
        rawAmount = getDepositBackingInstructionDataDecoder().decode(data).amount;
        mint = message.accountKeys[ix.accounts[4]!] ?? null;
      }

      entries.push({
        signature: s.signature,
        kind,
        timestamp: s.blockTime != null ? Number(s.blockTime) : null,
        rawAmount,
        mint,
      });
      break; // one entry per transaction
    }
  }
  return entries;
}
