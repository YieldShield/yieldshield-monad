#!/usr/bin/env node
/** Reviewed, sequential Monad testnet alpha bootstrap. Default: prepare only; never broadcasts without --broadcast.
 * Secrets are read from ignored contracts/.env.base.local and are never serialized/logged.
 * Resume uses the same signed transaction hash; an ambiguous nonce is a hard stop.
 */
import {
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  existsSync,
  openSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  createPublicClient,
  http,
  encodeDeployData,
  encodeFunctionData,
  getContractAddress,
  getAddress,
  keccak256,
  parseEventLogs,
  parseEther,
  toHex,
  zeroAddress,
  zeroHash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let currentStage = "startup";
const CHAIN_ID = 10143,
  SOURCE_CHAIN_ID = 143,
  DAY = 86400n,
  IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const stringify = (value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2) + "\n";
const sha = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : stringify(value))
    .digest("hex");
export function acquireDeploymentLock(path) {
  const descriptor = openSync(path, "wx", 0o600);
  writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  closeSync(descriptor);
  let active = true;
  return () => {
    if (active) {
      active = false;
      unlinkSync(path);
    }
  };
}
const sameAddress = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
export function atomicJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path + ".tmp", stringify(value), { mode: 0o600 });
  renameSync(path + ".tmp", path);
}
export function linkBytecode(bytecode, references, addresses) {
  let result = bytecode;
  for (const [file, libraries] of Object.entries(references || {}))
    for (const [name, offsets] of Object.entries(libraries)) {
      const address = addresses[`${file}:${name}`];
      assert(address, `Missing library ${file}:${name}`);
      for (const { start, length } of offsets) {
        assert.equal(length, 20);
        const offset = 2 + start * 2;
        result = result.slice(0, offset) + address.slice(2).toLowerCase() + result.slice(offset + length * 2);
      }
    }
  assert(/^0x[0-9a-fA-F]*$/.test(result), "Unresolved artifact links");
  return result;
}
export function assertRuntimeMatches(artifact, actual, address, links) {
  let expected = linkBytecode(artifact.deployedBytecode.object, artifact.deployedBytecode.linkReferences, links);
  assert.equal(actual.length, expected.length, "Deployed runtime length differs from artifact");
  // Solidity library constructors patch their own address in the leading PUSH20.
  if (expected.startsWith("0x73" + "0".repeat(40)))
    expected = "0x73" + address.slice(2).toLowerCase() + expected.slice(44);
  for (const entries of Object.values(artifact.deployedBytecode.immutableReferences || {}))
    for (const { start, length } of entries) {
      const offset = 2 + start * 2,
        zeros = "0".repeat(length * 2);
      expected = expected.slice(0, offset) + zeros + expected.slice(offset + length * 2);
      actual = actual.slice(0, offset) + zeros + actual.slice(offset + length * 2);
    }
  assert.equal(actual.toLowerCase(), expected.toLowerCase(), "Deployed runtime differs from reviewed artifact");
}
export function artifact(name) {
  const path = resolve(ROOT, `contracts/out/${name}.sol/${name}.json`),
    a = JSON.parse(readFileSync(path, "utf8"));
  for (const [source, metadata] of Object.entries(a.metadata.sources))
    assert.equal(
      keccak256(readFileSync(resolve(ROOT, "contracts", source))),
      metadata.keccak256,
      `Stale artifact ${name}: ${source}; rebuild first`,
    );
  return a;
}
export function loadEnv() {
  const path = resolve(ROOT, "contracts/.env.monad.local");
  assert(existsSync(path), "Missing ignored contracts/.env.base.local");
  execFileSync("git", ["check-ignore", "--quiet", path], { cwd: ROOT, stdio: "ignore" });
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) {
      let v = match[2].trim();
      if ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'")) v = v.slice(1, -1);
      values[match[1]] = v;
    }
  }
  return { ...values, ...process.env };
}
function toRequest(value) {
  const req = { ...value };
  for (const key of ["gas", "maxFeePerGas", "maxPriorityFeePerGas", "value"])
    if (req[key] !== undefined) req[key] = BigInt(req[key]);
  return req;
}
function assertReceiptIdentity(receipt, hash, id) {
  assert.equal(receipt?.transactionHash, hash, `${id}: receipt transaction hash does not match saved transaction`);
}
/** Read sealed canonical receipts explicitly; confirmation waiters can retain preconfirmation data. */
export async function readCanonicalReceipt(client, hash, id) {
  const checkReceipt = (receipt) => {
    assertReceiptIdentity(receipt, hash, id);
    assert.equal(receipt.status, "success", `${id}: transaction reverted`);
    assert(typeof receipt.blockNumber === "bigint" && receipt.blockNumber > 0n, `${id}: invalid receipt block number`);
    assert(
      /^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash ?? "") && receipt.blockHash !== zeroHash,
      `${id}: receipt block hash is not sealed`,
    );
    assert(
      Number.isSafeInteger(receipt.transactionIndex) && receipt.transactionIndex >= 0,
      `${id}: invalid receipt transaction index`,
    );
  };
  const checkBlock = (receipt, block) => {
    assert.equal(block.number, receipt.blockNumber, `${id}: canonical block height mismatch`);
    assert.equal(block.hash, receipt.blockHash, `${id}: receipt differs from canonical block`);
    assert.equal(
      block.transactions?.[receipt.transactionIndex],
      hash,
      `${id}: transaction missing from canonical block`,
    );
  };
  const receipt = await client.getTransactionReceipt({ hash });
  checkReceipt(receipt);
  checkBlock(receipt, await client.getBlock({ blockNumber: receipt.blockNumber }));
  const head = await client.getBlock({ blockTag: "latest" });
  assert(
    typeof head.number === "bigint" && head.number >= receipt.blockNumber + 1n,
    `${id}: two sealed block confirmations required`,
  );
  assert(/^0x[0-9a-fA-F]{64}$/.test(head.hash ?? "") && head.hash !== zeroHash, `${id}: latest block is not sealed`);
  const fresh = await client.getTransactionReceipt({ hash });
  checkReceipt(fresh);
  assert.equal(fresh.blockNumber, receipt.blockNumber, `${id}: receipt moved during confirmation`);
  assert.equal(fresh.blockHash, receipt.blockHash, `${id}: receipt reorged during confirmation`);
  checkBlock(fresh, await client.getBlock({ blockNumber: fresh.blockNumber }));
  return fresh;
}
function maximumExecutionCost(request) {
  const gas = BigInt(request.gas),
    fee = BigInt(request.maxFeePerGas);
  assert(gas > 0n && fee >= 0n, "Invalid saved transaction gas or maximum fee");
  return gas * fee;
}

export class SequentialDeployment {
  constructor({ client, account, broadcast, manifestPath, manifest, nonce, maxFeePerGas, spendLimit }) {
    Object.assign(this, { client, account, broadcast, manifestPath, manifest, maxFeePerGas, spendLimit });
    this.cursor = nonce;
    this.plan = [];
    this.links = {};
    this.preparedResults = new Map();
    this.confirmedCosts = new Map();
  }
  save() {
    if (this.broadcast) atomicJson(this.manifestPath, this.manifest);
  }
  rememberConfirmedCost(entry, receipt) {
    // Only freshly verified canonical receipts may release unused fee reservations.
    // Missing fee data retains the full signed maximum; persisted summaries are never trusted.
    if (receipt.effectiveGasPrice === undefined) return;
    assert(typeof receipt.gasUsed === "bigint" && receipt.gasUsed > 0n, "Invalid confirmed gas usage");
    assert(
      typeof receipt.effectiveGasPrice === "bigint" && receipt.effectiveGasPrice >= 0n &&
        receipt.effectiveGasPrice <= BigInt(entry.request.maxFeePerGas) &&
        receipt.gasUsed <= BigInt(entry.request.gas),
      "Confirmed fee exceeds signed request bounds",
    );
    this.confirmedCosts.set(entry.hash, {
      requestHash: sha(entry.request),
      cost: receipt.gasUsed * receipt.effectiveGasPrice + BigInt(entry.request.value ?? 0),
    });
  }
  async assertSubmissionLimits(request, additionalRequest = false) {
    const maximumCost = maximumExecutionCost(request) + BigInt(request.value ?? 0);
    assert(BigInt(request.gas) <= 16000000n, "Transaction exceeds conservative Monad gas cap");
    assert(BigInt(request.maxFeePerGas) <= this.maxFeePerGas, "Transaction fee exceeds configured deployment cap");
    // Confirmed spending plus worst-case unsettled spending must fit the same total cap.
    const reserved = Object.values(this.manifest.transactions).reduce(
      (n, t) => {
        const confirmed = this.confirmedCosts.get(t.hash);
        return n + (t.status === "confirmed" && confirmed?.requestHash === sha(t.request)
          ? confirmed.cost
          : maximumExecutionCost(t.request) + BigInt(t.request.value ?? 0));
      },
      0n,
    );
    assert(
      reserved + (additionalRequest ? maximumCost : 0n) <= this.spendLimit,
      "Deployment cumulative maximum fee budget exceeded",
    );
    assert(
      (await this.client.getBalance({ address: this.account.address })) >= maximumCost + parseEther("0.1"),
      "Insufficient testnet MON including balance reserve",
    );
  }
  async transaction(id, { to, data, value = 0n, kind = "call" }) {
    currentStage = id;
    const intent = { chainId: CHAIN_ID, from: this.account.address, to: to ?? null, data, value: String(value) },
      intentHash = sha(intent);
    const previous = this.manifest.transactions[id];
    if (previous) {
      assert.equal(previous.intentHash, intentHash, `Resume intent changed: ${id}`);
      assert.equal(previous.request.chainId, CHAIN_ID, `${id}: persisted transaction chain changed`);
      assert.equal(previous.request.data, data, `${id}: persisted transaction calldata changed`);
      assert.equal(
        previous.request.to?.toLowerCase(),
        to?.toLowerCase(),
        `${id}: persisted transaction target changed`,
      );
      assert.equal(BigInt(previous.request.value), value, `${id}: unexpected transaction value`);
      if (previous.status === "confirmed") assertReceiptIdentity(previous.receipt, previous.hash, id);
    }
    if (!this.broadcast) {
      if (previous?.status === "confirmed") return previous.receipt;
      const prepared = this.preparedResults.get(id);
      if (prepared) {
        assert.equal(prepared.intentHash, intentHash, `${id}: conflicting prepared intent`);
        return prepared.result;
      }
      const nonce = this.cursor++,
        entry = { id, kind, ...intent, nonce };
      if (!to) entry.predictedAddress = getContractAddress({ from: this.account.address, nonce: BigInt(nonce) });
      this.plan.push(entry);
      const result = { contractAddress: entry.predictedAddress };
      this.preparedResults.set(id, { intentHash, result });
      return result;
    }
    if (previous?.status === "confirmed") {
      assert.equal(
        keccak256(await this.account.signTransaction(toRequest(previous.request))),
        previous.hash,
        `${id}: saved transaction does not match dedicated signer`,
      );
      const receipt = await readCanonicalReceipt(this.client, previous.hash, id);
      assert.equal(receipt.blockHash, previous.receipt.blockHash, `${id}: confirmed transaction reorged`);
      assert.equal(receipt.blockNumber, BigInt(previous.receipt.blockNumber), `${id}: confirmed transaction moved`);
      this.rememberConfirmedCost(previous, receipt);
      return receipt;
    }
    let entry = previous;
    if (!entry) {
      const latest = await this.client.getTransactionCount({ address: this.account.address, blockTag: "latest" });
      const pending = await this.client.getTransactionCount({ address: this.account.address, blockTag: "pending" });
      assert.equal(latest, pending, "Unrelated pending transaction; stop and reconcile before bootstrap");
      const estimated = await this.client.estimateGas({ account: this.account, to, data, value });
      const gas = (estimated * 110n + 99n) / 100n;
      assert(gas <= 16000000n, "Transaction exceeds conservative Monad gas cap");
      const fees = await this.client.estimateFeesPerGas();
      const request = {
        chainId: CHAIN_ID,
        type: "eip1559",
        nonce: latest,
        to,
        data,
        value,
        gas,
        maxFeePerGas: fees.maxFeePerGas,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
      };
      await this.assertSubmissionLimits(request, true);
      const maximumCost = maximumExecutionCost(request);
      const serialized = await this.account.signTransaction(request);
      const hash = keccak256(serialized);
      entry = { intentHash, request, hash, maximumCost: maximumCost.toString(), status: "prepared" };
      this.manifest.transactions[id] = entry;
      this.save(); // Intent/hash durably recorded BEFORE network submission.
    }
    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: entry.hash });
    } catch (error) {
      if (error.name !== "TransactionReceiptNotFoundError") throw error;
    }
    if (receipt) assertReceiptIdentity(receipt, entry.hash, id);
    if (!receipt) {
      // Operator limits and available funds may have changed since this intent was saved.
      await this.assertSubmissionLimits(entry.request);
      const serialized = await this.account.signTransaction(toRequest(entry.request));
      assert.equal(keccak256(serialized), entry.hash, "Resume signature/hash mismatch");
      const consumed = await this.client.getTransactionCount({ address: this.account.address, blockTag: "latest" });
      assert(
        consumed <= entry.request.nonce,
        `${id}: nonce consumed without known receipt; do not resend a new transaction`,
      );
      try {
        await this.client.sendRawTransaction({ serializedTransaction: serialized });
      } catch (error) {
        // Preserve prepared hash for exact retry; never create a replacement nonce after uncertainty.
        let found;
        try {
          found = await this.client.getTransaction({ hash: entry.hash });
        } catch {}
        if (!found) throw error;
      }
      entry.status = "submitted";
      this.save();
    }
    // A cancellation/replacement is never completion of the saved bootstrap intent.
    receipt = await this.client.waitForTransactionReceipt({
      hash: entry.hash,
      confirmations: 2,
      checkReplacement: false,
      timeout: 120000,
      pollingInterval: 2000,
    });
    assertReceiptIdentity(receipt, entry.hash, id);
    // Some Base RPCs return the receipt before their latest sealed head catches up.
    // Retry that specific freshness condition; every canonicality and identity check remains mandatory.
    for (let attempt = 0; ; attempt++) {
      try {
        receipt = await readCanonicalReceipt(this.client, entry.hash, id);
        break;
      } catch (error) {
        if (attempt >= 10 || !String(error.message).includes("two sealed block confirmations required")) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    this.rememberConfirmedCost(entry, receipt);
    entry.status = "confirmed";
    entry.receipt = {
      transactionHash: receipt.transactionHash,
      blockHash: receipt.blockHash,
      blockNumber: receipt.blockNumber,
      contractAddress: receipt.contractAddress,
      gasUsed: receipt.gasUsed,
      logs: receipt.logs,
    };
    this.save();
    console.log(`Confirmed ${id}: ${entry.hash}`);
    return receipt;
  }
  async deploy(name, artifactName = name, args = []) {
    const a = artifact(artifactName);
    assert((a.deployedBytecode.object.length - 2) / 2 <= 24576, `${artifactName} exceeds Monad runtime limit`);
    for (const [file, libraries] of Object.entries(a.bytecode.linkReferences || {}))
      for (const libraryName of Object.keys(libraries)) {
        const key = `${file}:${libraryName}`;
        if (!this.links[key]) this.links[key] = await this.deploy(libraryName, libraryName, []);
      }
    const bytecode = linkBytecode(a.bytecode.object, a.bytecode.linkReferences, this.links);
    const data = encodeDeployData({ abi: a.abi, bytecode, args });
    assert((data.length - 2) / 2 <= 49152, `${name} exceeds Monad initcode limit`);
    const receipt = await this.transaction(`deploy:${name}`, { data, kind: "deployment" });
    const address = getAddress(receipt.contractAddress ?? this.manifest.contracts[name]?.address);
    assert(address, `No deployed address for ${name}`);
    if (this.broadcast) {
      const actual = await this.client.getCode({ address });
      assert(actual && actual !== "0x", `${name}: no deployed code`);
      assertRuntimeMatches(a, actual, address, this.links);
      const original = this.manifest.contracts[name];
      if (original) assert.equal(original.runtimeCodehash, keccak256(actual), `${name}: runtime changed`);
      this.manifest.contracts[name] = {
        address,
        artifact: artifactName,
        txHash: receipt.transactionHash,
        runtimeCodehash: keccak256(actual),
        artifactHash: sha(a),
        constructorArguments: args,
      };
      this.save();
    }
    return address;
  }
  async write(id, address, name, functionName, args = []) {
    return this.transaction(id, {
      to: address,
      data: encodeFunctionData({ abi: artifact(name).abi, functionName, args }),
    });
  }
  async read(address, name, functionName, args = []) {
    return this.client.readContract({ address, abi: artifact(name).abi, functionName, args });
  }
  async expect(address, name, functionName, args, expected) {
    if (!this.broadcast) return;
    const actual = await this.read(address, name, functionName, args);
    assert.deepEqual(actual, expected, `${name}.${functionName} postcondition`);
  }
}
