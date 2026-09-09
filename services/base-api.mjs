import http from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, fallback, http as rpcHttp } from "viem";
import { base, baseSepolia } from "viem/chains";
import { readSourceSnapshot, publicSnapshot } from "./base-market-data.mjs";
import {
  readProtectionStatus,
  publicProtectionStatus,
  unavailableProtectionStatus,
} from "./base-protection-status.mjs";
import { readDemoStatus, publicDemoStatus, unavailableDemoStatus } from "./base-demo-status.mjs";
// Log only known diagnostic labels: RPC errors may embed URLs, headers and call data.
const diagnosticErrorTypes = new Set([
  "Error",
  "AssertionError",
  "SyntaxError",
  "TimeoutError",
  "HttpRequestError",
  "RpcRequestError",
  "WebSocketRequestError",
  "SocketClosedError",
  "ContractFunctionExecutionError",
  "ContractFunctionRevertedError",
  "CallExecutionError",
  "BlockNotFoundError",
  "TransactionReceiptNotFoundError",
  "ChainMismatchError",
  "InvalidInputRpcError",
  "InvalidParamsRpcError",
  "InternalRpcError",
  "LimitExceededRpcError",
  "ResourceUnavailableRpcError",
  "UnknownRpcError",
]);
const diagnosticSystemCodes = new Set([
  "ERR_ASSERTION",
  "ENOENT",
  "EACCES",
  "EINVAL",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const diagnosticHttpStatuses = new Set([400, 401, 403, 404, 408, 413, 429, 500, 502, 503, 504]);

export function safeRefreshError(error) {
  const errorTypes = new Set(),
    errorCodes = new Set(),
    httpStatuses = new Set(),
    seen = new Set();
  let cause = error;
  while (cause && typeof cause === "object" && seen.size < 5 && !seen.has(cause)) {
    seen.add(cause);
    if (diagnosticErrorTypes.has(cause.name)) errorTypes.add(cause.name);
    if (
      diagnosticSystemCodes.has(cause.code) ||
      (Number.isInteger(cause.code) &&
        ([-32700, -32600, -32601, -32602, -32603].includes(cause.code) ||
          (cause.code >= -32099 && cause.code <= -32000)))
    )
      errorCodes.add(cause.code);
    if (diagnosticHttpStatuses.has(cause.status)) httpStatuses.add(cause.status);
    cause = cause.cause;
  }
  return {
    errorTypes: errorTypes.size ? [...errorTypes] : ["UnknownError"],
    ...(errorCodes.size ? { errorCodes: [...errorCodes] } : {}),
    ...(httpStatuses.size ? { httpStatuses: [...httpStatuses] } : {}),
  };
}

export function protectionStatusReady(status, { now = Date.now } = {}) {
  const current = Math.floor(now() / 1000);
  return (
    status?.deployment?.verified === true &&
    Number.isSafeInteger(status.evaluatedAt) &&
    Number.isSafeInteger(status.validUntil) &&
    status.evaluatedAt <= current &&
    current < status.validUntil
  );
}

const demoManifestPath = new URL("../contracts/deployments/base-sepolia-demo-v1.json", import.meta.url);
let protectionMode = existsSync(demoManifestPath) ? "demo" : "legacy";
const source = createPublicClient({
  chain: base,
  transport: rpcHttp(process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org", { timeout: 12000, retryCount: 1 }),
});
const destination = createPublicClient({
  chain: baseSepolia,
  transport: fallback(
    (process.env.BASE_SEPOLIA_RPC_URL ? [process.env.BASE_SEPOLIA_RPC_URL] : ["https://base-sepolia-rpc.publicnode.com","https://sepolia.base.org"])
      .map(url=>rpcHttp(url,{timeout:5000,retryCount:0,batch:{batchSize:20,wait:50}})),
    {rank:false,retryCount:0},
  ),
});
let protectionSnapshot,
  protectionUpdating = false;
async function refreshProtection() {
  if (protectionUpdating) return;
  protectionUpdating = true;
  const startedAt = Date.now();
  let stage = "manifest-read";
  try {
    const mode = existsSync(demoManifestPath) ? "demo" : "legacy";
    if (mode !== protectionMode) protectionSnapshot = undefined;
    protectionMode = mode;
    const manifest = JSON.parse(
      readFileSync(
        mode === "demo"
          ? demoManifestPath
          : new URL("../contracts/deployments/base-sepolia-alpha.json", import.meta.url),
        "utf8",
      ),
    );
    stage = "onchain-read";
    const cryptoPath = new URL("../contracts/deployments/base-sepolia-crypto-v1.json", import.meta.url);
    const extension = mode === "demo" && existsSync(cryptoPath) ? JSON.parse(readFileSync(cryptoPath, "utf8")) : null;
    if (extension?.status === "complete") {
      const { readCryptoExtensionStatus } = await import("./base-crypto-status.mjs");
      protectionSnapshot = await readCryptoExtensionStatus({
        client: destination,
        manifest: extension,
        readStockStatus: () => readDemoStatus({ client: destination, manifest }),
      });
    } else {
      protectionSnapshot =
        mode === "demo"
          ? await readDemoStatus({ client: destination, manifest })
          : await readProtectionStatus({ client: destination, manifest, sourceSnapshot: snapshot });
    }
  } catch (error) {
    protectionSnapshot = protectionMode === "demo" ? unavailableDemoStatus() : unavailableProtectionStatus();
    console.error(
      JSON.stringify({
        level: "error",
        message: "Protection status unavailable; actions remain blocked.",
        operation: "protection-status",
        mode: protectionMode,
        stage,
        durationMs: Date.now() - startedAt,
        ...safeRefreshError(error),
      }),
    );
  } finally {
    protectionUpdating = false;
  }
}
let snapshot,
  lastSuccess = 0,
  updating = false;
async function refresh() {
  if (updating) return;
  updating = true;
  const startedAt = Date.now();
  try {
    snapshot = await readSourceSnapshot(source);
    lastSuccess = Date.now();
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "Source data unavailable; cached observations expire after two minutes.",
        operation: "source-market-data",
        stage: "onchain-read",
        durationMs: Date.now() - startedAt,
        ...safeRefreshError(error),
      }),
    );
  } finally {
    updating = false;
  }
}
function send(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}
const server = http.createServer((req, res) => {
  const path = (req.url ?? "").split("?")[0];
  if (req.method === "GET" && path === "/health") {
    send(res, 200, {
      service: "YieldShield Base alpha",
      sourceReady: Date.now() - lastSuccess < 120000,
      relayEnabled: false,
      protectionReady: protectionStatusReady(protectionSnapshot),
    });
    return;
  }
  if (req.method === "GET" && (path === "/api/markets" || path === "/markets")) {
    try {
      if (!snapshot) throw new Error("Unavailable");
      send(res, 200, publicSnapshot(snapshot));
    } catch {
      send(res, 503, { error: "Live Base stock references are temporarily unavailable." });
    }
    return;
  }
  if (req.method === "GET" && path === "/api/protection-status") {
    try {
      send(
        res,
        200,
        protectionMode === "demo" ? publicDemoStatus(protectionSnapshot) : publicProtectionStatus(protectionSnapshot),
      );
    } catch {
      send(res, 200, protectionMode === "demo" ? unavailableDemoStatus() : unavailableProtectionStatus());
    }
    return;
  }
  send(res, 404, { error: "Not found" });
});
// Importing diagnostic helpers in tests must not start listeners or background RPC requests.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(Number(process.env.PORT ?? 3001), "0.0.0.0", () => console.log("YieldShield Base API listening"));
  void refresh();
  void refreshProtection();
  const interval = setInterval(() => void refresh(), 60000);
  // Refresh inside the adapter's 20-second evidence window so steady-state snapshots do not expire between reads.
  const protectionInterval = setInterval(() => void refreshProtection(), 10000);
  process.on("SIGTERM", () => {
    clearInterval(interval);
    clearInterval(protectionInterval);
    server.close();
  });
}
