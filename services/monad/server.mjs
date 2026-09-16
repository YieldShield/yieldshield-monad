import { creationOptions } from "./creation.mjs";
import { discoverPools, protectionCapacity } from "./pools.mjs";
import { createCache } from "./cache.mjs";
import { createRateLimiter, requestIp } from "./request-limits.mjs";
import { fetchPythUpdate } from "./pyth.mjs";
import { throttledRpcFetch } from "./rpc-throttle.mjs";
import { retryRateLimitedReads } from "./rpc-retry.mjs";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, keccak256 } from "viem";
import { monadTestnet } from "viem/chains";
import { address, stringify, validateRegistry } from "./domain.mjs";
const config = JSON.parse(readFileSync(new URL("../../config/monad.json", import.meta.url)));
const registry = validateRegistry(JSON.parse(readFileSync(new URL("../../config/deployment.json", import.meta.url))));
const abis = JSON.parse(readFileSync(new URL("../../config/abis.json", import.meta.url)));
const rpc = createPublicClient({
  chain: monadTestnet,
  transport: retryRateLimitedReads(
    http(process.env.MONAD_RPC_URL || config.rpcUrl, {
      timeout: 12000,
      retryCount: 1,
      batch: { batchSize: 10, wait: 10 },
      fetchFn: throttledRpcFetch(),
    }),
  ),
});
const generic = parseAbi([
  "function getValue(address,uint256) view returns(uint256)",
  "function getPrice(address) view returns(uint256)",
  "function isPriceStale(address) view returns(bool,uint64)",
  "function previewDeposit(uint256) view returns(uint256)",
  "function previewRedeem(uint256) view returns(uint256)",
  "function previewUnstake(uint256) view returns(uint256)",
  "function convertToAssets(uint256) view returns(uint256)",
  "function maxRedeem(address) view returns(uint256)",
  "function getUnstakeRequest(address) view returns(uint128,uint64)",
  "function balanceOf(address) view returns(uint256)",
]);
const pythAbi = parseAbi([
  "function getPriceUnsafe(bytes32) view returns((int64 price,uint64 conf,int32 expo,uint256 publishTime))",
]);
const cached = createCache();
const get = (target, artifact, fn, args = [], blockNumber) =>
  rpc.readContract({ address: target, abi: abis[artifact] || generic, functionName: fn, args, blockNumber });
const same = (a, b) => a.toLowerCase() === b.toLowerCase();
async function checkedChain() {
  if ((await rpc.getChainId()) !== 10143) throw new Error("RPC chain mismatch");
}
async function verifiedCode() {
  return cached("code", 60000, async () => {
    await checkedChain();
    const pairs = Object.entries(registry.contracts);
    const results = await Promise.all(
      pairs.map(async ([name, v]) => {
        const code = await rpc.getCode({ address: v.address });
        return [name, Boolean(code && keccak256(code) === v.runtimeCodehash)];
      }),
    );
    return Object.fromEntries(results);
  });
}
async function snapshot() {
  return cached("status", 8000, async () => {
    await checkedChain();
    const [block, code] = await Promise.all([rpc.getBlock(), verifiedCode()]);
    const blockNumber = block.number;
    const sources = await Promise.all(
      registry.assets.map(async (a) => {
        try {
          if (a.runtimeCodehash) {
            const tokenCode = await rpc.getCode({ address: a.address, blockNumber });
            if (!tokenCode || keccak256(tokenCode) !== a.runtimeCodehash) throw new Error("Token code changed");
            if (a.implementation) {
              const pin = a.implementation;
              const [slot, implementationCode] = await Promise.all([
                rpc.getStorageAt({ address: a.address, slot: pin.slot, blockNumber }),
                rpc.getCode({ address: pin.address, blockNumber }),
              ]);
              if (
                !slot ||
                !same("0x" + slot.slice(-40), pin.address) ||
                !implementationCode ||
                keccak256(implementationCode) !== pin.runtimeCodehash
              )
                throw new Error("Issuer implementation changed");
            }
          }
          const [price, stale] = await Promise.all([
            get(a.feed, "", "getPrice", [a.address], blockNumber),
            get(a.feed, "", "isPriceStale", [a.address], blockNumber),
          ]);
          return {
            ...a,
            price: String(price),
            healthy: price > 0n && !stale[0],
            publishedAt: ["external-reference", "redemption-nav"].includes(a.kind) ? Number(stale[1]) : null,
            evaluatedAt: Number(block.timestamp),
            error: null,
          };
        } catch {
          return {
            ...a,
            price: null,
            healthy: false,
            publishedAt: null,
            evaluatedAt: Number(block.timestamp),
            error:
              a.kind === "external-reference" || a.kind === "redemption-nav"
                ? "A fresh, verified MON reference price is required."
                : "Price or vault state unavailable.",
          };
        }
      }),
    );
    const poolRegistry = await discoverPools(registry, get, (args) => rpc.getStorageAt(args), blockNumber);
    const markets = await Promise.all(
      poolRegistry.map(async (p) => {
        const shield = sources.find((a) => same(a.address, p.shieldedToken));
        const backing = sources.find((a) => same(a.address, p.backingToken));
        try {
          const methods = [
            "poolConfig",
            "totalProtectorTokens",
            "totalShieldedTokens",
            "totalShieldCollateralAmount",
            "totalValueAtDeposit",
            "totalProtectorShares",
            "paused",
            "shieldReceiptNFT",
            "protectorReceiptNFT",
            "COLLATERAL_RATIO",
            "COMMISSION_RATE",
            "POOL_FEE",
          ];
          const values = await Promise.all(methods.map((f) => get(p.address, "SplitRiskPool", f, [], blockNumber)));
          const [
            cfg,
            totalBacking,
            totalShielded,
            reserved,
            entryValue,
            juniorShares,
            paused,
            seniorNft,
            juniorNft,
            collateralBps,
            juniorFeeBps,
            creatorFeeBps,
          ] = values;
          const ready = Object.values(code).every(Boolean) && shield.healthy && backing.healthy && !paused;
          const capacity = protectionCapacity({
            totalBacking,
            totalShielded,
            reserved,
            entryValue,
            backingPrice: BigInt(backing.price || 0),
            shieldPrice: BigInt(shield.price || 0),
            backingDecimals: backing.decimals,
            shieldDecimals: shield.decimals,
            collateralBps,
            maxDeposit: cfg[1],
            maxTvl: cfg[4],
          });
          return {
            ...p,
            shield,
            backing,
            ready,
            paused,
            reason: ready
              ? null
              : !shield.healthy
                ? shield.error
                : !backing.healthy
                  ? backing.error
                  : paused
                    ? "Pool paused."
                    : "Contract verification failed.",
            totalBacking,
            totalShielded,
            reserved,
            entryValue,
            juniorShares,
            seniorNft,
            juniorNft,
            capacity,
            config: cfg,
            collateralBps,
            juniorFeeBps,
            creatorFeeBps,
            protocolFeeBps: cfg[8],
            actions: {
              protect: ready && capacity >= cfg[0],
              provide: ready,
              withdrawAsset: Object.values(code).every(Boolean) && shield.healthy && !paused,
              withdrawBacking: ready,
            },
          };
        } catch (error) {
          const rpcError = error.walk?.((cause) => typeof cause.code === "number");
          console.warn("Monad pool snapshot failed", p.id, error.name, error.shortMessage || error.message, {
            rpcCode: rpcError?.code ?? null,
          });
          return {
            ...p,
            shield,
            backing,
            ready: false,
            reason: "Pool state unavailable. Please refresh.",
            actions: { protect: false, provide: false, withdrawAsset: false, withdrawBacking: false },
          };
        }
      }),
    );
    let pyth = null;
    try {
      if (registry.referenceOracle !== "redstone")
        pyth = await rpc.readContract({
          address: config.pyth.address,
          abi: pythAbi,
          functionName: "getPriceUnsafe",
          args: [config.pyth.monUsdFeedId],
          blockNumber,
        });
    } catch {}
    return {
      schemaVersion: 5,
      creation: await creationOptions(registry, get, code, blockNumber),
      chainId: 10143,
      network: "Monad Testnet",
      observedAt: Date.now(),
      blockNumber,
      blockTimestamp: block.timestamp,
      deploymentStatus: registry.status,
      contractsVerified: Object.values(code).every(Boolean),
      code,
      assets: sources,
      markets,
      referenceOracle: registry.referenceOracle || "pyth",
      pyth,
      pythUpdateConfigured: Boolean(process.env.PYTH_API_KEY),
      registry,
      notice:
        "Testnet assets have no monetary value. Scenario prices are formulas; reference prices are observations. shMON NAV is not an executable quote.",
    };
  });
}
async function positions(owner) {
  return cached("positions:" + owner.toLowerCase(), 5000, async () => {
    const state = await snapshot();
    const result = [];
    for (const p of state.markets) {
      if (!p.seniorNft) throw new Error("Position data unavailable");
      for (const [side, nft, artifact] of [
        ["senior", p.seniorNft, "ShieldReceiptNFT"],
        ["junior", p.juniorNft, "ProtectorReceiptNFT"],
      ]) {
        const count = await get(nft, artifact, "nextTokenId");
        if (count > 2000n) throw new Error("Position index needs pagination");
        for (let start = 0n; start < count; start += 30n) {
          const ids = Array.from(
            { length: Number(count - start > 30n ? 30n : count - start) },
            (_, i) => start + BigInt(i),
          );
          const owners = await Promise.all(
            ids.map(async (id) => {
              try {
                return await get(nft, artifact, "ownerOf", [id]);
              } catch (e) {
                let err = e;
                while (err) {
                  if (err.data?.errorName === "ERC721NonexistentToken") return null;
                  err = err.cause;
                }
                throw e;
              }
            }),
          );
          for (let i = 0; i < ids.length; i++) {
            if (!owners[i] || !same(owners[i], owner)) continue;
            const id = ids[i],
              position = await get(nft, artifact, "getPosition", [id]);
            let available = null,
              commission = null,
              feeBaseline = null;
            if (side === "junior") {
              [available, commission] = await Promise.all([
                get(p.address, "SplitRiskPool", "getAvailableForWithdrawal", [id]),
                get(p.address, "SplitRiskPool", "getClaimableCommission", [id]),
              ]);
              position.amount = await get(p.address, "SplitRiskPool", "getProtectorPositionAmount", [id]);
            } else {
              feeBaseline = await get(p.address, "SplitRiskPool", "feeValueBaselineUsd", [id]);
            }
            result.push({
              key: `${p.id}:${side}:${id}`,
              poolId: p.id,
              pool: p.address,
              nft,
              id,
              side,
              position,
              available,
              commission,
              feeBaseline,
            });
          }
        }
      }
    }
    return { chainId: 10143, observedAt: Date.now(), owner, positions: result };
  });
}
async function pythUpdate() {
  return cached("pyth-update", 2000, async () => {
    const update = await fetchPythUpdate(process.env.PYTH_API_KEY, config.pyth.monUsdFeedId);
    return {
      chainId: 10143,
      pyth: config.pyth.address,
      feedId: config.pyth.monUsdFeedId,
      updateData: update.updateData,
      price: update.price,
      expiresAt: Date.now() + 30000,
    };
  });
}
const allowedOrigins = new Set(["https://monad.yieldshield.ai", "http://localhost:5173", "http://localhost:5174"]);
const allowedRequest = createRateLimiter();
// This service is exposed through Railway HTTPS networking, which owns X-Real-IP.
// Local/direct deployments ignore all caller-supplied proxy headers.
const trustRailwayProxy = Boolean(
  process.env.RAILWAY_PROJECT_ID && process.env.RAILWAY_ENVIRONMENT_ID && process.env.RAILWAY_SERVICE_ID,
);
export const server = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  if (allowedOrigins.has(req.headers.origin)) {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Vary", "Origin");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== "GET") {
    res.writeHead(405);
    res.end(stringify({ error: "Read-only API" }));
    return;
  }
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.url.length > 1500) throw new Error("Request too long");
    if (url.pathname === "/health" || url.pathname === "/api/health") {
      res.end(stringify({ status: "ok", service: "yieldshield-monad-api", chainId: 10143 }));
      return;
    }
    if (!allowedRequest(requestIp(req, { trustRailwayProxy }))) {
      res.writeHead(429);
      res.end(stringify({ error: "Please wait before refreshing." }));
      return;
    }
    let data;
    if (["/api/status", "/api/markets", "/api/protection-status"].includes(url.pathname)) data = await snapshot();
    else if (url.pathname === "/api/creation") {
      await checkedChain();
      const [block, code] = await Promise.all([rpc.getBlock(), verifiedCode()]);
      data = {
        chainId: 10143,
        observedAt: Date.now(),
        blockNumber: block.number,
        creation: await creationOptions(registry, get, code, block.number),
      };
    } else if (url.pathname === "/api/positions") data = await positions(address(url.searchParams.get("owner")));
    else if (url.pathname === "/api/pyth-update") data = await pythUpdate();
    else if (url.pathname === "/api/registry") data = registry;
    else {
      res.writeHead(404);
      data = { error: "Not found" };
    }
    res.end(stringify(data));
  } catch (e) {
    res.writeHead(e.status || 503);
    res.end(
      stringify({
        error:
          e.message?.startsWith("Invalid") || e.message?.startsWith("Pyth account")
            ? e.message
            : "Verified on-chain data is temporarily unavailable. Please refresh.",
      }),
    );
  }
});
if (process.env.NODE_ENV !== "test")
  server.listen(Number(process.env.PORT || 3001), "0.0.0.0", () =>
    console.log("YieldShield Monad read-only API listening"),
  );
