/**
 * The chain port — the contract every chain adapter implements. The web app depends ONLY on
 * these interfaces (plus the view models); each chain (Solana, EVM/Robinhood, …) ships an
 * adapter package that fulfils them. One deployment bundles exactly one adapter.
 *
 * Split of responsibilities:
 *   - `ChainReader` — plain async reads returning view models (framework-free).
 *   - `TxIntent`   — user operations as data; the adapter maps an intent to its chain's
 *                    transaction(s), including chain-specific preludes (e.g. ERC-20 approvals).
 *   - React surface — each adapter package also exports a provider + hooks matching the
 *                    `WalletConnectionApi` / `IntentSenderApi` shapes below.
 */
import type { AccountId, PoolId, PositionId, TokenId, TxId } from "./ids.js";
import type { ActivityEntry, OwnerPositions, PoolData, SeedToken, TokenBalance } from "./views.js";

// --- Chain identity -----------------------------------------------------------

export type ChainFamily = "solana" | "evm";

export type ChainCapabilities = {
  /** Whether this deploy exposes a test-token faucet flow. */
  faucet: boolean;
  /** Whether deposits require a separate token-approval step (shown as multi-step progress). */
  needsTokenApprovals: boolean;
};

export type ChainInfo = {
  family: ChainFamily;
  /** Short chain badge label shown in the UI ("Solana", "Robinhood"). */
  label: string;
  /** Network qualifier for badges/copy ("devnet", "testnet", "mainnet", "localnet"). */
  network: string;
  /** Explorer link for a transaction. */
  explorerTxUrl: (tx: TxId) => string;
  /** Core protocol program/contract identifier, for display on pool detail. */
  protocolId: string;
  /** Display name of the oracle stack ("Pyth + Switchboard", "Chainlink"). */
  oracleLabel: string;
  capabilities: ChainCapabilities;
};

// --- Reads ---------------------------------------------------------------------

export type DemoMarket = {
  chainId: 84532;
  exchange: string;
  ready: boolean;
  evaluatedAt: number;
  validUntil: number;
  feeBps: number;
  maxStockAmount: bigint;
  assets: Array<{
    token: TokenId;
    symbol: string;
    name: string;
    decimals: number;
    priceUsd8: bigint;
    maxAmount?: bigint;
  }>;
  quoteToken: { token: TokenId; symbol: "TestUSDC"; decimals: 6 };
};
export type DemoTradeRequest = { asset: TokenId; side: "buy" | "sell"; amount: bigint; owner?: AccountId };
export type DemoTradeQuote = DemoTradeRequest & {
  chainId: 84532;
  exchange: string;
  inputToken: TokenId;
  outputToken: TokenId;
  inputAmount: bigint;
  outputAmount: bigint;
  feeAmount: bigint;
  priceUsd8: bigint;
  quotedAt: number;
  validUntil: number;
};

export type DemoVault = {
  address: string;
  symbol: string;
  underlying: string;
  underlyingSymbol: string;
  decimals: number;
  totalAssets: bigint;
  totalShares: bigint;
  assetsPerShare: bigint;
  evaluatedAt: number;
  validUntil: number;
};

export interface ChainReader {
  /** Verified creator-configurable terms and the protocol defaults that new pools enforce. */
  getPoolCreationOptions?(): Promise<PoolCreationOptions>;
  getDemoVaults?(): Promise<DemoVault[]>;
  getDemoVaultQuote?(
    vault: string,
    action: "deposit" | "redeem",
    amount: bigint,
  ): Promise<{ amountOut: bigint; validUntil: number }>;
  /** Test-only executable venue. No claim of real equity price discovery. */
  getDemoMarket?(): Promise<DemoMarket>;
  getDemoTradeQuote?(request: DemoTradeRequest): Promise<DemoTradeQuote>;
  /** Every pool, fully assembled for display (stats + token metadata + oracle health). */
  loadPools(): Promise<PoolData[]>;
  /** All of an owner's positions, split by side. */
  getOwnerPositions(owner: AccountId): Promise<OwnerPositions>;
  /** The protocol's whitelisted token set (sorted by symbol). */
  listWhitelistedTokens(): Promise<SeedToken[]>;
  /** An owner's balance of one token (base units); null when the owner holds no account for it. */
  getTokenBalance(owner: AccountId, token: TokenId): Promise<bigint | null>;
  /** An owner's balance of every whitelisted token (0 balances included). */
  getBalances(owner: AccountId): Promise<TokenBalance[]>;
  /** Verified backing-token payout for a protected exit; unsupported adapters omit this capability. */
  getProtectedExitQuote?(
    position: PositionId,
  ): Promise<{ amount: bigint; token: TokenId; blockNumber: bigint; quotedAt: bigint }>;
  /** The owner's recent protocol activity, newest first. */
  getActivity(owner: AccountId): Promise<ActivityEntry[]>;
}

// --- Transaction intents ---------------------------------------------------------

export type CreatePoolIntentParams = {
  shieldedToken: TokenId;
  backingToken: TokenId;
  /** Basis points (10_000 = 100%). */
  collateralRatioBp: number;
  commissionRateBp: number;
  poolFeeBp: number;
  protocolFeeBp: number;
  /** USD, 8 decimals. 0n = uncapped. */
  maxTvlUsd: bigint;
  /** Seconds. */
  minimumPoolTime: number;
  unlockDuration: number;
  shieldTransferLock: number;
  protectorTransferLock: number;
  /** Creation bond in backing-token base units (default 0). */
  creationBondAmount?: bigint;
};

export type PoolCreationOptions = {
  chainId: 84532;
  factory: string;
  protectedAssets: SeedToken[];
  backingAssets: Array<SeedToken & { minimumBondAmount: bigint }>;
  minimumBondUsd: bigint;
  bounds: {
    commissionMinBp: number;
    commissionMaxBp: number;
    poolFeeMinBp: number;
    poolFeeMaxBp: number;
    collateralMinBp: number;
    collateralMaxBp: number;
  };
  fixed: Pick<
    CreatePoolIntentParams,
    | "protocolFeeBp"
    | "maxTvlUsd"
    | "minimumPoolTime"
    | "unlockDuration"
    | "shieldTransferLock"
    | "protectorTransferLock"
  >;
  activePools: number;
  maxActivePools: number;
  evaluatedAt: number;
  validUntil: number;
};

/**
 * A user operation as data. Token/pool ids ride along so adapters can build transactions
 * without re-fetching state the UI already holds.
 */
export type TxIntent =
  | { kind: "vaultDeposit" | "vaultRedeem" | "fundTestYield"; vault: TokenId; amount: bigint; minOut: bigint }
  | { kind: "demoTrade"; asset: TokenId; side: "buy" | "sell"; amount: bigint; limit: bigint; deadline: bigint }
  | {
      kind: "depositShielded";
      pool: PoolId;
      shieldedToken: TokenId;
      backingToken: TokenId;
      amount: bigint;
      minReceived: bigint;
    }
  | { kind: "depositBacking"; pool: PoolId; backingToken: TokenId; amount: bigint; minReceived: bigint }
  | {
      kind: "activateShielded";
      pool: PoolId;
      shieldedToken: TokenId;
      backingToken: TokenId;
      position: PositionId;
      minOut: bigint;
    }
  | { kind: "withdrawShielded"; pool: PoolId; shieldedToken: TokenId; position: PositionId; minOut: bigint }
  | {
      kind: "partialWithdrawShielded";
      pool: PoolId;
      shieldedToken: TokenId;
      position: PositionId;
      amount: bigint;
      minOut: bigint;
    }
  | { kind: "withdrawProtector"; pool: PoolId; backingToken: TokenId; position: PositionId; minOut: bigint }
  | {
      kind: "partialWithdrawProtector";
      pool: PoolId;
      backingToken: TokenId;
      position: PositionId;
      amount: bigint;
      minOut: bigint;
    }
  | { kind: "startUnlock"; position: PositionId }
  | { kind: "cancelUnlock"; position: PositionId }
  | { kind: "claimCommission"; pool: PoolId; shieldedToken: TokenId; position: PositionId }
  | { kind: "claimRewards"; pool: PoolId; shieldedToken: TokenId; position: PositionId }
  | { kind: "createPool"; params: CreatePoolIntentParams }
  /** Test-token drip from an ON-CHAIN faucet (testnets with one). Chains without an on-chain
   * faucet implement the faucet capability off-band instead (see FaucetApi). */
  | { kind: "faucetDrip"; recipient?: AccountId };

export type TxResult = {
  txId: TxId;
  /** Set when the intent created a position (deposits; partial withdrawals on chains that re-mint). */
  positionId?: PositionId;
  /** Set when the intent created a pool. */
  poolId?: PoolId;
};

// --- Submission lifecycle -----------------------------------------------------------

/** UI-visible transaction lifecycle: idle → building → submitted → confirming → confirmed | failed. */
export type TxPhase = "idle" | "building" | "submitted" | "confirming" | "confirmed" | "failed";

/** The in-flight phases an adapter reports while `send` runs. */
export type SendPhase = "building" | "submitted" | "confirming";

export type SendOptions = {
  onPhase?: (phase: SendPhase) => void;
  /** One-based step progress; txId is emitted once a hash is known, including a repriced replacement. */
  onStep?: (step: { index: number; total: number; label: string; txId?: TxId; awaitingWallet?: boolean }) => void;
};

/**
 * Shape of the adapter's send hook (`useIntentSender()`). `send` resolves once the transaction
 * is confirmed on chain and throws on failure/rejection (map with the adapter's `friendlyError`).
 */
export type IntentSenderApi = {
  owner: AccountId | null;
  send: (intent: TxIntent, opts?: SendOptions) => Promise<TxResult>;
};

// --- Faucet ---------------------------------------------------------------------------

export type FaucetResult = { ok: boolean; txId?: TxId; error?: string };

/**
 * Shape of the app's faucet hook (`useFaucet()`), provided per chain implementation: an on-chain
 * drip tx on EVM testnets, an operator-run HTTP drip service on Solana devnet.
 */
export type FaucetStatus = {
  address: string;
  recipient: string;
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  evaluatedAt: number;
  validUntil: number;
  nativeBalance: bigint;
  configured: boolean;
  ready: boolean;
  tokens: Array<{
    address: string;
    enabled: boolean;
    funded: boolean;
    canDrip: boolean;
    dripAmount: bigint;
    faucetBalance: bigint;
    nextDripTime: number;
  }>;
};

export type FaucetApi = {
  enabled: boolean;
  address?: string;
  status?: (recipient: AccountId) => Promise<FaucetStatus>;
  drip: (recipient: AccountId) => Promise<FaucetResult>;
};

// --- Wallet connection ----------------------------------------------------------------

export type WalletConnector = { id: string; name: string };

/** Shape of the adapter's wallet hook (`useWalletConnection()`). */
export type WalletConnectionApi = {
  /** False until persisted-session hydration resolves (avoid UI flashes before it). */
  isReady: boolean;
  connected: boolean;
  connecting: boolean;
  address: AccountId | null;
  /** Display name of the connected wallet, when known. */
  walletName: string | null;
  connectors: WalletConnector[];
  connect: (connectorId: string) => Promise<void>;
  disconnect: () => void | Promise<void>;
};

// --- Adapter ---------------------------------------------------------------------------

/** The framework-free half of an adapter (the React surface is exported per package). */
export type ChainAdapter = {
  info: ChainInfo;
  reader: ChainReader;
};
