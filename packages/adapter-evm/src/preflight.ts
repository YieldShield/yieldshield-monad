import { zeroAddress, type Abi, type Address, type PublicClient } from "viem";
import { erc20Abi } from "./abis/erc20.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";
import { compositeOracleAbi } from "./abis/compositeOracle.js";
import { maximumDeposit } from "./reader.js";
import { readSnapshot } from "./snapshot.js";

const policyAbi = [
  {
    type: "function",
    name: "protectionOpeningEligibilityRequired",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "isProtectionOpeningAllowed",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canDepositShielded",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "canDepositProtector",
    inputs: [{ type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view",
  },
] as const;

/** Check this pool and wallet before requesting an approval; final execution is still simulated. */
export async function assertDepositPreflight(
  client: PublicClient,
  factory: Address,
  pool: Address,
  owner: Address,
  side: "shield" | "backing",
  asset: Address,
  amount: bigint,
): Promise<void> {
  const snapshot = await readSnapshot(client, "Deposit");
  const block = snapshot.block;
  const read = <T>(address: Address, abi: Abi, functionName: string, args?: readonly unknown[]) =>
    client.readContract({ address, abi, functionName, args, blockNumber: block.number }) as Promise<T>;
  const poolRead = <T>(name: string) => read<T>(pool, splitRiskPoolAbi, name);
  const [
    info,
    active,
    paused,
    config,
    shielded,
    backing,
    state,
    principal,
    reserved,
    entryValue,
    shieldLiability,
    strict,
    broken,
    access,
    shieldDecimals,
    backingDecimals,
    totalShares,
  ] = await Promise.all([
    read<{ shieldedToken: Address; backingToken: Address; colleteralRatio: bigint }>(
      factory,
      splitRiskPoolFactoryAbi,
      "getPoolInfo",
      [pool],
    ),
    read<boolean>(factory, splitRiskPoolFactoryAbi, "isPoolActive", [pool]),
    poolRead<boolean>("paused"),
    poolRead<readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, Address, bigint, Address]>("poolConfig"),
    poolRead<Address>("SHIELDED_TOKEN"),
    poolRead<Address>("BACKING_TOKEN"),
    poolRead<readonly [bigint, bigint]>("poolState"),
    poolRead<bigint>("totalProtectorTokens"),
    poolRead<bigint>("totalShieldCollateralAmount"),
    poolRead<bigint>("totalValueAtDeposit"),
    poolRead<bigint>("totalShieldedTokens"),
    poolRead<boolean>("requiresStrictProtectedBackingPrice"),
    poolRead<boolean>("shieldedTokenTransferIntegrityBroken"),
    poolRead<Address>("accessControl"),
    poolRead<number>("shieldedTokenDecimals"),
    poolRead<number>("backingTokenDecimals"),
    poolRead<bigint>("totalProtectorShares"),
  ]);
  if (!active || paused) throw new Error("This pool is not accepting deposits.");
  if (
    shielded.toLowerCase() !== info.shieldedToken.toLowerCase() ||
    backing.toLowerCase() !== info.backingToken.toLowerCase() ||
    asset.toLowerCase() !== (side === "shield" ? shielded : backing).toLowerCase()
  )
    throw new Error("Deposit assets differ from the reviewed pool.");
  if (side === "shield" && broken) throw new Error("Stock deposits are paused for token transfer checks.");
  const exposure = state[0] !== 0n || shieldLiability !== 0n || reserved !== 0n || entryValue !== 0n;
  const oracle = config[9];
  const oracleRead = <T>(name: string, token: Address) => read<T>(oracle, compositeOracleAbi, name, [token]);
  const checkChallenge = async (token: Address) => {
    const [dual, challengeable] = await Promise.all([
      oracleRead<readonly [boolean, Address, Address, boolean, boolean, bigint]>("getTokenDualFeedStatus", token),
      oracleRead<boolean>("isTokenChallengeable", token),
    ]);
    if (dual[4] || challengeable) throw new Error("Deposit pricing is under verification.");
  };
  const [stockPrice, backingPrice, balance, actualStock, actualBacking] = await Promise.all([
    side === "shield" || exposure ? oracleRead<bigint>("getPrice", shielded) : Promise.resolve(0n),
    oracleRead<bigint>(strict ? "getPriceWithStrictCircuitBreaker" : "getPrice", backing),
    read<bigint>(asset, erc20Abi, "balanceOf", [owner]),
    read<bigint>(shielded, erc20Abi, "balanceOf", [pool]),
    read<bigint>(backing, erc20Abi, "balanceOf", [pool]),
    checkChallenge(backing),
    side === "shield" || exposure ? checkChallenge(shielded) : Promise.resolve(),
    (async () => {
      if (side !== "shield") return;
      const required = await read<boolean>(oracle, policyAbi, "protectionOpeningEligibilityRequired", [shielded]);
      if (required && !(await read<boolean>(oracle, policyAbi, "isProtectionOpeningAllowed", [shielded])))
        throw new Error("New protection is unavailable under this asset's opening policy.");
      const feePrice = await oracleRead<bigint>("getPriceForFeeAccrual", shielded);
      if (feePrice <= 0n) throw new Error("Deposit fee pricing is unavailable.");
    })(),
    (async () => {
      if (
        access !== zeroAddress &&
        !(await read<boolean>(access, policyAbi, side === "shield" ? "canDepositShielded" : "canDepositProtector", [
          owner,
        ]))
      )
        throw new Error("This wallet is not allowed to deposit in this pool.");
    })(),
  ]);
  if (balance < amount) throw new Error("Your token balance is below the deposit amount.");
  if (actualStock < state[0] || actualBacking < state[1])
    throw new Error("Pool balances do not cover its accounting. Deposits are unavailable.");
  if (backingPrice <= 0n || ((side === "shield" || exposure) && stockPrice <= 0n))
    throw new Error("Deposit pricing is unavailable.");
  const minDeposit = config[side === "shield" ? 0 : 2];
  const maximum = maximumDeposit(
    {
      shieldedPrice: stockPrice,
      backingPrice,
      shieldedDecimals: shieldDecimals,
      backingDecimals,
      totalProtectorTokens: principal,
      totalShieldCollateralAmount: reserved,
      totalValueAtDeposit: entryValue,
      totalProtectorShares: totalShares,
      trackedTvlUsd:
        (state[0] * stockPrice) / 10n ** BigInt(shieldDecimals) +
        (state[1] * backingPrice) / 10n ** BigInt(backingDecimals),
      maxTvlUsd: config[4],
      collateralRatioBps: info.colleteralRatio,
      minDeposit,
      maxDeposit: config[side === "shield" ? 1 : 3] < amount ? config[side === "shield" ? 1 : 3] : amount,
    },
    side,
  );
  if (amount < minDeposit || amount > maximum)
    throw new Error("Deposit amount exceeds this pool's current limits or collateral capacity.");
  await snapshot.finish(undefined);
}
