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
export type Registry = {
  chainId: number;
  status: string;
  contracts: Record<
    string,
    { address: Address; artifact: string; runtimeCodehash: `0x${string}`; txHash: `0x${string}` }
  >;
  assets: Asset[];
  pools: Market[];
  referenceStatus: string;
};
export type Snapshot = {
  schemaVersion: number;
  chainId: number;
  observedAt: number;
  blockNumber: string;
  blockTimestamp: string;
  contractsVerified: boolean;
  assets: Asset[];
  markets: Market[];
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
