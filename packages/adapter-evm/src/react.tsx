/**
 * React surface of the EVM adapter: wagmi-backed provider plus hooks matching the port's
 * `WalletConnectionApi` / `IntentSenderApi` shapes. The web app imports these through its
 * `src/chain/` seam — never from wagmi/viem directly.
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getAccount, switchChain, waitForTransactionReceipt, writeContract, type Config } from "@wagmi/core";
import {
  formatTransactionReceipt,
  zeroHash,
  type Abi,
  type Address,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type RpcTransactionReceipt,
} from "viem";
import { WagmiProvider, createConfig, http, injected, useAccount, useConnect, useDisconnect, useConfig } from "wagmi";
import type {
  AccountId,
  IntentSenderApi,
  SendOptions,
  TxIntent,
  TxResult,
  WalletConnectionApi,
} from "@yieldshield/core";
import type { EvmAdapter } from "./adapter.js";
import { planIntent, type EvmStep } from "./intents.js";
import { assertReviewedWalletExecution } from "./wallet-execution.js";

const AdapterContext = createContext<EvmAdapter | null>(null);

/** Mounts wagmi + react-query and exposes the adapter to the hooks below. */
export function EvmChainProvider({ adapter, children }: { adapter: EvmAdapter; children: ReactNode }) {
  const wagmiConfig = useMemo(
    () =>
      createConfig({
        chains: [adapter.chain],
        connectors: [injected({ shimDisconnect: true })],
        transports: { [adapter.chain.id]: adapter.transport ?? http(adapter.rpcUrl) },
      }),
    [adapter],
  );
  const queryClient = useMemo(() => new QueryClient(), []);
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AdapterContext.Provider value={adapter}>{children}</AdapterContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export function useAdapter(): EvmAdapter {
  const adapter = useContext(AdapterContext);
  if (!adapter) throw new Error("EvmChainProvider is not mounted");
  return adapter;
}

/** The connected wallet's address, or null when disconnected. */
export function useWalletAddress(): AccountId | null {
  const { address } = useAccount();
  return address ?? null;
}

/** Wallet connection state/actions in the port's chain-neutral shape. */
export function useWalletConnection(): WalletConnectionApi {
  const adapter = useAdapter();
  const config = useConfig();
  const { address, status, connector } = useAccount();
  const { connectors, connectAsync, isPending } = useConnect();
  const { disconnectAsync } = useDisconnect();
  return {
    // Until wagmi's reconnect settles, report not-ready so guards don't flash the welcome screen.
    isReady: status !== "reconnecting",
    connected: status === "connected",
    connecting: isPending || status === "connecting",
    address: address ?? null,
    walletName: connector?.name ?? null,
    connectors: connectors.map((c) => ({ id: c.id, name: c.name })),
    connect: async (connectorId: string) => {
      const target = connectors.find((c) => c.id === connectorId);
      if (!target) throw new Error(`unknown wallet connector: ${connectorId}`);
      try {
        await connectAsync({ connector: target, chainId: adapter.chain.id });
        if (getAccount(config).chainId !== adapter.chain.id) await switchChain(config, { chainId: adapter.chain.id });
      } catch (e) {
        // wagmi restores persisted sessions asynchronously on mount; if the user clicks
        // Connect while (or after) that happens, the connector is already connected —
        // that's success, not an error.
        if (
          e instanceof Error &&
          (e.name === "ConnectorAlreadyConnectedError" || /already connected/i.test(e.message))
        ) {
          if (getAccount(config).chainId !== adapter.chain.id) await switchChain(config, { chainId: adapter.chain.id });
          return;
        }
        throw e;
      }
    },
    disconnect: () => disconnectAsync().then(() => undefined),
  };
}

/** Recheck the live connector before every signature, including after an approval confirms. */
export async function assertWalletSession(
  config: Config,
  owner: Address,
  chainId: number,
  connectorUid: string,
): Promise<void> {
  const current = getAccount(config);
  if (
    current.status !== "connected" ||
    !current.connector ||
    current.connector.uid !== connectorUid ||
    current.address?.toLowerCase() !== owner.toLowerCase()
  )
    throw new Error("Wallet account changed. Review the action and start again.");
  const [accounts, walletChain] = await Promise.all([current.connector.getAccounts(), current.connector.getChainId()]);
  if (accounts[0]?.toLowerCase() !== owner.toLowerCase())
    throw new Error("Wallet account changed. Review the action and start again.");
  if (walletChain !== chainId || getAccount(config).chainId !== chainId)
    throw new Error("Wrong network. Switch your wallet to the application network and try again.");
  const latest = getAccount(config);
  if (latest.connector?.uid !== connectorUid || latest.address?.toLowerCase() !== owner.toLowerCase())
    throw new Error("Wallet account changed. Review the action and start again.");
}

const sameHex = (left: unknown, right: unknown) =>
  typeof left === "string" && typeof right === "string" && left.toLowerCase() === right.toLowerCase();
const sealedHash = (value: unknown): value is Hash =>
  typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && !sameHex(value, zeroHash);
const quantity = (value: unknown): bigint | null =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value) ? BigInt(value) : null;

/** Confirmation uses raw sealed RPC evidence, not cached/chain-formatted preconfirmation data. */
export async function readCanonicalStepReceipt(
  client: PublicClient,
  hash: Hash,
  owner: Address,
  step: EvmStep,
  chainId: number,
): Promise<TransactionReceipt> {
  const readReceipt = async () => {
    const receipt = await client.request({ method: "eth_getTransactionReceipt", params: [hash] });
    if (!receipt || !sameHex(receipt.transactionHash, hash))
      throw new Error("Transaction receipt identity is unavailable.");
    if (receipt.status !== "0x1") throw new Error(`Transaction did not succeed: ${hash}`);
    const height = quantity(receipt.blockNumber);
    const index = quantity(receipt.transactionIndex);
    if (
      !sealedHash(receipt.blockHash) ||
      height === null ||
      height <= 0n ||
      index === null ||
      index > BigInt(Number.MAX_SAFE_INTEGER)
    )
      throw new Error(`Transaction is awaiting sealed confirmation. Check wallet activity before retrying: ${hash}`);
    const logIndices = new Set<string>();
    if (!Array.isArray(receipt.logs)) throw new Error("Canonical transaction logs are unavailable.");
    for (const log of receipt.logs) {
      if (
        log.removed ||
        !sameHex(log.transactionHash, hash) ||
        !sameHex(log.blockHash, receipt.blockHash) ||
        quantity(log.blockNumber) !== height ||
        quantity(log.transactionIndex) !== index ||
        quantity(log.logIndex) === null ||
        logIndices.has(log.logIndex!)
      )
        throw new Error("Transaction logs do not match the canonical receipt.");
      logIndices.add(log.logIndex!);
    }
    return { receipt, height, index: Number(index) };
  };
  const verifyBlock = async (observed: Awaited<ReturnType<typeof readReceipt>>) => {
    const block = await client.request({
      method: "eth_getBlockByNumber",
      params: [observed.receipt.blockNumber, false],
    });
    if (
      !block ||
      quantity(block.number) !== observed.height ||
      !sameHex(block.hash, observed.receipt.blockHash) ||
      !sameHex(block.transactions[observed.index], hash)
    )
      throw new Error("Transaction is not included in the canonical block. Check wallet activity before retrying.");
  };
  const observed = await readReceipt();
  await verifyBlock(observed);
  const [transaction, latest] = await Promise.all([
    client.request({ method: "eth_getTransactionByHash", params: [hash] }),
    client.request({ method: "eth_getBlockByNumber", params: ["latest", false] }),
  ]);
  if (
    !transaction ||
    !sameHex(transaction.hash, hash) ||
    !sameHex(transaction.from, observed.receipt.from) ||
    !sameHex(transaction.to, observed.receipt.to) ||
    quantity(transaction.value) !== 0n ||
    !sameHex(transaction.blockHash, observed.receipt.blockHash) ||
    quantity(transaction.blockNumber) !== observed.height ||
    quantity(transaction.transactionIndex) !== BigInt(observed.index) ||
    (transaction.chainId !== undefined && quantity(transaction.chainId) !== BigInt(chainId))
  )
    throw new Error("Mined transaction differs from the reviewed action. Check wallet activity before retrying.");
  const latestHeight = quantity(latest?.number);
  if (!latest || !sealedHash(latest.hash) || latestHeight === null || latestHeight < observed.height + 1n)
    throw new Error(`Transaction needs two sealed confirmations. Check wallet activity before retrying: ${hash}`);
  const fresh = await readReceipt();
  if (
    fresh.height !== observed.height ||
    !sameHex(fresh.receipt.blockHash, observed.receipt.blockHash) ||
    !sameHex(fresh.receipt.from, transaction.from) ||
    !sameHex(fresh.receipt.to, transaction.to)
  )
    throw new Error("Transaction changed blocks during confirmation. Check wallet activity before retrying.");
  await assertReviewedWalletExecution(
    client,
    transaction,
    fresh.receipt as RpcTransactionReceipt,
    owner,
    step,
    chainId,
  );
  // Recheck the block after historical wallet-code reads as well as receipt reads.
  await verifyBlock(fresh);
  return formatTransactionReceipt(fresh.receipt as RpcTransactionReceipt);
}

/** Plan once for the selected account; stop if it changes while any signature is pending. */
export async function sendEvmIntent(
  adapter: EvmAdapter,
  config: Config,
  owner: Address,
  intent: TxIntent,
  opts?: SendOptions,
): Promise<TxResult> {
  const connector = getAccount(config).connector;
  if (!connector) throw new Error("Connect a wallet to continue.");
  await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
  if ((await adapter.publicClient.getChainId()) !== adapter.chain.id)
    throw new Error("Wrong network configured for application reads.");
  opts?.onPhase?.("building");
  const plan = await planIntent(
    adapter.publicClient,
    owner,
    adapter.addresses,
    intent,
  );
  let lastReceipt: TransactionReceipt | null = null;
  for (const [stepIndex, step] of plan.steps.entries()) {
    const stepProgress = { index: stepIndex + 1, total: plan.steps.length, label: step.label };
    opts?.onStep?.(stepProgress);
    await plan.beforeStep?.();
    await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
    // Simulate each step against current chain state before prompting for its signature.
    // Deposits are simulated after approvals mine, so allowance requirements are satisfied.
    await adapter.publicClient.simulateContract({
      address: step.address,
      abi: step.abi as Abi,
      functionName: step.functionName,
      args: step.args as unknown[],
      account: owner,
    });
    await assertWalletSession(config, owner, adapter.chain.id, connector.uid);
    opts?.onStep?.({ ...stepProgress, awaitingWallet: true });
    const hash = await writeContract(config, {
      address: step.address,
      abi: step.abi as Abi,
      functionName: step.functionName,
      args: step.args as unknown[],
      account: owner,
      chainId: adapter.chain.id,
      connector,
    });
    opts?.onStep?.({ ...stepProgress, txId: hash });
    opts?.onPhase?.("submitted");
    opts?.onPhase?.("confirming");
    let cancelled = false;
    let expectedHash = hash;
    lastReceipt = await waitForTransactionReceipt(config, {
      hash,
      chainId: adapter.chain.id,
      confirmations: 2,
      onReplaced: (replacement) => {
        if (
          replacement.reason !== "repriced" ||
          !sameHex(replacement.replacedTransaction.hash, expectedHash) ||
          !sealedHash(replacement.transaction.hash)
        )
          cancelled = true;
        else {
          expectedHash = replacement.transaction.hash;
          opts?.onStep?.({ ...stepProgress, txId: expectedHash });
        }
      },
    });
    if (cancelled || !sameHex(lastReceipt.transactionHash, expectedHash))
      throw new Error("Transaction was cancelled or replaced. Review your wallet activity before retrying.");
    // Even repriced replacements must preserve the exact account, calldata,
    // contract and zero-value intent. Never extract position IDs from a waiter cache.
    lastReceipt = await readCanonicalStepReceipt(
      adapter.publicClient,
      lastReceipt.transactionHash,
      owner,
      step,
      adapter.chain.id,
    );
  }
  if (!lastReceipt) throw new Error("Nothing to submit.");
  return { txId: lastReceipt.transactionHash, ...(plan.extract?.(lastReceipt) ?? {}) };
}

export function useIntentSender(): IntentSenderApi {
  const adapter = useAdapter();
  const config = useConfig();
  const { address } = useAccount();
  const send = useCallback(
    async (intent: TxIntent, opts?: SendOptions): Promise<TxResult> => {
      if (!address) throw new Error("Connect a wallet to continue.");
      return sendEvmIntent(adapter, config, address, intent, opts);
    },
    [adapter, config, address],
  );
  return { owner: address ?? null, send };
}
