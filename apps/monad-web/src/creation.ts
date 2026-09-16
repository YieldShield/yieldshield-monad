import type { CreationOption, Registry } from "./types";
export function creationVersion(options: CreationOption[], asset: string, backing: string) {
  return options.find((v) => v.protectedAssets.includes(asset) && v.backingAssets.includes(backing));
}
export function creationFingerprint(v: CreationOption, asset: string, backing: string) {
  const quote = v.backing.find((b) => b.id === backing);
  if (!v.available || !quote?.available || !quote.bond || BigInt(quote.bond) <= 0n)
    throw new Error(v.reason || quote?.reason || "Choose a supported pair.");
  return JSON.stringify([
    v.id,
    v.factory.toLowerCase(),
    asset,
    backing,
    quote.bond,
    v.minimumUsd,
    v.collateralBps,
    v.juniorFeeBps,
    v.creatorFeeBps,
    v.protocolFeeBps,
    v.minimumPoolTime,
    v.unlockDuration,
  ]);
}
export function assertCreationIdentity(v: CreationOption, registry: Registry, protectedId: string, backingId: string) {
  const pinned = registry.factories.find((p) => p.id === v.id);
  if (
    !pinned ||
    registry.contracts[pinned.contract]?.address.toLowerCase() !== v.factory.toLowerCase() ||
    !pinned.protectedAssets.includes(protectedId) ||
    !pinned.backingAssets.includes(backingId)
  )
    throw new Error("Unverified pool configuration.");
}
