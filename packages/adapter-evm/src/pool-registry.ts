import { keccak256, type Address, type PublicClient } from "viem";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";
import { splitRiskPoolFactoryAbi as factoryAbi } from "./abis/splitRiskPoolFactory.js";
import { splitRiskPoolAbi as poolAbi } from "./abis/splitRiskPool.js";
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const same = (a: string | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
const slotAddress = (slot: string | undefined) => slot && `0x${slot.slice(-40)}`;
/** Verify the deployed proxy AND its current implementation, not merely an address registry. */
export async function assertCreationFactory(client: PublicClient, blockNumber?: bigint) {
  const d = CRYPTO_EXTENSION;
  if (!d || (await client.getChainId()) !== 84532) throw new Error("Pool creation is available on Base Sepolia only.");
  const [codes, slot, implementation, oracle] = await Promise.all([
    Promise.all(
      [
        [d.factory, d.factoryCodehash],
        [d.factoryImplementation, d.factoryImplementationCodehash],
        [d.poolImplementation, d.poolImplementationCodehash],
        [d.compositeOracle, d.compositeOracleCodehash],
      ].map(async ([address, hash]) => {
        const code = await client.getCode({ address: address as Address, blockNumber });
        return !!code && same(keccak256(code), hash!);
      }),
    ),
    client.getStorageAt({ address: d.factory, slot: IMPLEMENTATION_SLOT, blockNumber }),
    client.readContract({
      address: d.factory,
      abi: factoryAbi,
      functionName: "splitRiskPoolImplementation",
      blockNumber,
    }),
    client.readContract({ address: d.factory, abi: factoryAbi, functionName: "compositeOracle", blockNumber }),
  ]);
  if (
    !codes.every(Boolean) ||
    !same(slotAddress(slot), d.factoryImplementation) ||
    !same(implementation, d.poolImplementation) ||
    !same(oracle, d.compositeOracle)
  )
    throw new Error("Pool creation deployment changed or could not be verified. Refresh before continuing.");
  return d;
}

/** A dynamically discovered pool must still be an authentic proxy of this factory's pinned router. */
export async function assertCreatedPools(client: PublicClient, pools: Address[], blockNumber: bigint) {
  const d = await assertCreationFactory(client, blockNumber);
  await Promise.all(
    pools.map(async (address) => {
      const [code, slot, factory] = await Promise.all([
        client.getCode({ address, blockNumber }),
        client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
        client.readContract({ address, abi: poolAbi, functionName: "POOL_FACTORY", blockNumber }),
      ]);
      if (
        !code ||
        !same(keccak256(code), d.factoryCodehash) ||
        !same(slotAddress(slot), d.poolImplementation) ||
        !same(factory, d.factory)
      )
        throw new Error("A discovered pool could not be authenticated. Refresh before continuing.");
    }),
  );
}
