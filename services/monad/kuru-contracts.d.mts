import type { Abi, Address, PublicClient, TransactionReceipt } from "viem";
export const KURU: {
  chainId: number;
  account: Address;
  router: Address;
  market: Address;
  usdc: Address;
  faucet: Address;
  native: Address;
  minInput: bigint;
  maxInput: bigint;
  slippageBps: bigint;
  quoteLifetimeMs: number;
};
export const kuruAccountAbi: Abi, kuruMarketAbi: Abi, kuruTokenAbi: Abi, kuruFaucetAbi: Abi;
export type KuruIdentity = { chainId: number; market: Address; blockNumber: bigint; timestamp: bigint };
export type KuruAccount = { account: Address; userId: bigint; usdc: bigint; mon: bigint; walletUsdc: bigint };
export type KuruQuote = KuruIdentity & {
  account: Address;
  userId: bigint;
  amountIn: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  quotedAt: number;
  expiresAt: number;
};
type Reader = Pick<PublicClient, "getChainId" | "getCode" | "getBlock" | "getStorageAt" | "readContract">;
export function isKuruTarget(address: Address): boolean;
export function verifyKuruTarget(client: Reader, address: Address, blockNumber?: bigint): Promise<void>;
export function readKuruIdentity(client: Reader, now?: number): Promise<KuruIdentity>;
export function readKuruAccount(client: Reader, account: Address, blockNumber?: bigint): Promise<KuruAccount>;
export function validateKuruInput(amountIn: bigint): bigint;
export function quoteKuruBuy(
  client: Reader,
  input: { account: Address; amountIn: bigint; now?: number },
): Promise<KuruQuote>;
export function buildKuruSwapRequest(
  quote: KuruQuote,
  account: Address,
  userId: bigint,
  now?: number,
): { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
export function confirmedKuruSwap(
  receipt: TransactionReceipt,
  quote: KuruQuote,
  account: Address,
): { amountInUsed: bigint; amountOut: bigint };
