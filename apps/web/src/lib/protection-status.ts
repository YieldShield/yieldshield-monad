export type ActionStatus = {
  state: "available" | "blocked" | "unknown" | "position-required";
  blockers: { code: string; message: string }[];
};
export type ProtectionAsset = {
  symbol: string;
  sourceSymbol: string;
  name: string;
  decimals: number;
  executionPrice?: null | {
    kind: "deterministic-demo" | "test-vault-nav";
    priceUsd: number;
    evaluatedAt: number;
    marketObservation: false;
  };
  sourcePrice: null | {
    priceUsd: number;
    updatedAt: number;
    ageSeconds: number;
    freshForOpening: boolean;
    status: string;
  };
  relay: null | {
    observedAt: number | null;
    sourceBlockTimestamp: number | null;
    priceUpdatedAt: number | null;
    validUntil: number | null;
    fresh: boolean;
    issuerPaused: boolean | null;
    sequencerUp: boolean | null;
  };
  pool: {
    address?: string;
    state: "missing" | "ready" | "unknown";
    terms: null | {
      backingSymbol: string;
      commissionBps: number;
      poolFeeBps: number;
      protocolFeeBps: number;
      collateralRatioBps: number;
      protectedExitDelaySeconds: number;
      collateralUnlockSeconds: number;
    };
    capacity: null | { maxDepositBaseUnits: string; minDepositBaseUnits: string; requiresSimulation: boolean };
  };
  actions: Record<
    "openPosition" | "withdrawStock" | "protectedExit" | "provideCollateral" | "withdrawCollateral",
    ActionStatus
  >;
};
export type ProtectionStatus = {
  schemaVersion: 1 | 2;
  chainId: 84532;
  sourceChainId: 8453 | null;
  policy?: { kind: "continuous-demo"; priceSource: "deterministic-onchain-demo" };
  evaluatedAt: number;
  validUntil: number;
  destination: null | { blockNumber: string; blockHash: string; blockTimestamp: number };
  source: null | { blockNumber: string; blockHash: string; blockTimestamp: number; validUntil: number };
  deployment: {
    status: string;
    verified: boolean;
    contractsConfirmed: number;
    transactionsConfirmed: number;
    poolsReady: number;
    totalPools: number;
    faucetReady: boolean;
    steps: { code: string; complete: boolean; label: string }[];
  };
  session: {
    state: "open" | "closed" | "paused" | "unknown" | "continuous";
    opensAt: number | null;
    closesAt: number | null;
    nextOpenAt: number | null;
    checkedThrough: number | null;
  };
  faucet: {
    verified: boolean;
    address: string | null;
    configured: boolean;
    ready: boolean;
    cooldownSeconds: number | null;
    tokens: {
      symbol: string;
      sourceSymbol: string;
      decimals: number;
      address: string;
      enabled: boolean | null;
      funded: boolean | null;
      ready: boolean;
      dripAmountBaseUnits: string | null;
      balanceBaseUnits: string | null;
    }[];
  };
  assets: ProtectionAsset[];
};

export function statusIsFresh(
  data: Pick<ProtectionStatus, "evaluatedAt" | "validUntil"> | undefined,
  now = Date.now() / 1000,
): boolean {
  return (
    !!data &&
    Number.isSafeInteger(data.evaluatedAt) &&
    Number.isSafeInteger(data.validUntil) &&
    data.evaluatedAt <= now + 5 &&
    now < data.validUntil &&
    data.validUntil <= data.evaluatedAt + 120
  );
}

/** The API informs the UI; the adapter independently verifies every transaction. */
export function parseProtectionStatus(value: unknown, now = Date.now() / 1000): ProtectionStatus {
  const data = value as ProtectionStatus;
  const demo =
    data?.schemaVersion === 2 &&
    data.sourceChainId === null &&
    data.policy?.kind === "continuous-demo" &&
    data.policy.priceSource === "deterministic-onchain-demo";
  const crypto =
    demo &&
    Number.isSafeInteger(data.deployment?.totalPools) &&
    data.deployment.totalPools >= 13 &&
    data.deployment.totalPools <= 1004;
  const legacy = data?.schemaVersion === 1 && data.sourceChainId === 8453 && data.policy === undefined;
  if (
    !data ||
    (!demo && !legacy) ||
    data.chainId !== 84532 ||
    !statusIsFresh(data, now) ||
    !data.deployment ||
    !Array.isArray(data.deployment.steps) ||
    !data.session ||
    !(demo ? ["continuous", "unknown"] : ["open", "closed", "paused", "unknown"]).includes(data.session.state) ||
    !data.faucet ||
    !Array.isArray(data.faucet.tokens) ||
    !Array.isArray(data.assets) ||
    data.assets.length !== (crypto ? data.deployment.totalPools : 4)
  )
    throw new Error("Protection status could not be verified.");
  if (demo && data.source !== null) throw new Error("Demo prices cannot be presented as live market observations.");
  const address = (value: unknown): value is string =>
    typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value);
  const uint = (value: unknown) => typeof value === "string" && /^\d+$/.test(value) && value.length <= 78;
  const flag = (value: unknown) => value === null || typeof value === "boolean";
  if (data.faucet.address !== null && !address(data.faucet.address))
    throw new Error("Test-token dispenser could not be verified.");
  if (
    [data.faucet.verified, data.faucet.configured, data.faucet.ready, data.deployment.verified].some(
      (value) => typeof value !== "boolean",
    )
  )
    throw new Error("Deployment status could not be verified.");
  const expectedTokenDecimals: Record<string, number> = {
    tAAPLc: 8,
    tNVDAc: 8,
    tMETAc: 8,
    tGOOGLc: 8,
    TestUSDC: 6,
    ...(crypto ? { tWETH: 18, tcbBTC: 8, vWETH: 18, vUSDC: 6 } : {}),
  };
  const expectedFaucet = new Set(Object.keys(expectedTokenDecimals));
  const tokenAddresses = new Set<string>();
  if (data.faucet.tokens.length !== 0 && data.faucet.tokens.length !== expectedFaucet.size)
    throw new Error("Test-token inventory is incomplete.");
  for (const token of data.faucet.tokens) {
    if (
      !expectedFaucet.delete(token.symbol) ||
      !address(token.address) ||
      tokenAddresses.has(token.address.toLowerCase()) ||
      token.sourceSymbol !==
        (token.symbol === "TestUSDC" ? "USDC" : token.symbol.startsWith("v") ? token.symbol : token.symbol.slice(1)) ||
      token.decimals !== expectedTokenDecimals[token.symbol] ||
      !flag(token.enabled) ||
      !flag(token.funded) ||
      typeof token.ready !== "boolean" ||
      (token.dripAmountBaseUnits !== null && !uint(token.dripAmountBaseUnits)) ||
      (token.balanceBaseUnits !== null && !uint(token.balanceBaseUnits))
    )
      throw new Error("Test-token inventory could not be verified.");
    tokenAddresses.add(token.address.toLowerCase());
  }
  for (const key of ["opensAt", "closesAt", "nextOpenAt", "checkedThrough"] as const)
    if (data.session[key] !== null && (!Number.isSafeInteger(data.session[key]) || data.session[key]! <= 0))
      throw new Error("Session calendar could not be verified.");
  for (const key of ["contractsConfirmed", "transactionsConfirmed", "poolsReady", "totalPools"] as const)
    if (!Number.isSafeInteger(data.deployment[key]) || data.deployment[key] < 0)
      throw new Error("Deployment counts could not be verified.");
  if (
    data.deployment.steps.some(
      (step) => typeof step.code !== "string" || typeof step.label !== "string" || typeof step.complete !== "boolean",
    )
  )
    throw new Error("Deployment progress could not be verified.");
  const expected = new Set([
    "AAPLc:TestUSDC",
    "NVDAc:TestUSDC",
    "METAc:TestUSDC",
    "GOOGLc:TestUSDC",
    ...(crypto
      ? [
          "WETH:TestUSDC",
          "cbBTC:TestUSDC",
          "vWETH:TestUSDC",
          "WETH:vUSDC",
          "cbBTC:vUSDC",
          "AAPLc:vUSDC",
          "NVDAc:vUSDC",
          "METAc:vUSDC",
          "GOOGLc:vUSDC",
        ]
      : []),
  ]);
  const seenPools = new Set<string>();
  const missingSeedPairs = new Set(expected);
  for (const asset of data.assets) {
    const pair = `${asset.sourceSymbol}:${asset.pool?.terms?.backingSymbol ?? "TestUSDC"}`;
    const supportedPair = expected.has(pair) || (crypto && pair === "vWETH:vUSDC");
    if (crypto || asset.pool?.address != null) {
      if (!address(asset.pool?.address) || seenPools.has(asset.pool.address.toLowerCase()))
        throw new Error("Pool identity could not be verified.");
      seenPools.add(asset.pool.address.toLowerCase());
    }
    missingSeedPairs.delete(pair);
    if (demo) {
      if (asset.sourcePrice !== null || asset.relay !== null) throw new Error("Demo pricing provenance is invalid.");
      const price = asset.executionPrice;
      if (
        price &&
        (!["deterministic-demo", "test-vault-nav"].includes(price.kind) ||
          price.marketObservation !== false ||
          !Number.isFinite(price.priceUsd) ||
          price.priceUsd <= 0 ||
          !Number.isSafeInteger(price.evaluatedAt) ||
          price.evaluatedAt > data.evaluatedAt ||
          price.evaluatedAt <= 0)
      )
        throw new Error("Demo pricing could not be verified.");
      if (
        asset.actions?.openPosition?.state === "available" &&
        (!price || data.session.state !== "continuous" || !data.deployment.verified)
      )
        throw new Error("Continuous protection could not be verified.");
    } else if (asset.executionPrice != null) throw new Error("Unexpected demo price in a legacy deployment.");
    if (
      !(crypto ? supportedPair : expected.delete(pair)) ||
      asset.symbol !== (asset.sourceSymbol.startsWith("v") ? asset.sourceSymbol : `t${asset.sourceSymbol}`) ||
      !asset.pool ||
      !["missing", "ready", "unknown"].includes(asset.pool.state)
    )
      throw new Error("Stock status could not be verified.");
    for (const action of [
      "openPosition",
      "withdrawStock",
      "protectedExit",
      "provideCollateral",
      "withdrawCollateral",
    ] as const) {
      const status = asset.actions?.[action];
      if (
        !status ||
        !["available", "blocked", "unknown", "position-required"].includes(status.state) ||
        !Array.isArray(status.blockers) ||
        status.blockers.some((b) => typeof b.code !== "string" || typeof b.message !== "string") ||
        (status.state === "available" && status.blockers.length > 0)
      )
        throw new Error("Action availability could not be verified.");
    }
    if (
      asset.sourcePrice &&
      (!Number.isFinite(asset.sourcePrice.priceUsd) ||
        asset.sourcePrice.priceUsd <= 0 ||
        !Number.isSafeInteger(asset.sourcePrice.updatedAt) ||
        asset.sourcePrice.updatedAt > data.evaluatedAt)
    )
      throw new Error("Stock price could not be verified.");
  }
  if (missingSeedPairs.size !== 0) throw new Error("Registered pool status is incomplete.");
  return data;
}

export function sessionTime(timestamp: number | null | undefined): string {
  return timestamp
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(timestamp * 1000)
    : "Not yet available";
}
export function countdown(timestamp: number, now = Date.now() / 1000): string {
  const seconds = Math.max(0, Math.ceil(timestamp - now));
  if (!seconds) return "Checking current session…";
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}
