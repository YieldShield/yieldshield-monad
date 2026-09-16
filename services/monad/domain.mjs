export const CHAIN_ID = 10143;
export const PRICE_KINDS = new Set([
  "synthetic",
  "external-reference",
  "redemption-nav",
  "test-vault-nav",
  "synthetic-unit",
]);
export function address(value) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error("Invalid wallet address");
  return value;
}
export const stringify = (value) => JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
export function validateRegistry(r) {
  if (r.chainId !== CHAIN_ID || !Array.isArray(r.assets) || !Array.isArray(r.pools))
    throw new Error("Wrong deployment registry");
  for (const a of r.assets) {
    address(a.address);
    if (!PRICE_KINDS.has(a.kind) || !Number.isInteger(a.decimals) || a.decimals < 0 || a.decimals > 18)
      throw new Error("Invalid asset registry");
  }
  const ids = new Set();
  for (const p of r.pools) {
    address(p.address);
    if (
      ids.has(p.id) ||
      !r.assets.some((a) => a.address.toLowerCase() === p.shieldedToken.toLowerCase()) ||
      !r.assets.some((a) => a.address.toLowerCase() === p.backingToken.toLowerCase())
    )
      throw new Error("Invalid pool registry");
    ids.add(p.id);
  }
  return r;
}
export function snapshotFresh(snapshot, now = Date.now()) {
  return (
    snapshot.chainId === CHAIN_ID &&
    snapshot.observedAt > 0 &&
    now - snapshot.observedAt >= 0 &&
    now - snapshot.observedAt < 30000
  );
}
export function payoutPreview({ entryUsd, backingPrice, backingDecimals, cap }) {
  if (backingPrice <= 0n) throw new Error("Backing price unavailable");
  const raw = (entryUsd * 10n ** BigInt(backingDecimals)) / backingPrice;
  return raw < cap ? raw : cap;
}
