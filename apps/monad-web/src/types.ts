import type { Address, Abi } from "viem";
export type Asset = {
  id: string;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
  feed: Address;
  artifact: string;
  external?: boolean;
  price: string | null;
  healthy: boolean;
  publishedAt: number | null;
  evaluatedAt: number;
  error: string | null;
};
export type Market = {
  id: string;
  address: Address;
  shieldedToken: Address;
  backingToken: Address;
  symbol: string;
  backingSymbol: string;
  environment: "scenario" | "reference";
  priceKind: string;
  shield: Asset;
  backing: Asset;
  ready: boolean;
  paused: boolean;
  reason: string | null;
  totalBacking?: string;
  totalShielded?: string;
  reserved?: string;
  entryValue?: string;
  juniorShares?: string;
  seniorNft?: Address;
  juniorNft?: Address;
  capacity?: string;
  config?: string[];
  actions: Record<string, boolean>;
};
export type FactoryVersion = {
  id: string;
  contract: string;
  router: string;
  environment: "scenario" | "reference";
  protectedAssets: string[];
  backingAssets: string[];
};
export type CreationOption = FactoryVersion & {
  factory: Address;
  available: boolean;
  reason: string | null;
  minimumUsd?: string;
  collateralBps: string;
  juniorFeeBps: string;
  creatorFeeBps: string;
  protocolFeeBps: string;
  minimumPoolTime: number;
  unlockDuration: number;
  backing: { id: string; available: boolean; reason: string | null; price?: string; bond?: string }[];
};
export type Registry = {
  factories: FactoryVersion[];
  chainId: number;
  status: string;
  contracts: Record<
    string,
    { address: Address; artifact: string; runtimeCodehash: `0x${string}`; txHash: `0x${string}` }
  >;
  assets: Asset[];
  pools: Market[];
  referenceStatus: string;
  referenceOracle?: "redstone" | "pyth";
};
export type Snapshot = {
  creation?: CreationOption[];
  schemaVersion: number;
  chainId: number;
  observedAt: number;
  blockNumber: string;
  blockTimestamp: string;
  contractsVerified: boolean;
  assets: Asset[];
  markets: Market[];
  referenceOracle: "redstone" | "pyth";
  pyth: any;
  pythUpdateConfigured: boolean;
  registry: Registry;
};
export type Position = {
  key: string;
  poolId: string;
  pool: Address;
  nft: Address;
  id: string;
  side: "senior" | "junior";
  position: {
    amount: string;
    depositTime: string;
    valueAtDeposit?: string;
    collateralAmount?: string;
    lastFeeClaimTime?: string;
    unlockRequestTime?: string;
  };
  available: string | null;
  commission: string | null;
  feeBaseline: string | null;
};
export type TxRequest = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
