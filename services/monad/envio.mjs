import { decodeEventLog, parseAbi, toEventSelector } from "viem";

// These signatures match EventsLib.sol. This is a transaction history, never a
// source of balances, current receipt ownership, quotes or withdrawal rights.
export const activityAbi = parseAbi([
  "event ShieldedAssetDeposited(address indexed depositor,address indexed asset,uint256 amount,uint256 receiptTokenId)",
  "event ProtectorAssetDeposited(address indexed depositor,address indexed asset,uint256 amount,uint256 receiptTokenId)",
  "event ShieldedWithdrawal(address indexed withdrawer,uint256 amount,address preferredAsset)",
  "event ProtectorAssetWithdrawn(address indexed user,address indexed asset,uint256 assets,uint256 shares)",
  "event UnlockProcessStarted(address indexed protector,uint256 indexed tokenId,uint256 amount)",
  "event UnlockProcessCancelled(address indexed protector,uint256 indexed tokenId)",
  "event CommissionClaimed(address indexed protectorAddress,uint256 indexed tokenId,uint256 amount)",
]);
const topics = activityAbi.map(toEventSelector);
const hash = /^0x[0-9a-fA-F]{64}$/;
const lower = (value) => String(value).toLowerCase();
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const decimal = (value) => (value == null ? null : String(value));

export function activityQuery(pools, fromBlock, toBlock) {
  return {
    from_block: fromBlock,
    to_block: toBlock,
    logs: [{ address: pools.map((pool) => lower(pool.address)), topics: [topics] }],
    field_selection: {
      block: ["number", "hash", "timestamp"],
      log: [
        "block_number",
        "block_hash",
        "log_index",
        "transaction_hash",
        "address",
        "data",
        "topic0",
        "topic1",
        "topic2",
        "topic3",
        "removed",
      ],
    },
    max_num_logs: 2500,
  };
}

function decodeActivity(log, block, pool, assets, observedAt) {
  if (log.removed) throw new Error("Removed event in activity response");
  if (
    !hash.test(log.transaction_hash) ||
    !hash.test(log.block_hash) ||
    !integer(log.log_index) ||
    !block ||
    lower(block.hash) !== lower(log.block_hash) ||
    !integer(block.timestamp) ||
    block.timestamp > 8640000000000 ||
    // Tolerate a small testnet clock skew, never an unrenderable or remote-future date.
    block.timestamp > Math.floor(observedAt / 1000) + 60
  )
    throw new Error("Invalid activity event provenance");
  const { eventName, args } = decodeEventLog({
    abi: activityAbi,
    data: log.data,
    topics: [log.topic0, log.topic1, log.topic2, log.topic3].filter((topic) => topic != null),
    strict: true,
  });
  const descriptions = {
    ShieldedAssetDeposited: ["protected", args.depositor, args.asset, args.amount, args.receiptTokenId],
    ProtectorAssetDeposited: ["provided", args.depositor, args.asset, args.amount, args.receiptTokenId],
    ShieldedWithdrawal: [
      lower(args.preferredAsset) === lower(pool.backingToken) ? "protection-used" : "asset-withdrawn",
      args.withdrawer,
      args.preferredAsset,
      args.amount,
    ],
    ProtectorAssetWithdrawn: ["backing-withdrawn", args.user, args.asset, args.assets],
    UnlockProcessStarted: ["notice-started", args.protector, pool.backingToken, args.amount, args.tokenId],
    UnlockProcessCancelled: ["notice-cancelled", args.protector, null, null, args.tokenId],
    CommissionClaimed: ["commission-claimed", args.protectorAddress, pool.shieldedToken, args.amount, args.tokenId],
  };
  const [kind, actor, assetAddress, amount, receiptId] = descriptions[eventName];
  const asset = assetAddress ? assets.get(lower(assetAddress)) : null;
  // Unknown token metadata must never be guessed, e.g. displaying 18-decimal
  // amounts as six-decimal stablecoins. Reject a malformed/foreign event page.
  if (assetAddress && !asset) throw new Error("Unknown activity asset");
  return {
    id: `${log.transaction_hash}:${log.log_index}`,
    kind,
    eventName,
    poolId: pool.id,
    pool: pool.address,
    poolLabel: `${pool.symbol} / ${pool.backingSymbol}`,
    environment: pool.environment,
    actor,
    asset: asset ? { address: asset.address, symbol: asset.symbol, decimals: asset.decimals } : null,
    amount: decimal(amount),
    receiptId: decimal(receiptId),
    transactionHash: log.transaction_hash,
    blockNumber: log.block_number,
    blockHash: log.block_hash,
    logIndex: log.log_index,
    timestamp: block.timestamp,
  };
}

async function limitedJson(response, maxBytes) {
  if (!response.ok) throw new Error(`Envio request failed (${response.status})`);
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("Envio response too large");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Envio response too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createEnvioActivity({ registry, config, token, fetchFn = fetch, now = Date.now }) {
  if (
    registry.chainId !== 10143 ||
    config.chainId !== 10143 ||
    config.endpoint !== "https://monad-testnet.hypersync.xyz"
  )
    throw new Error("Wrong Envio activity network");
  if (!registry.pools.length || registry.pools.length > 100) throw new Error("Invalid activity pool scope");
  const pools = new Map(registry.pools.map((pool) => [lower(pool.address), pool]));
  const assets = new Map(registry.assets.map((asset) => [lower(asset.address), asset]));
  let snapshot = null;
  let pending = null;
  let lastAttempt = null;
  let failed = false;
  const requests = [];

  async function request(path, query) {
    const time = now();
    while (requests.length && requests[0] <= time - 86400000) requests.shift();
    if (
      requests.length >= config.maxRequestsPerDay ||
      requests.filter((sentAt) => sentAt > time - 3600000).length >= config.maxRequestsPerHour
    )
      throw new Error("Activity request budget reached");
    requests.push(time);
    const response = await fetchFn(`${config.endpoint}${path}`, {
      method: query ? "POST" : "GET",
      headers: { Authorization: `Bearer ${token}`, ...(query ? { "Content-Type": "application/json" } : {}) },
      ...(query ? { body: JSON.stringify(query) } : {}),
      signal: AbortSignal.timeout(config.requestTimeoutMs),
      redirect: "error",
    });
    return limitedJson(response, config.maxResponseBytes);
  }

  async function scan() {
    const { height } = await request("/height");
    if (!integer(height) || height < config.startBlock + config.confirmationBlocks)
      throw new Error("Envio archive behind deployment");
    // The exclusive upper bound stays fixed across pages. A full replacement
    // avoids keeping orphaned events after reorgs or partial/failed refreshes.
    const end = height - config.confirmationBlocks + 1;
    let cursor = config.startBlock;
    let guard = null;
    const events = new Map();
    for (let pageNumber = 0; cursor < end && pageNumber < config.maxPages; pageNumber++) {
      const page = await request("/query", activityQuery(registry.pools, cursor, end));
      if (!integer(page.next_block) || page.next_block <= cursor || page.next_block > end)
        throw new Error("Invalid Envio pagination");
      if (
        guard &&
        page.rollback_guard &&
        page.rollback_guard.first_block_number === guard.block_number + 1 &&
        lower(page.rollback_guard.first_parent_hash) !== lower(guard.hash)
      )
        throw new Error("Envio reorganization during scan");
      guard = page.rollback_guard || null;
      if (!page.data || !Array.isArray(page.data.blocks) || !Array.isArray(page.data.logs))
        throw new Error("Invalid Envio data");
      const blocks = new Map(page.data.blocks.map((block) => [block.number, block]));
      for (const log of page.data.logs) {
        const pool = pools.get(lower(log.address));
        if (!pool || !integer(log.block_number) || log.block_number < cursor || log.block_number >= page.next_block)
          throw new Error("Activity event outside requested scope");
        const event = decodeActivity(log, blocks.get(log.block_number), pool, assets, now());
        if (events.has(event.id)) throw new Error("Duplicate activity event");
        events.set(event.id, event);
        if (events.size > config.maxEvents) throw new Error("Activity index capacity reached");
      }
      cursor = page.next_block;
    }
    if (cursor < end) throw new Error("Activity scan incomplete");
    return {
      observedAt: now(),
      indexedThrough: end - 1,
      sourceHeight: height,
      events: [...events.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
    };
  }

  function refresh() {
    if (pending) return pending;
    if (!token) return Promise.resolve();
    lastAttempt = now();
    pending = scan()
      .then((next) => {
        snapshot = next;
        failed = false;
      })
      .catch(() => {
        // Provider errors may contain credentials or request details. Return a
        // stable, non-sensitive status; never disguise an outage as empty history.
        failed = true;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  function read({ owner, poolId, limit = 20 } = {}) {
    if (owner != null && !/^0x[0-9a-fA-F]{40}$/.test(owner)) throw new Error("Invalid wallet address");
    if (poolId != null && !registry.pools.some((pool) => pool.id === poolId)) throw new Error("Invalid activity pool");
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("Invalid activity limit");
    if (token && (lastAttempt == null || now() - lastAttempt >= config.refreshMs)) void refresh();
    const stale = snapshot && (failed || now() < snapshot.observedAt || now() - snapshot.observedAt > config.staleMs);
    const status = !token
      ? "not-configured"
      : snapshot
        ? stale
          ? "stale"
          : "ready"
        : failed
          ? "unavailable"
          : "indexing";
    const matching = (snapshot?.events || []).filter(
      (event) => (!owner || lower(event.actor) === lower(owner)) && (!poolId || event.poolId === poolId),
    );
    return {
      chainId: 10143,
      source: "Envio HyperSync",
      status,
      complete: status === "ready",
      observedAt: snapshot?.observedAt ?? null,
      indexedThrough: snapshot?.indexedThrough ?? null,
      sourceHeight: snapshot?.sourceHeight ?? null,
      startBlock: config.startBlock,
      confirmationBlocks: config.confirmationBlocks,
      scope: "registered-deployment-pools",
      poolCount: pools.size,
      totalEvents: matching.length,
      hasMore: matching.length > limit,
      events: matching.slice(0, limit),
    };
  }
  return { read, refresh };
}
