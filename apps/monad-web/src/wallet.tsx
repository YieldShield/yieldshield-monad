import {
  lazy,
  Suspense,
  useCallback,
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  encodeFunctionData,
  parseAbi,
  keccak256,
  type Address,
  type Account,
  type Chain,
  type Transport,
  type WalletClient,
  type EIP1193Provider,
  type Hash,
} from "viem";
import { monadTestnet } from "viem/chains";
import useSWR, { mutate } from "swr";
import config from "../../../config/monad.json";
import deployment from "../../../config/deployment.json";
import type { TxRequest, Registry } from "./types";
import { errorMessage, fetcher, explorer, short } from "./lib";
import { ensureDynamicSession, type DynamicSession } from "./dynamic-session";
const DynamicWallet = lazy(() => import("./DynamicWallet"));
export const client = createPublicClient({
  chain: monadTestnet,
  transport: http(config.rpcUrl, { timeout: 15000, batch: { batchSize: 20, wait: 10 } }),
});
const erc20 = parseAbi([
  "function allowance(address,address) view returns(uint256)",
  "function approve(address,uint256) returns(bool)",
  "function balanceOf(address) view returns(uint256)",
]);
const pythAbi = parseAbi([
  "function getUpdateFee(bytes[]) view returns(uint256)",
  "function updatePriceFeeds(bytes[]) payable",
]);
const WalletContext = createContext<any>(null);
const pendingKey = "yieldshield-monad:pending-transaction";
function savedTransaction(): Hash | null {
  try {
    const value = localStorage.getItem(pendingKey);
    return value && /^0x[0-9a-f]{64}$/i.test(value) ? (value as Hash) : null;
  } catch {
    return null;
  }
}
function saveTransaction(hash: Hash | null) {
  try {
    if (hash) localStorage.setItem(pendingKey, hash);
    else localStorage.removeItem(pendingKey);
  } catch {
    /* Wallet receipt remains the source of truth when storage is unavailable. */
  }
}
type WalletOption = { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider };
export function WalletProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<WalletOption[]>([]),
    [provider, setProvider] = useState<EIP1193Provider | null>(null),
    [account, setAccount] = useState<Address | null>(null),
    [chainId, setChain] = useState<number | null>(null),
    [chooser, setChooser] = useState(false),
    [status, setStatus] = useState(""),
    [hash, setHash] = useState<Hash | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dynamicSession = useRef<DynamicSession | null>(null);
  const [dynamicEnabled, setDynamicEnabled] = useState(() => {
    try {
      return localStorage.getItem("yieldshield-monad:dynamic-session") === "1";
    } catch {
      return false;
    }
  });
  const [dynamicOpen, setDynamicOpen] = useState(0);
  const onDynamicSession = useCallback((session: DynamicSession | null) => {
    const previous = dynamicSession.current;
    dynamicSession.current = session;
    if (session) {
      setProvider(null);
      setAccount(session.address);
      setChain(null);
      setChooser(false);
      try {
        localStorage.setItem("yieldshield-monad:dynamic-session", "1");
      } catch {}
    } else if (previous) {
      setAccount(null);
      setChain(null);
      try {
        localStorage.removeItem("yieldshield-monad:dynamic-session");
      } catch {}
    }
  }, []);
  useEffect(() => {
    const saved = savedTransaction();
    if (!saved) return;
    pending.current = true;
    setBusy(true);
    setHash(saved);
    setStatus("Checking your previous transaction");
    void client
      .waitForTransactionReceipt({ hash: saved, confirmations: 2, checkReplacement: false, timeout: 120000 })
      .then((receipt) => {
        saveTransaction(null);
        setStatus(
          receipt.status === "success"
            ? "Previous transaction confirmed. Reconnect to view your position."
            : "Previous transaction reverted. Check its receipt.",
        );
      })
      .catch(() =>
        setError("Confirmation is still unavailable. Check the transaction link and reload before trying again."),
      )
      .finally(() => {
        pending.current = false;
        setBusy(false);
      });
  }, []);
  useEffect(() => {
    if (!chooser) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[aria-labelledby="wallet-title"]');
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]") || []);
    focusable()[0]?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") setChooser(false);
      if (event.key !== "Tab") return;
      const nodes = focusable(),
        first = nodes[0],
        last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", keyboard);
    return () => {
      document.removeEventListener("keydown", keyboard);
      previous?.focus();
    };
  }, [chooser]);
  useEffect(() => {
    const announce = (event: Event) => {
      const x = (event as CustomEvent<WalletOption>).detail;
      setOptions((p) => (p.some((w) => w.info.uuid === x.info.uuid) ? p : [...p, x]));
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    const fallback = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    if (fallback)
      setOptions((p) =>
        p.length ? p : [{ info: { uuid: "injected", name: "Browser wallet", icon: "", rdns: "" }, provider: fallback }],
      );
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (v: any) => {
      setAccount(v[0] || null);
      void mutate((k) => typeof k === "string" && k.startsWith("/api/positions"));
    };
    const chains = (v: any) => setChain(Number(v));
    provider.on?.("accountsChanged", accounts);
    provider.on?.("chainChanged", chains);
    return () => {
      provider.removeListener?.("accountsChanged", accounts);
      provider.removeListener?.("chainChanged", chains);
    };
  }, [provider]);
  async function connect(p: EIP1193Provider) {
    try {
      setError("");
      const accounts = await p.request({ method: "eth_requestAccounts" });
      dynamicSession.current = null;
      setDynamicEnabled(false);
      try {
        localStorage.removeItem("yieldshield-monad:dynamic-session");
      } catch {}
      setProvider(p);
      setAccount(accounts[0]);
      setChain(Number(await p.request({ method: "eth_chainId" })));
      setChooser(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function ensure(): Promise<WalletClient<Transport, Chain, Account>> {
    if (dynamicSession.current && account) {
      const wallet = await ensureDynamicSession(dynamicSession.current, account);
      if ((await client.getChainId()) !== 10143) throw new Error("RPC returned the wrong network.");
      setChain(10143);
      return wallet;
    }
    if (!provider || !account) throw new Error("Connect a wallet first.");
    let id = Number(await provider.request({ method: "eth_chainId" }));
    if (id !== 10143) {
      try {
        await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x279f" }] });
      } catch (e) {
        if ((e as any).code !== 4902) throw e;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0x279f",
              chainName: "Monad Testnet",
              nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
              rpcUrls: [config.rpcUrl],
              blockExplorerUrls: [config.explorerUrl],
            },
          ],
        });
      }
      id = Number(await provider.request({ method: "eth_chainId" }));
      if (id !== 10143) throw new Error("Switch to Monad Testnet to continue.");
    }
    setChain(id);
    if ((await client.getChainId()) !== 10143) throw new Error("RPC returned the wrong network.");
    const accounts = await provider.request({ method: "eth_accounts" });
    if (accounts[0]?.toLowerCase() !== account.toLowerCase())
      throw new Error("Wallet account changed. Reconnect before continuing.");
    return createWalletClient({ account, chain: monadTestnet, transport: custom(provider) });
  }
  async function verifyTarget(address: Address) {
    const registry = deployment as any;
    const entry = Object.values(registry.contracts).find(
      (v: any) => v.address.toLowerCase() === address.toLowerCase(),
    ) as any;
    const external = [config.externalTokens.shMON, config.pyth.address].some(
      (a) => a.toLowerCase() === address.toLowerCase(),
    );
    if (!entry && !external) {
      const factoryAbi = parseAbi(["function isPoolActive(address) view returns(bool)"]);
      const poolAbi = parseAbi(["function POOL_FACTORY() view returns(address)"]);
      const origin = await client.readContract({ address: address, abi: poolAbi, functionName: "POOL_FACTORY" });
      const factory = ["Factory", "ReferenceFactory"]
        .map((n) => registry.contracts[n])
        .find((c) => c?.address.toLowerCase() === origin.toLowerCase());
      if (!factory) throw new Error("Pool provenance verification failed.");
      const [factoryCode, implementation, active] = await Promise.all([
        client.getCode({ address: origin }),
        client.getStorageAt({
          address: address,
          slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
        }),
        client.readContract({ address: origin, abi: factoryAbi, functionName: "isPoolActive", args: [address] }),
      ]);
      if (
        !factoryCode ||
        keccak256(factoryCode) !== factory.runtimeCodehash ||
        !implementation ||
        "0x" + implementation.slice(-40) !== registry.contracts.BasePoolRouter.address.toLowerCase() ||
        !active
      )
        throw new Error("Pool implementation verification failed.");
      const routerCode = await client.getCode({ address: registry.contracts.BasePoolRouter.address });
      if (!routerCode || keccak256(routerCode) !== registry.contracts.BasePoolRouter.runtimeCodehash)
        throw new Error("Pool router verification failed.");
    }
    const code = await client.getCode({ address: address });
    if (!code || code === "0x" || (entry && keccak256(code) !== entry.runtimeCodehash))
      throw new Error("Contract verification failed.");
  }
  async function send(req: TxRequest) {
    await ensure();
    await verifyTarget(req.address);
    setStatus("Checking transaction");
    await client.simulateContract({ ...req, account: account! });
    const data = encodeFunctionData(req);
    const gasEstimate = await client.estimateGas({ account: account!, to: req.address, data, value: req.value || 0n });
    const gas = (gasEstimate * 150n + 99n) / 100n + 100000n;
    if (gas > 16000000n) throw new Error("Transaction exceeds the Monad gas limit for this app.");
    const fees = await client.estimateFeesPerGas();
    const [balance, accountCode] = await Promise.all([
      client.getBalance({ address: account! }),
      client.getCode({ address: account! }),
    ]);
    const reserve = accountCode?.startsWith("0xef0100") ? 10n ** 19n : 5n * 10n ** 16n;
    if (balance < (req.value || 0n) + gas * fees.maxFeePerGas + reserve)
      throw new Error(
        accountCode?.startsWith("0xef0100")
          ? "This delegated wallet needs an additional 10 MON reserve on Monad testnet."
          : "Not enough testnet MON for this action and gas. Use the Monad faucet.",
      );
    setStatus("Confirm in your wallet");
    const wallet = await ensure();
    const tx = await wallet.sendTransaction({ to: req.address, data, value: req.value || 0n, gas, ...fees });
    saveTransaction(tx);
    setHash(tx);
    setStatus("Confirming on Monad");
    const receipt = await client.waitForTransactionReceipt({
      hash: tx,
      confirmations: 2,
      checkReplacement: false,
      timeout: 120000,
    });
    saveTransaction(null);
    if (receipt.status !== "success") throw new Error("Transaction reverted. Your wallet receipt has the details.");
    return receipt;
  }
  async function approve(token: Address, spender: Address, value: bigint) {
    await verifyTarget(spender);
    const allowance = await client.readContract({
      address: token,
      abi: erc20,
      functionName: "allowance",
      args: [account!, spender],
    });
    if (allowance >= value) return;
    setStatus("Approve the exact token amount");
    await send({ address: token, abi: erc20, functionName: "approve", args: [spender, value] });
  }
  async function updatePrice() {
    const registry = deployment as unknown as Registry;
    if (registry.referenceOracle === "redstone") {
      setStatus("Checking the on-chain MON reference");
      const address = registry.contracts.RedstoneReferenceFeed?.address;
      const token = registry.contracts.WMON?.address;
      if (!address || !token) throw new Error("Reference adapter unavailable.");
      const price = await client.readContract({
        address,
        abi: parseAbi(["function getPriceWithStrictCircuitBreaker(address) view returns(uint256)"]),
        functionName: "getPriceWithStrictCircuitBreaker",
        args: [token],
      });
      if (price <= 0n) throw new Error("A fresh MON reference is required.");
      return;
    }
    setStatus("Fetching signed MON price");
    const update = await fetcher("/api/pyth-update");
    if (
      update.chainId !== 10143 ||
      update.pyth.toLowerCase() !== config.pyth.address.toLowerCase() ||
      update.feedId?.toLowerCase() !== config.pyth.monUsdFeedId.toLowerCase() ||
      !Number.isFinite(update.expiresAt) ||
      update.expiresAt < Date.now() ||
      !Array.isArray(update.updateData) ||
      !update.updateData.length ||
      update.updateData.length > 4 ||
      update.updateData.some((value: unknown) => typeof value !== "string" || !/^0x(?:[a-f0-9]{2})+$/i.test(value))
    )
      throw new Error("Invalid or expired price update.");
    const value = await client.readContract({
      address: config.pyth.address as Address,
      abi: pythAbi,
      functionName: "getUpdateFee",
      args: [update.updateData],
    });
    return send({
      address: config.pyth.address as Address,
      abi: pythAbi,
      functionName: "updatePriceFeeds",
      args: [update.updateData],
      value,
    });
  }
  async function execute(label: string, fn: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setHash(savedTransaction());
    setStatus(label);
    try {
      if (savedTransaction())
        throw new Error(
          "A previous transaction still needs confirmation. Open its receipt and reload before sending another.",
        );
      await ensure();
      await fn();
      setStatus("Confirmed — your balances will refresh.");
      await mutate(
        (k) =>
          typeof k === "string" &&
          (k.startsWith("/api/") ||
            k.startsWith("balance:") ||
            k.startsWith("faucet:") ||
            k.startsWith("unstake:") ||
            k === "vault-nav"),
      );
    } catch (e) {
      setError(errorMessage(e));
      setStatus("");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const value = {
    account,
    chainId,
    busy,
    send,
    approve,
    execute,
    updatePrice,
    connect: () => setChooser(true),
    disconnect: () => {
      const session = dynamicSession.current;
      if (session) void session.logout().catch((error) => setError(errorMessage(error)));
      dynamicSession.current = null;
      setDynamicEnabled(false);
      try {
        localStorage.removeItem("yieldshield-monad:dynamic-session");
      } catch {}
      setAccount(null);
      setProvider(null);
    },
    setError,
  };
  return (
    <WalletContext.Provider value={value}>
      {children}
      {dynamicEnabled && (
        <Suspense
          fallback={
            <aside className="tx-toast" role="status">
              Loading secure wallet sign-in…
            </aside>
          }
        >
          <DynamicWallet openRequest={dynamicOpen} onSession={onDynamicSession} />
        </Suspense>
      )}
      {chooser && (
        <div className="modal-backdrop" onClick={() => setChooser(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wallet-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="close" aria-label="Close wallet selection" onClick={() => setChooser(false)}>
              ×
            </button>
            <h2 id="wallet-title">Connect your wallet</h2>
            <p>Sign in to create a wallet, or connect one you already use. Transactions use Monad testnet.</p>
            <button
              className="wallet-option"
              onClick={() => {
                setChooser(false);
                setDynamicEnabled(true);
                setDynamicOpen((value) => value + 1);
              }}
            >
              Continue with Dynamic <span>↗</span>
            </button>
            <p>Email sign-in and embedded wallets, powered by Dynamic.</p>
            {options.map((w) => (
              <button className="wallet-option" key={w.info.uuid} onClick={() => connect(w.provider)}>
                {w.info.name}
                <span>↗</span>
              </button>
            ))}
            {!options.length && <p>No browser extension detected. Continue with Dynamic to create a wallet.</p>}
            <a href="https://faucet.monad.xyz/add-network" target="_blank" rel="noreferrer">
              Monad wallet setup ↗
            </a>
          </section>
        </div>
      )}
      {(status || error) && (
        <aside className={`tx-toast ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
          <button
            className="close"
            aria-label="Dismiss notification"
            onClick={() => {
              if (!busy) {
                setStatus("");
                setError("");
              }
            }}
          >
            ×
          </button>
          <strong>{error || status}</strong>
          {hash && (
            <a href={explorer("tx", hash)} target="_blank" rel="noreferrer">
              View transaction {short(hash)} ↗
            </a>
          )}
        </aside>
      )}
    </WalletContext.Provider>
  );
}
export const useWallet = () =>
  useContext(WalletContext) as {
    account: Address | null;
    chainId: number | null;
    busy: boolean;
    send: (r: TxRequest) => Promise<any>;
    approve: (a: Address, b: Address, n: bigint) => Promise<void>;
    execute: (s: string, f: () => Promise<unknown>) => Promise<void>;
    updatePrice: () => Promise<any>;
    connect: () => void;
    disconnect: () => void;
    setError: (s: string) => void;
  };
export function useBalance(token: Address | undefined) {
  const { account } = useWallet();
  return useSWR(
    account && token ? `balance:${account}:${token}` : null,
    () => client.readContract({ address: token!, abi: erc20, functionName: "balanceOf", args: [account!] }),
    { refreshInterval: 15000 },
  );
}

export function useNativeBalance() {
  const { account } = useWallet();
  return useSWR(account ? `balance:${account}:native` : null, () => client.getBalance({ address: account! }), {
    refreshInterval: 12000,
    errorRetryCount: 2,
    keepPreviousData: false,
  });
}
