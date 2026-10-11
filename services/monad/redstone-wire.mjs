import { concatHex, keccak256, numberToHex, parseUnits, recoverAddress, stringToHex } from "viem";

// RedStone protocol wire format: sorted bytes32 feed/value pairs, uint48 timestamp,
// uint32 value width, uint24 point count, then a 65-byte secp256k1 signature.
// Reference: @redstone-finance/protocol 1.0.0 DataPackage and RedstonePayload.
// No signing keys are accepted here. Signature recovery uses the existing viem dependency.
export const REDSTONE_MAX_PAYLOAD_BYTES = 32768;
export const REDSTONE_MAX_UPDATE_AGE_MS = 30000;
export const REDSTONE_MARKER = "0x000002ed57011e0000";
const MAX_RESPONSE_PACKAGES = 5;
const MAX_PACKAGE_POINTS = 64;
const MAX_MON_VALUE = (1n << 64n) - 1n;

export class RedstoneUpdateError extends Error {
  constructor(message) {
    super(message);
    this.name = "RedstoneUpdateError";
    this.status = 503;
  }
}
const reject = () => {
  throw new RedstoneUpdateError("Invalid signed RedStone price update.");
};
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();

function strictBase64(value, bytes) {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    reject();
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== bytes || decoded.toString("base64") !== value) reject();
  return "0x" + decoded.toString("hex");
}
function numericValue(point) {
  if (typeof point.value === "string") return strictBase64(point.value, 32);
  if (
    typeof point.value !== "number" ||
    !Number.isFinite(point.value) ||
    point.value < 0 ||
    (point.decimals !== undefined && point.decimals !== 8)
  )
    reject();
  // Reject precision loss instead of rounding an observation before verification.
  const text = String(point.value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) reject();
  const value = parseUnits(text, 8);
  if (value >= 1n << 256n) reject();
  return numberToHex(value, { size: 32 });
}
function unsignedPackage(pkg) {
  if (
    !pkg ||
    !Array.isArray(pkg.dataPoints) ||
    !pkg.dataPoints.length ||
    pkg.dataPoints.length > MAX_PACKAGE_POINTS ||
    !Number.isSafeInteger(pkg.timestampMilliseconds) ||
    pkg.timestampMilliseconds <= 0 ||
    pkg.timestampMilliseconds >= 2 ** 48
  )
    reject();
  const seen = new Set();
  let mon;
  const points = pkg.dataPoints
    .map((point) => {
      if (
        !point ||
        typeof point.dataFeedId !== "string" ||
        !/^[A-Za-z0-9_./-]{1,31}$/.test(point.dataFeedId) ||
        seen.has(point.dataFeedId)
      )
        reject();
      seen.add(point.dataFeedId);
      const id = stringToHex(point.dataFeedId, { size: 32 });
      const value = numericValue(point);
      if (point.dataFeedId === "MON") mon = BigInt(value);
      return { id, value };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (mon === undefined || mon <= 0n || mon > MAX_MON_VALUE) reject();
  return {
    price: mon,
    data: concatHex([
      ...points.flatMap(({ id, value }) => [id, value]),
      numberToHex(pkg.timestampMilliseconds, { size: 6 }),
      numberToHex(32, { size: 4 }),
      numberToHex(points.length, { size: 3 }),
    ]),
  };
}
function median(values) {
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2n;
}

/** Validates gateway observations and serializes only authenticated MON packages. */
export async function validateRedstonePackages(response, config, nowMs = Date.now()) {
  const packages = response?.MON;
  if (
    config.uniqueSignersCount !== 2 ||
    !Array.isArray(config.authorizedSigners) ||
    config.authorizedSigners.length !== 5 ||
    !Array.isArray(packages) ||
    packages.length < 2 ||
    packages.length > MAX_RESPONSE_PACKAGES
  )
    reject();
  const timestamp = packages[0]?.timestampMilliseconds;
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(timestamp) ||
    timestamp > nowMs + 5000 ||
    nowMs - timestamp > REDSTONE_MAX_UPDATE_AGE_MS
  )
    throw new RedstoneUpdateError("A fresh signed RedStone MON price is not available.");
  const seen = new Set();
  const validated = [];
  for (const pkg of packages) {
    if (pkg.timestampMilliseconds !== timestamp) reject();
    const { price, data } = unsignedPackage(pkg);
    const signature = strictBase64(pkg.signature, 65);
    if (![27, 28].includes(Number.parseInt(signature.slice(-2), 16))) reject();
    let signer;
    try {
      signer = await recoverAddress({ hash: keccak256(data), signature });
    } catch {
      reject();
    }
    if (
      !config.authorizedSigners.some((allowed) => same(allowed, signer)) ||
      seen.has(signer.toLowerCase()) ||
      (pkg.signerAddress !== undefined && !same(pkg.signerAddress, signer))
    )
      reject();
    seen.add(signer.toLowerCase());
    validated.push({ price, signer, bytes: concatHex([data, signature]) });
  }
  // The deployed consumer accepts two distinct signers. Match the official SDK's
  // closest-to-median selection instead of trusting gateway order or a claimed signer.
  const center = median(validated.map((pkg) => pkg.price));
  const distance = (value) => (value > center ? value - center : center - value);
  const selected = validated
    .sort((a, b) => {
      const left = distance(a.price),
        right = distance(b.price);
      return left < right ? -1 : left > right ? 1 : a.signer.toLowerCase().localeCompare(b.signer.toLowerCase());
    })
    .slice(0, config.uniqueSignersCount);
  const payload = concatHex([
    ...selected.map((pkg) => pkg.bytes),
    numberToHex(selected.length, { size: 2 }),
    "0x000000",
    REDSTONE_MARKER,
  ]);
  if ((payload.length - 2) / 2 > REDSTONE_MAX_PAYLOAD_BYTES) reject();
  return {
    payload,
    price: String(median(selected.map((pkg) => pkg.price))),
    timestampMilliseconds: timestamp,
    publishedAt: Math.floor(timestamp / 1000),
    signers: selected.map((pkg) => pkg.signer),
  };
}
