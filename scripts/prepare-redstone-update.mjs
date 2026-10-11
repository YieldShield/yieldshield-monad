/** Prepare a public, unsigned MON-only update for review. This script never signs or broadcasts. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { concatHex, encodeFunctionData } from "viem";
import { createMonadReadClient } from "../services/monad/read-client.mjs";
import {
  prepareRedstoneUpdate,
  RedstoneUpdateError,
  REDSTONE_MON_FEED_ID,
  REDSTONE_UPDATE_ABI,
} from "../services/monad/redstone.mjs";
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== "--output")) {
  console.error("Usage: node scripts/prepare-redstone-update.mjs [--output review.json]");
  process.exitCode = 1;
} else {
  try {
    const network = JSON.parse(readFileSync(new URL("../config/monad.json", import.meta.url)));
    const client = createMonadReadClient(process.env.MONAD_RPC_URL || network.rpcUrl);
    const update = await prepareRedstoneUpdate({
      client,
      config: network.redstone,
      apiKey: process.env.REDSTONE_API_KEY,
    });
    const path = resolve(args[1] || "artifacts/local/redstone-update-review.json");
    const transaction = {
      chainId: 10143,
      to: network.redstone.adapter,
      data: concatHex([
        encodeFunctionData({
          abi: REDSTONE_UPDATE_ABI,
          functionName: "updateDataFeedsValuesPartial",
          args: [[REDSTONE_MON_FEED_ID]],
        }),
        update.payload,
      ]),
      value: "0x0",
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ ...update, transaction, transactionsBroadcast: false }, null, 2) + "\n");
    console.log(
      `Verified unsigned MON update saved to ${path}. It expires at ${new Date(update.expiresAt).toISOString()}. No transaction was sent.`,
    );
  } catch (error) {
    console.error(
      error instanceof RedstoneUpdateError
        ? error.message
        : "Canonical RPC verification failed. No update was prepared or sent.",
    );
    process.exitCode = 1;
  }
}
