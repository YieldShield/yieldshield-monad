import type { Abi, Address, TransactionReceipt } from "viem";
export const KURU: {
  chainId: number;
  account: Address;
  router: Address;
  market: Address;
  usdc: Address;
  limiter: Address;
  native: Address;
  minInput: bigint;
  maxInput: bigint;
  slippageBps: bigint;
  quoteLifetimeMs: number;
};
export const KURU_LEGACY: { account: Address; usdc: Address; native: Address };
export const kuruAccountAbi: Abi, kuruMarketAbi: Abi, kuruTokenAbi: Abi, kuruLegacyAccountAbi: Abi, kuruLimiterAbi: Abi;
export type KuruIdentity = { chainId: number; market: Address; blockNumber: bigint; timestamp: bigint };
export type KuruAccount = { account: Address; userId: bigint; usdc: bigint; mon: bigint; walletUsdc: bigint };
export type KuruQuote = KuruIdentity & {
  account: Address;
  userId: bigint;
  amountIn: bigint;
  amountInUsed: bigint;
  inputRoundingLimit: bigint;
  amountOut: bigint;
  minAmountOut: bigint;
  quotedAt: number;
  expiresAt: number;
};
// The browser and standalone API install their own viem copies. Describe the
// reads this module uses without comparing their recursive client generics.
type Reader = {
  getChainId(): Promise<number>;
  getCode(parameters: { address: Address; blockNumber?: bigint }): Promise<`0x${string}` | undefined>;
  getBlock(): Promise<{ number: bigint | null; timestamp: bigint }>;
  getStorageAt(parameters: { address: Address; slot: `0x${string}`; blockNumber?: bigint }): Promise<`0x${string}` | undefined>;
  readContract(parameters: {
    address: Address;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    blockNumber?: bigint;
  }): Promise<unknown>;
};
export function isKuruTarget(address: Address): boolean;
export function verifyKuruTarget(client: Reader, address: Address, blockNumber?: bigint): Promise<void>;
export function readKuruIdentity(client: Reader, now?: number): Promise<KuruIdentity>;
export function readKuruAccount(client: Reader, account: Address, blockNumber?: bigint): Promise<KuruAccount>;
type Request = { address: Address; abi: Abi; functionName: string; args: readonly unknown[] };
export function buildKuruDepositRequest(account: Address, amount: bigint): Request;
export function buildKuruWithdrawalRequest(state: KuruAccount, token: Address, amount: bigint): Request;
export function readKuruWithdrawalReadiness(
  client: Reader,
  token: Address,
  amount: bigint,
  blockNumber?: bigint,
): Promise<{ requiredUsd36: bigint; availableUsd36: bigint }>;
export type LegacyKuruAccount = { account: Address; usdc: bigint; mon: bigint; walletUsdc: bigint };
export function readLegacyKuruAccount(client: Reader, account: Address): Promise<LegacyKuruAccount>;
export function buildLegacyKuruWithdrawalRequest(state: LegacyKuruAccount, token: Address, amount: bigint): Request;
export function validateKuruInput(amountIn: bigint): bigint;
export function quoteKuruBuy(
  client: Reader,
  input: { account: Address; amountIn: bigint; now?: number },
): Promise<KuruQuote>;
export function prepareKuruFunding(
  client: Reader,
  input: { account: Address; amountIn: bigint; now?: number },
): Promise<KuruQuote>;
export function validateKuruQuote(quote: KuruQuote, account: Address, userId: bigint, now?: number): void;
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
