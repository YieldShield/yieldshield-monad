#!/usr/bin/env node
/** Verify the wrapper using the exact native:wrap intent in the main deployment recipe. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, http, encodeFunctionData, parseEther, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import {
  ROOT,
  SequentialDeployment,
  loadEnv,
  artifact,
  atomicJson,
  acquireDeploymentLock,
} from "./monad-deployment-lib.mjs";
assert(process.argv.includes("--broadcast"), "Explicit --broadcast is required");
const env = loadEnv(),
  path = resolve(ROOT, "contracts/deployments/monad-testnet.json"),
  manifest = JSON.parse(readFileSync(path));
const account = privateKeyToAccount(env.MONAD_DEPLOYER_PRIVATE_KEY);
assert.equal(account.address, manifest.deployer);
const client = createPublicClient({
  chain: monadTestnet,
  transport: http(env.MONAD_RPC_URL || "https://testnet-rpc.monad.xyz", { timeout: 20000, retryCount: 2 }),
  pollingInterval: 1000,
});
assert.equal(await client.getChainId(), 10143);
const wrapper = manifest.contracts.WMON;
assert.equal(keccak256(await client.getCode({ address: wrapper.address })), wrapper.runtimeCodehash);
const release = acquireDeploymentLock(resolve(ROOT, "contracts/.monad-deployment.lock"));
process.once("exit", release);
try {
  const run = new SequentialDeployment({
    client,
    account,
    broadcast: true,
    manifestPath: path,
    manifest,
    nonce: await client.getTransactionCount({ address: account.address }),
    maxFeePerGas: 200000000000n,
    spendLimit: parseEther("4.8"),
  });
  const receipt = await run.transaction("native:wrap", {
    to: wrapper.address,
    data: encodeFunctionData({ abi: artifact("MonadWrappedNative").abi, functionName: "deposit" }),
    value: parseEther("0.01"),
  });
  const read = (functionName, args = []) =>
    client.readContract({
      address: wrapper.address,
      abi: artifact("MonadWrappedNative").abi,
      functionName,
      args,
      blockNumber: receipt.blockNumber,
    });
  const [held, supply, native] = await Promise.all([
    read("balanceOf", [account.address]),
    read("totalSupply"),
    client.getBalance({ address: wrapper.address, blockNumber: receipt.blockNumber }),
  ]);
  assert(held >= parseEther("0.01"));
  assert(native >= supply);
  atomicJson(resolve(ROOT, "docs/evidence/native-wrap.json"), {
    chainId: 10143,
    account: account.address,
    wrapper: wrapper.address,
    txHash: receipt.transactionHash,
    blockNumber: String(receipt.blockNumber),
    wrappedAmount: "10000000000000000",
    walletWrappedBalance: String(held),
    totalSupply: String(supply),
    nativeBacking: String(native),
    note: "Actual native MON wrapping on Monad testnet. This verifies the wrapper only; protection markets remain pending.",
  });
  console.log("Native wrapper verified against actual testnet balance and backing.");
} finally {
  release();
}
