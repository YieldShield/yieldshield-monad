/** EVM chain implementation — bundled when VITE_CHAIN_FAMILY is "evm" (e.g. Robinhood deploys). */
import type { ReactNode } from "react";
import type { AccountId, FaucetApi } from "@yieldshield/core";
import {
  createEvmAdapter,
  readFaucetStatus,
  evmChains,
  EvmChainProvider,
  friendlyError,
  useIntentSender,
  useWalletAddress,
  useWalletConnection,
  type EvmChainName,
} from "@yieldshield/adapter-evm";
import type { ChainImpl } from "./impl-contract";

const chainName = (import.meta.env.VITE_EVM_CHAIN ?? "baseSepolia") as EvmChainName;
const chain = evmChains[chainName];
if (!chain) throw new Error(`unknown VITE_EVM_CHAIN: ${chainName}`);

const adapter = createEvmAdapter({
  chain,
  rpcUrl: import.meta.env.VITE_RPC_URL || undefined,
  factory: import.meta.env.VITE_FACTORY_ADDRESS || undefined,
  compositeOracle: import.meta.env.VITE_COMPOSITE_ORACLE_ADDRESS || undefined,
  label: import.meta.env.VITE_CHAIN_LABEL || "Base Sepolia",
});

function ChainProvider({ children }: { children: ReactNode }) {
  return <EvmChainProvider adapter={adapter}>{children}</EvmChainProvider>;
}

/** On-chain drip: one wallet tx calling the deployment's ConfigurableTokenFaucet.dripAll. */
function useFaucet(): FaucetApi {
  const { send } = useIntentSender();
  return {
    enabled: adapter.info.capabilities.faucet,
    address: adapter.addresses.faucet,
    status: adapter.addresses.faucet
      ? (recipient) => readFaucetStatus(adapter.publicClient, adapter.addresses.faucet!, recipient as `0x${string}`)
      : undefined,
    drip: async (recipient: AccountId) => {
      try {
        const result = await send({ kind: "faucetDrip", recipient });
        return { ok: true, txId: result.txId };
      } catch (e) {
        return { ok: false, error: friendlyError(e) };
      }
    },
  };
}

export const impl = {
  adapter,
  ChainProvider,
  useWalletAddress,
  useWalletConnection,
  useIntentSender,
  useFaucet,
  friendlyError,
} satisfies ChainImpl;
