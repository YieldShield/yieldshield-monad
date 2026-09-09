/**
 * Map chain-neutral tx intents to unsigned Solana instructions via the SDK action builders.
 * Returns any ids the intent creates (position NFT mint, pool address) so the UI can route to
 * them after confirmation.
 */
import { address, type Instruction, type TransactionSigner } from "@solana/kit";
import type { TxIntent, TxResult } from "@yieldshield/core";
import {
  activateShielded,
  cancelUnlock,
  claimCommission,
  claimRewards,
  createPool,
  depositBacking,
  depositShielded,
  partialWithdrawProtector,
  partialWithdrawShielded,
  startUnlock,
  withdrawProtector,
  withdrawShielded,
} from "@yieldshield/sdk";
import type { SolanaRpc } from "./rpc.js";

export type BuiltIntent = {
  instructions: Instruction[];
  created: Partial<Pick<TxResult, "positionId" | "poolId">>;
};

export async function buildIntent(rpc: SolanaRpc, owner: TransactionSigner, intent: TxIntent): Promise<BuiltIntent> {
  switch (intent.kind) {
    case "demoTrade":
      throw new Error("Demo stock trading is available only on Base Sepolia.");
    case "depositShielded": {
      const { instruction, positionMint } = await depositShielded({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        backingMint: address(intent.backingToken),
        amount: intent.amount,
        minReceived: intent.minReceived,
      });
      return { instructions: [instruction], created: { positionId: positionMint } };
    }
    case "depositBacking": {
      const { instruction, positionMint } = await depositBacking({
        rpc,
        owner,
        pool: address(intent.pool),
        backingMint: address(intent.backingToken),
        amount: intent.amount,
        minReceived: intent.minReceived,
      });
      return { instructions: [instruction], created: { positionId: positionMint } };
    }
    case "activateShielded": {
      const instruction = await activateShielded({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        backingMint: address(intent.backingToken),
        positionMint: address(intent.position),
        minOut: intent.minOut,
      });
      return { instructions: [instruction], created: {} };
    }
    case "withdrawShielded": {
      const instruction = await withdrawShielded({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        positionMint: address(intent.position),
        minOut: intent.minOut,
      });
      return { instructions: [instruction], created: {} };
    }
    case "partialWithdrawShielded": {
      const instruction = await partialWithdrawShielded({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        positionMint: address(intent.position),
        amount: intent.amount,
        minOut: intent.minOut,
      });
      return { instructions: [instruction], created: {} };
    }
    case "withdrawProtector": {
      const instruction = await withdrawProtector({
        rpc,
        owner,
        pool: address(intent.pool),
        backingMint: address(intent.backingToken),
        positionMint: address(intent.position),
        minOut: intent.minOut,
      });
      return { instructions: [instruction], created: {} };
    }
    case "partialWithdrawProtector": {
      const instruction = await partialWithdrawProtector({
        rpc,
        owner,
        pool: address(intent.pool),
        backingMint: address(intent.backingToken),
        positionMint: address(intent.position),
        amount: intent.amount,
        minOut: intent.minOut,
      });
      return { instructions: [instruction], created: {} };
    }
    case "startUnlock": {
      const instruction = await startUnlock({ owner, positionMint: address(intent.position) });
      return { instructions: [instruction], created: {} };
    }
    case "cancelUnlock": {
      const instruction = await cancelUnlock({ owner, positionMint: address(intent.position) });
      return { instructions: [instruction], created: {} };
    }
    case "claimCommission": {
      const instruction = await claimCommission({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        positionMint: address(intent.position),
      });
      return { instructions: [instruction], created: {} };
    }
    case "claimRewards": {
      const instruction = await claimRewards({
        rpc,
        owner,
        pool: address(intent.pool),
        shieldedMint: address(intent.shieldedToken),
        positionMint: address(intent.position),
      });
      return { instructions: [instruction], created: {} };
    }
    case "createPool": {
      const p = intent.params;
      const { instructions, pool } = await createPool({
        rpc,
        creator: owner,
        shieldedMint: address(p.shieldedToken),
        backingMint: address(p.backingToken),
        collateralRatioBp: p.collateralRatioBp,
        commissionRateBp: p.commissionRateBp,
        poolFeeBp: p.poolFeeBp,
        protocolFeeBp: p.protocolFeeBp,
        maxTvlUsd: p.maxTvlUsd,
        minimumPoolTime: p.minimumPoolTime,
        unlockDuration: p.unlockDuration,
        shieldTransferLock: p.shieldTransferLock,
        protectorTransferLock: p.protectorTransferLock,
        creationBondAmount: p.creationBondAmount ?? 0n,
      });
      return { instructions, created: { poolId: pool } };
    }

    case "vaultDeposit":
    case "vaultRedeem":
    case "fundTestYield":
      throw new Error("The test vault demonstration is available on Base Sepolia.");
    case "faucetDrip":
      // Solana test-token drips go through the operator-run HTTP faucet service (the mint
      // authority can't live in the browser) — see the app's useFaucet seam.
      throw new Error("faucetDrip is not an on-chain intent on Solana.");
  }
}
