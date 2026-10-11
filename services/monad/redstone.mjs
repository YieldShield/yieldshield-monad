import { concatHex, encodeFunctionData, keccak256, parseAbi, stringToHex } from "viem";
import { RedstoneUpdateError, validateRedstonePackages } from "./redstone-wire.mjs";
export { RedstoneUpdateError } from "./redstone-wire.mjs";

export const REDSTONE_MON_FEED_ID = stringToHex("MON", { size: 32 });
export const REDSTONE_UPDATE_ABI = parseAbi(["function updateDataFeedsValuesPartial(bytes32[] dataFeedIds)"]);
const SOURCE_ABI = parseAbi([
  "function decimals() view returns(uint8)",
  "function description() view returns(string)",
  "function getPriceFeedAdapter() view returns(address)",
  "function getDataFeedId() view returns(bytes32)",
]);
const ADAPTER_ABI = parseAbi([
  "function getUniqueSignersThreshold() view returns(uint8)",
  "function getAuthorisedSignerIndex(address) view returns(uint8)",
  "function getLastUpdateDetailsUnsafe(bytes32) view returns(uint256,uint256,uint256)",
]);
const GATEWAY = "https://oracle-gateway-api.b.redstone.finance";
const MAX_RESPONSE_BYTES = 262144;
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const failIdentity = () => {
  throw new RedstoneUpdateError("RedStone source identity changed. An integration review is required.");
};

async function verifyContract(client, address, codehash, implementation, blockNumber) {
  if (!implementation?.address || !implementation.slot || !implementation.runtimeCodehash) failIdentity();
  const [code, slot, implementationCode] = await Promise.all([
    client.getCode({ address, blockNumber }),
    client.getStorageAt({ address, slot: implementation.slot, blockNumber }),
    client.getCode({ address: implementation.address, blockNumber }),
  ]);
  if (
    !code ||
    keccak256(code) !== codehash ||
    !slot ||
    !same("0x" + slot.slice(-40), implementation.address) ||
    !implementationCode ||
    keccak256(implementationCode) !== implementation.runtimeCodehash
  )
    failIdentity();
}

/** Pins proxy AND implementation identities and confirms the original MON route. */
export async function verifyRedstoneDeployment(client, config, blockNumber) {
  if (
    config.gatewayUrl !== GATEWAY ||
    config.dataServiceId !== "redstone-primary-demo" ||
    !same(config.feedId, REDSTONE_MON_FEED_ID) ||
    config.uniqueSignersCount !== 2 ||
    config.maxAgeSeconds !== 120 ||
    !Array.isArray(config.authorizedSigners) ||
    config.authorizedSigners.length !== 5 ||
    (await client.getChainId()) !== 10143
  )
    failIdentity();
  await Promise.all([
    verifyContract(client, config.address, config.runtimeCodehash, config.sourceImplementation, blockNumber),
    verifyContract(client, config.adapter, config.adapterRuntimeCodehash, config.adapterImplementation, blockNumber),
  ]);
  const source = (functionName) =>
    client.readContract({ address: config.address, abi: SOURCE_ABI, functionName, blockNumber });
  const adapter = (functionName, args = []) =>
    client.readContract({ address: config.adapter, abi: ADAPTER_ABI, functionName, args, blockNumber });
  const [decimals, description, target, feed, threshold, ...signerIndices] = await Promise.all([
    source("decimals"),
    source("description"),
    source("getPriceFeedAdapter"),
    source("getDataFeedId"),
    adapter("getUniqueSignersThreshold"),
    ...config.authorizedSigners.map((signer) => adapter("getAuthorisedSignerIndex", [signer])),
  ]);
  if (
    decimals !== 8 ||
    description !== "RedStone Price Feed for MON" ||
    !same(target, config.adapter) ||
    !same(feed, REDSTONE_MON_FEED_ID) ||
    threshold !== 2 ||
    new Set(signerIndices).size !== 5 ||
    signerIndices.some((index) => !Number.isInteger(index) || index < 0 || index > 4)
  )
    failIdentity();
}

/** Fetches one fixed MON feed; no key, upstream errors or response headers leave the server. */
export async function fetchRedstonePackages(apiKey, { fetchImpl = fetch } = {}) {
  if (!apiKey) throw new RedstoneUpdateError("RedStone gateway access is not configured.");
  let response;
  try {
    response = await fetchImpl(
      `${GATEWAY}/v2/data-packages/latest-by-data-feeds/redstone-primary-demo?dataFeedIds=MON`,
      {
        headers: { "x-api-key": apiKey },
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
  } catch {
    throw new RedstoneUpdateError("The RedStone price service is temporarily unavailable.");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new RedstoneUpdateError(
      response.status === 401 || response.status === 403
        ? "RedStone gateway access was rejected. Check the server credential and MON feed permission."
        : "The RedStone price service is temporarily unavailable.",
    );
  }
  if (!response.body || Number(response.headers.get("content-length") || 0) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new RedstoneUpdateError("Invalid signed RedStone price update.");
  }
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > MAX_RESPONSE_BYTES) throw new Error("size");
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    await reader.cancel().catch(() => {});
    throw new RedstoneUpdateError("Invalid signed RedStone price update.");
  }
}

/** Produces a bounded, unsigned MON-only update after canonical eth_call verification. */
export async function prepareRedstoneUpdate({ client, config, apiKey, fetchImpl, now = Date.now }) {
  const response = await fetchRedstonePackages(apiKey, { fetchImpl });
  const observation = await validateRedstonePackages(response, config, now());
  const block = await client.getBlock();
  if (
    observation.timestampMilliseconds > Number(block.timestamp) * 1000 + 5000 ||
    Number(block.timestamp) * 1000 - observation.timestampMilliseconds > 30000
  )
    throw new RedstoneUpdateError("A fresh signed RedStone MON price is not available.");
  await verifyRedstoneDeployment(client, config, block.number);
  const [lastTimestamp] = await client.readContract({
    address: config.adapter,
    abi: ADAPTER_ABI,
    functionName: "getLastUpdateDetailsUnsafe",
    args: [REDSTONE_MON_FEED_ID],
    blockNumber: block.number,
  });
  if (BigInt(observation.timestampMilliseconds) <= lastTimestamp)
    throw new RedstoneUpdateError(
      "A newer signed RedStone MON price is not available. Refresh the current market status.",
    );
  const data = concatHex([
    encodeFunctionData({
      abi: REDSTONE_UPDATE_ABI,
      functionName: "updateDataFeedsValuesPartial",
      args: [[REDSTONE_MON_FEED_ID]],
    }),
    observation.payload,
  ]);
  try {
    const result = await client.call({
      to: config.adapter,
      data,
      value: 0n,
      account: "0x0000000000000000000000000000000000000001",
      blockNumber: block.number,
    });
    if (result.data && result.data !== "0x") throw new Error("Unexpected return data");
  } catch {
    throw new RedstoneUpdateError("The canonical RedStone adapter rejected this signed update.");
  }
  // Do not extend validity when data was slow to fetch or simulate.
  const issuedAt = now();
  if (issuedAt - observation.timestampMilliseconds > 30000)
    throw new RedstoneUpdateError("A fresh signed RedStone MON price is not available.");
  return {
    chainId: 10143,
    provider: "redstone",
    adapter: config.adapter,
    source: config.address,
    feedId: REDSTONE_MON_FEED_ID,
    publishedAt: observation.publishedAt,
    price: observation.price,
    signers: observation.signers,
    payload: observation.payload,
    expiresAt: Math.min(issuedAt + 30000, observation.timestampMilliseconds + 90000),
    verifiedAtBlock: String(block.number),
  };
}
