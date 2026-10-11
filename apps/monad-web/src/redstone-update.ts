import { encodeFunctionData, keccak256, parseAbi, stringToHex, type Address, type Hash, type Hex } from "viem";

export const monFeedId = stringToHex("MON", { size: 32 });
const updateAbi = parseAbi(["function updateDataFeedsValuesPartial(bytes32[] dataFeedIds)"]);
type ImplementationPin = { slot: Hex; address: Address; runtimeCodehash: Hash };
export type RedstoneRecoveryConfig = {
  address: Address;
  runtimeCodehash: Hash;
  adapter: Address;
  adapterRuntimeCodehash: Hash;
  adapterImplementation: ImplementationPin;
  sourceImplementation: ImplementationPin;
  authorizedSigners: readonly string[];
  uniqueSignersCount: number;
};
export type RedstoneUpdate = {
  chainId: 10143;
  provider: "redstone";
  adapter: Address;
  source: Address;
  feedId: Hex;
  publishedAt: number;
  price: string;
  signers: Address[];
  payload: Hex;
  expiresAt: number;
  verifiedAtBlock: string;
};
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (value: unknown): value is string => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value);

// Metadata limits the request before signing. The on-chain simulation independently
// verifies the appended signatures and timestamps; metadata is never a price source.
export function validateRedstoneUpdate(
  value: unknown,
  config: RedstoneRecoveryConfig,
  now = Date.now(),
): RedstoneUpdate {
  const update = value as Partial<RedstoneUpdate> | null;
  const valid =
    update &&
    update.chainId === 10143 &&
    update.provider === "redstone" &&
    same(update.adapter, config.adapter) &&
    same(update.source, config.address) &&
    same(update.feedId, monFeedId) &&
    Number.isSafeInteger(update.publishedAt) &&
    update.publishedAt! > 0 &&
    update.publishedAt! * 1000 <= now + 5000 &&
    now - update.publishedAt! * 1000 <= 90000 &&
    Number.isSafeInteger(update.expiresAt) &&
    update.expiresAt! > now &&
    update.expiresAt! <= now + 30000 &&
    update.expiresAt! <= update.publishedAt! * 1000 + 90000 &&
    uint(update.price) &&
    BigInt(update.price) > 0n &&
    uint(update.verifiedAtBlock) &&
    BigInt(update.verifiedAtBlock) > 0n &&
    typeof update.payload === "string" &&
    /^0x(?:[0-9a-fA-F]{2})+$/.test(update.payload) &&
    update.payload.length <= 65538 &&
    update.payload.toLowerCase().endsWith("000002ed57011e0000") &&
    config.uniqueSignersCount === 2 &&
    Array.isArray(update.signers) &&
    update.signers.length === config.uniqueSignersCount &&
    update.signers.every((signer) => config.authorizedSigners.some((authorized) => same(signer, authorized))) &&
    new Set(update.signers.map((signer) => signer.toLowerCase())).size === config.uniqueSignersCount;
  if (!valid) throw new Error("Invalid or expired signed MON update. Refresh before trying again.");
  return update as RedstoneUpdate;
}

export function redstoneUpdateCalldata(update: RedstoneUpdate): Hex {
  // Neither the endpoint nor a caller can choose a function, token, recipient or value.
  const call = encodeFunctionData({
    abi: updateAbi,
    functionName: "updateDataFeedsValuesPartial",
    args: [[monFeedId]],
  });
  return `${call}${update.payload.slice(2)}`;
}

type PinReader = {
  getChainId: () => Promise<number>;
  getCode: (args: { address: Address }) => Promise<Hex | undefined>;
  getStorageAt: (args: { address: Address; slot: Hex }) => Promise<Hex | undefined>;
};
export async function verifyRedstoneUpdateTargets(client: PinReader, config: RedstoneRecoveryConfig) {
  if ((await client.getChainId()) !== 10143) throw new Error("Signed MON updates require Monad testnet.");
  await Promise.all(
    [
      [config.adapter, config.adapterRuntimeCodehash, config.adapterImplementation],
      [config.address, config.runtimeCodehash, config.sourceImplementation],
    ].map(async ([target, expectedHash, pinValue]) => {
      const address = target as Address,
        pin = pinValue as ImplementationPin;
      if (!pin?.slot || !pin.address || !pin.runtimeCodehash)
        throw new Error("RedStone contract verification is unavailable.");
      const [code, storage, implementation] = await Promise.all([
        client.getCode({ address }),
        client.getStorageAt({ address, slot: pin.slot }),
        client.getCode({ address: pin.address }),
      ]);
      if (
        !code ||
        !storage ||
        !implementation ||
        keccak256(code) !== expectedHash ||
        !same(`0x${storage.slice(-40)}`, pin.address) ||
        keccak256(implementation) !== pin.runtimeCodehash
      )
        throw new Error("RedStone contract verification failed. The integration needs review.");
    }),
  );
}

export async function refreshRedstonePrice({
  readStrictPrice,
  fetchUpdate,
  publish,
  config,
}: {
  readStrictPrice: () => Promise<bigint>;
  fetchUpdate: () => Promise<unknown>;
  publish: (update: RedstoneUpdate) => Promise<unknown>;
  config: RedstoneRecoveryConfig;
}) {
  try {
    if ((await readStrictPrice()) > 0n) return;
  } catch {
    /* A stale protected getter may revert. A valid signed update can recover it. */
  }
  const update = validateRedstoneUpdate(await fetchUpdate(), config);
  const receipt = await publish(update);
  if ((await readStrictPrice()) <= 0n) throw new Error("A fresh MON reference is required.");
  return receipt;
}
