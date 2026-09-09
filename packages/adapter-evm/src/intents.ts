/**
 * Map chain-neutral tx intents to EVM transaction sequences. An intent becomes one or more
 * steps (ERC-20 approvals first, then the protocol call); the sender executes them in order and
 * `extract` pulls any created ids (receipt-NFT tokenId, new pool address) from the final receipt.
 */
import {
  isAddress,
  maxUint256,
  parseEventLogs,
  zeroAddress,
  type Abi,
  type Address,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type { TxIntent, TxResult } from "@yieldshield/core";
import { erc20Abi, erc721TransferEventAbi } from "./abis/erc20.js";
import { splitRiskPoolAbi } from "./abis/splitRiskPool.js";
import { splitRiskPoolFactoryAbi } from "./abis/splitRiskPoolFactory.js";
import { tokenFaucetAbi } from "./abis/tokenFaucet.js";
import { decodePositionId, encodePositionId } from "./positionId.js";
import { assertDepositPreflight } from "./preflight.js";
import { assertDemoTrade } from "./demo-trading.js";
import { demoExchangeAbi } from "./abis/demoExchange.js";
import { checkDemoVault, demoVaultAbi } from "./vaults.js";
import { readFaucetStatus } from "./faucet.js";
import { readPoolCreationOptions, validateCreationParams } from "./pool-creation.js";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";

export type EvmStep = {
  /** Short human label for progress UX ("Approve USDG", "Confirm deposit"). */
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
};

export type IntentPlan = {
  steps: EvmStep[];
  /** Refresh action-specific eligibility before every signature, including approvals. */
  beforeStep?: () => Promise<void>;
  /** Pulls created ids from the FINAL step's receipt. */
  extract?: (receipt: TransactionReceipt) => Partial<Pick<TxResult, "positionId" | "poolId">>;
};

export type EvmIntentDeps = {
  factory: Address;
  faucet?: Address;
  additionalFactories?: Address[];
  creationFactory?: Address;
};

/** Prepend an approve step when the spender's allowance can't cover the amount. */
async function approvalStep(
  client: PublicClient,
  owner: Address,
  token: Address,
  spender: Address,
  amount: bigint,
): Promise<EvmStep[]> {
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance >= amount) return [];
  return [
    // Exact approvals avoid an unlimited standing allowance. Reset first for ERC-20s that
    // require nonzero allowances to be cleared before changing them.
    ...(allowance > 0n
      ? [
          {
            label: "Reset spending approval",
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, 0n],
          },
        ]
      : []),
    { label: "Approve spending", address: token, abi: erc20Abi, functionName: "approve", args: [spender, amount] },
  ];
}

/** The tokenId minted to `owner` in this receipt (ERC-721 Transfer from the zero address). */
function mintedTokenId(receipt: TransactionReceipt, nft: Address | null, owner: Address): bigint | null {
  const transfers = parseEventLogs({ abi: erc721TransferEventAbi, logs: receipt.logs, eventName: "Transfer" });
  for (const t of transfers) {
    if (nft && t.address.toLowerCase() !== nft.toLowerCase()) continue;
    if (t.args.from === zeroAddress && t.args.to.toLowerCase() === owner.toLowerCase()) return t.args.tokenId;
  }
  return null;
}

export async function planIntent(
  client: PublicClient,
  owner: Address,
  deps: EvmIntentDeps,
  intent: TxIntent,
): Promise<IntentPlan> {
  const validAddress = (value: string): Address => {
    if (!isAddress(value) || value.toLowerCase() === zeroAddress)
      throw new Error("Invalid deployment or asset address.");
    return value as Address;
  };
  validAddress(owner);
  if (intent.kind !== "faucetDrip") validAddress(deps.factory);
  const positiveAmount = (amount: bigint) => {
    if (amount <= 0n || amount > maxUint256) throw new Error("Amount must be positive and within token limits.");
  };
  if ("amount" in intent) positiveAmount(intent.amount);
  if ("minReceived" in intent) {
    positiveAmount(intent.minReceived);
    if (intent.minReceived > intent.amount) throw new Error("Minimum received exceeds the deposit amount.");
  }
  if ("minOut" in intent) {
    if (intent.minOut <= 0n || intent.minOut > maxUint256)
      throw new Error("A positive minimum output is required to protect against slippage.");
  }

  const position = "position" in intent ? decodePositionId(intent.position) : null;
  if (position) {
    const expectedSide = ["activateShielded", "withdrawShielded", "partialWithdrawShielded", "claimRewards"].includes(
      intent.kind,
    )
      ? "shield"
      : "protector";
    if (position.side !== expectedSide) throw new Error("Position type does not match this action.");
    if ("pool" in intent && intent.pool.toLowerCase() !== position.pool.toLowerCase())
      throw new Error("Position pool does not match this action.");
  }
  const poolAddress = position?.pool ?? ("pool" in intent ? validAddress(intent.pool) : null);
  let poolFactory = deps.factory;
  if (poolAddress && deps.additionalFactories?.length) {
    const actual = await client.readContract({
      address: poolAddress,
      abi: splitRiskPoolAbi,
      functionName: "POOL_FACTORY",
    });
    if (![deps.factory, ...deps.additionalFactories].some((f) => f.toLowerCase() === actual.toLowerCase()))
      throw new Error("Pool is not part of a configured deployment.");
    poolFactory = actual;
  }
  if (poolAddress) {
    // Never approve an address supplied by a route or stale UI unless this deployment's
    // factory recognises it; withdrawals can still target a retired factory pool.
    const info = await client.readContract({
      address: poolFactory,
      abi: splitRiskPoolFactoryAbi,
      functionName: "getPoolInfo",
      args: [poolAddress],
    });
    if (
      "shieldedToken" in intent &&
      validAddress(intent.shieldedToken).toLowerCase() !== info.shieldedToken.toLowerCase()
    )
      throw new Error("Shielded asset does not match the pool.");
    if ("backingToken" in intent && validAddress(intent.backingToken).toLowerCase() !== info.backingToken.toLowerCase())
      throw new Error("Backing asset does not match the pool.");
  }
  const pool = (address: Address) => ({ address, abi: splitRiskPoolAbi as Abi });

  switch (intent.kind) {
    case "vaultDeposit":
    case "vaultRedeem":
    case "fundTestYield": {
      const vault = validAddress(intent.vault);
      const v = await checkDemoVault(client, vault);
      const depositing = intent.kind === "vaultDeposit";
      const redeeming = intent.kind === "vaultRedeem";
      const beforeStep = async () => {
        await checkDemoVault(client, vault);
        const token = redeeming ? vault : validAddress(v.underlying);
        const balance = await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        });
        if (balance < intent.amount) throw new Error("Not enough tokens for this vault action.");
        if (depositing || redeeming) {
          const quote = await client.readContract({
            address: vault,
            abi: demoVaultAbi,
            functionName: depositing ? "previewDeposit" : "previewRedeem",
            args: [intent.amount],
          });
          if (quote < intent.minOut) throw new Error("The vault quote changed. Review the amount again.");
        }
      };
      await beforeStep();
      const approvals = redeeming
        ? []
        : await approvalStep(client, owner, validAddress(v.underlying), vault, intent.amount);
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: depositing ? "Deposit into vault" : redeeming ? "Redeem vault shares" : "Fund test yield",
            address: vault,
            abi: demoVaultAbi,
            functionName: depositing ? "depositWithMin" : redeeming ? "redeemWithMin" : "fundTestYield",
            args: intent.kind === "fundTestYield" ? [intent.amount] : [intent.amount, intent.minOut, owner],
          },
        ],
      };
    }
    case "demoTrade": {
      validAddress(intent.asset);
      const beforeStep = async () => {
        await assertDemoTrade(client, owner, intent);
      };
      const quote = await assertDemoTrade(client, owner, intent);
      const buy = intent.side === "buy";
      const approvals = await approvalStep(
        client,
        owner,
        quote.inputToken as Address,
        quote.exchange as Address,
        buy ? intent.limit : intent.amount,
      );
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: buy ? "Buy test stock" : "Sell test stock",
            address: quote.exchange as Address,
            abi: demoExchangeAbi,
            functionName: "swap",
            args: [intent.asset, buy, intent.amount, intent.limit, intent.deadline],
          },
        ],
        extract: (receipt) => {
          const trades = parseEventLogs({
            abi: demoExchangeAbi,
            logs: receipt.logs,
            eventName: "Swapped",
            strict: true,
          }).filter((log) => log.address.toLowerCase() === quote.exchange.toLowerCase());
          if (
            trades.length !== 1 ||
            !trades.some(
              (log) =>
                log.args.trader.toLowerCase() === owner.toLowerCase() &&
                log.args.stock.toLowerCase() === intent.asset.toLowerCase() &&
                log.args.buy === buy &&
                log.args.stockAmount === intent.amount &&
                log.args.usdcAmount > 0n &&
                (buy ? log.args.usdcAmount <= intent.limit : log.args.usdcAmount >= intent.limit),
            )
          )
            throw new Error(
              "The receipt does not confirm the reviewed stock trade. Check wallet activity before retrying.",
            );
          return {};
        },
      };
    }

    case "depositShielded": {
      const poolAddr = intent.pool as Address;
      const asset = intent.shieldedToken as Address;
      const beforeStep = () =>
        assertDepositPreflight(client, poolFactory, poolAddr, owner, "shield", asset, intent.amount);
      await beforeStep();
      const [approvals, nft] = await Promise.all([
        approvalStep(client, owner, asset, poolAddr, intent.amount),
        client.readContract({ address: poolAddr, abi: splitRiskPoolAbi, functionName: "shieldReceiptNFT" }),
      ]);
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: "Confirm deposit",
            ...pool(poolAddr),
            functionName: "depositShieldedAsset",
            args: [asset, intent.amount, intent.minReceived],
          },
        ],
        extract: (receipt) => {
          const tokenId = mintedTokenId(receipt, nft, owner);
          if (tokenId === null)
            throw new Error("Confirmed deposit receipt does not contain the expected protection position.");
          return { positionId: encodePositionId(poolAddr, "shield", tokenId) };
        },
      };
    }

    case "depositBacking": {
      const poolAddr = intent.pool as Address;
      const asset = intent.backingToken as Address;
      const beforeStep = () =>
        assertDepositPreflight(client, poolFactory, poolAddr, owner, "backing", asset, intent.amount);
      await beforeStep();
      const [approvals, nft] = await Promise.all([
        approvalStep(client, owner, asset, poolAddr, intent.amount),
        client.readContract({ address: poolAddr, abi: splitRiskPoolAbi, functionName: "protectorReceiptNFT" }),
      ]);
      return {
        beforeStep,
        steps: [
          ...approvals,
          {
            label: "Confirm deposit",
            ...pool(poolAddr),
            functionName: "depositBackingAsset",
            args: [asset, intent.amount, intent.minReceived],
          },
        ],
        extract: (receipt) => {
          const tokenId = mintedTokenId(receipt, nft, owner);
          if (tokenId === null)
            throw new Error("Confirmed deposit receipt does not contain the expected collateral position.");
          return { positionId: encodePositionId(poolAddr, "protector", tokenId) };
        },
      };
    }

    case "activateShielded": {
      // Cross-asset exit: withdraw the shield position as the backing (safe) asset.
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Activate protection",
            ...pool(poolAddr),
            functionName: "shieldedWithdraw",
            args: [tokenId, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "withdrawShielded": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "shieldedWithdraw",
            args: [tokenId, intent.shieldedToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "partialWithdrawShielded": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "partialWithdrawShielded",
            args: [tokenId, intent.amount, intent.shieldedToken as Address, intent.minOut],
          },
        ],
        // Partial withdrawals close the old receipt and mint a new one for the remainder.
        extract: (receipt) => {
          const logs = parseEventLogs({ abi: splitRiskPoolAbi, logs: receipt.logs, eventName: "PartialWithdrawal" });
          const newTokenId = logs.find(
            (log) =>
              log.address.toLowerCase() === poolAddr.toLowerCase() &&
              log.args.user.toLowerCase() === owner.toLowerCase() &&
              log.args.oldTokenId === tokenId,
          )?.args.newTokenId;
          if (newTokenId === undefined)
            throw new Error("Confirmed withdrawal receipt does not identify the remaining position.");
          return { positionId: encodePositionId(poolAddr, "shield", newTokenId) };
        },
      };
    }

    case "withdrawProtector": {
      // Full exit: the port intent carries no amount, so withdraw the position's full balance.
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      const amount = await client.readContract({
        address: poolAddr,
        abi: splitRiskPoolAbi,
        functionName: "getProtectorPositionAmount",
        args: [tokenId],
      });
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "protectorWithdraw",
            args: [tokenId, amount, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "partialWithdrawProtector": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [
          {
            label: "Confirm withdrawal",
            ...pool(poolAddr),
            functionName: "protectorWithdraw",
            args: [tokenId, intent.amount, intent.backingToken as Address, intent.minOut],
          },
        ],
      };
    }

    case "startUnlock": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Start notice", ...pool(poolAddr), functionName: "startUnlockProcess", args: [tokenId] }],
      };
    }

    case "cancelUnlock": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Cancel notice", ...pool(poolAddr), functionName: "cancelUnlockProcess", args: [tokenId] }],
      };
    }

    case "claimCommission": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Collect premium", ...pool(poolAddr), functionName: "claimCommission", args: [tokenId] }],
      };
    }

    case "claimRewards": {
      const { pool: poolAddr, tokenId } = decodePositionId(intent.position);
      return {
        steps: [{ label: "Collect rewards", ...pool(poolAddr), functionName: "claimRewards", args: [tokenId] }],
      };
    }

    case "createPool": {
      if (deps.creationFactory) {
        if (deps.creationFactory.toLowerCase() !== CRYPTO_EXTENSION?.factory.toLowerCase())
          throw new Error("Pool creation factory is not part of the verified deployment.");
        const p = intent.params;
        const bond = p.creationBondAmount ?? 0n;
        if (bond < 0n || bond > maxUint256) throw new Error("Invalid creation bond amount.");
        const options = await readPoolCreationOptions(client);
        const { shielded, backing } = validateCreationParams(p, options);
        const factoryAddress = deps.creationFactory;
        const beforeStep = async () => {
          validateCreationParams(p, await readPoolCreationOptions(client));
          const balance = await client.readContract({
            address: backing.token as Address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          });
          if (balance < bond) throw new Error("Add enough backing tokens to cover the creation bond.");
        };
        await beforeStep();
        return {
          beforeStep,
          steps: [
            ...(await approvalStep(client, owner, backing.token as Address, factoryAddress, bond)),
            {
              label: "Create pool",
              address: factoryAddress,
              abi: splitRiskPoolFactoryAbi as Abi,
              functionName: "createPool",
              args: [
                shielded.token,
                shielded.symbol,
                backing.token,
                backing.symbol,
                BigInt(p.commissionRateBp),
                BigInt(p.poolFeeBp),
                BigInt(p.collateralRatioBp),
                bond,
              ],
            },
          ],
          extract: (receipt) => {
            const logs = parseEventLogs({ abi: splitRiskPoolFactoryAbi, logs: receipt.logs, eventName: "PoolCreated" });
            const matches = logs.filter((log) => log.address.toLowerCase() === factoryAddress.toLowerCase());
            const result = matches[0]?.args;
            if (
              matches.length !== 1 ||
              !result ||
              result.creator.toLowerCase() !== owner.toLowerCase() ||
              result.shieldedToken.toLowerCase() !== shielded.token.toLowerCase() ||
              result.backingToken.toLowerCase() !== backing.token.toLowerCase() ||
              result.commissionRate !== BigInt(p.commissionRateBp) ||
              result.poolFee !== BigInt(p.poolFeeBp) ||
              result.collateralRatio !== BigInt(p.collateralRatioBp)
            )
              throw new Error("The confirmed receipt does not match the reviewed pool terms.");
            return { poolId: result.poolAddress };
          },
        };
      }
      // The EVM factory sets pool timing/fee-cap/TVL parameters at the protocol level, so only
      // the per-pool terms (tokens, commission, pool fee, collateral ratio, bond) are passed;
      // the intent's remaining fields are Solana-configurable and ignored here.
      const p = intent.params;
      const shielded = p.shieldedToken as Address;
      const backing = validAddress(p.backingToken);
      validAddress(shielded);
      if (shielded.toLowerCase() === backing.toLowerCase()) throw new Error("Choose two different pool assets.");
      const bond = p.creationBondAmount ?? 0n;
      if (bond < 0n || bond > maxUint256) throw new Error("Invalid creation bond amount.");
      const [shInfo, bkInfo, bondApprovals] = await Promise.all([
        client.readContract({
          address: deps.factory,
          abi: splitRiskPoolFactoryAbi,
          functionName: "tokenInfo",
          args: [shielded],
        }),
        client.readContract({
          address: deps.factory,
          abi: splitRiskPoolFactoryAbi,
          functionName: "tokenInfo",
          args: [backing],
        }),
        bond > 0n ? approvalStep(client, owner, backing, deps.factory, bond) : Promise.resolve([]),
      ]);
      return {
        steps: [
          ...bondApprovals,
          {
            label: "Create pool",
            address: deps.factory,
            abi: splitRiskPoolFactoryAbi as Abi,
            functionName: "createPool",
            args: [
              shielded,
              shInfo[1],
              backing,
              bkInfo[1],
              BigInt(p.commissionRateBp),
              BigInt(p.poolFeeBp),
              BigInt(p.collateralRatioBp),
              bond,
            ],
          },
        ],
        extract: (receipt) => {
          const logs = parseEventLogs({ abi: splitRiskPoolFactoryAbi, logs: receipt.logs, eventName: "PoolCreated" });
          const created = logs.find((log) => log.address.toLowerCase() === deps.factory.toLowerCase())?.args
            .poolAddress;
          return created ? { poolId: created } : {};
        },
      };
    }

    case "faucetDrip": {
      if (!deps.faucet) throw new Error("No on-chain faucet on this deployment.");
      validAddress(deps.faucet);
      const recipient = validAddress(intent.recipient ?? owner);
      const beforeStep = async () => {
        const status = await readFaucetStatus(client, deps.faucet!, recipient);
        if (!status.ready)
          throw new Error("No test tokens are available for this wallet yet. Check the dispenser status.");
        const senderBalance =
          recipient.toLowerCase() === owner.toLowerCase()
            ? status.nativeBalance
            : await client.getBalance({ address: owner });
        if (senderBalance <= 0n) throw new Error("Add Base Sepolia test ETH to pay the transaction fee.");
      };
      await beforeStep();
      // dripAll skips tokens still on cooldown; an empty successful call is not a claim.
      return {
        beforeStep,
        extract: (receipt) => {
          const drips = parseEventLogs({ abi: tokenFaucetAbi, logs: receipt.logs, eventName: "TokensDripped" });
          if (
            !drips.some(
              (log) =>
                log.address.toLowerCase() === deps.faucet!.toLowerCase() &&
                log.args.recipient.toLowerCase() === recipient.toLowerCase() &&
                log.args.amount > 0n,
            )
          )
            throw new Error("The confirmed transaction sent no test tokens. Refresh dispenser status before retrying.");
          return {};
        },
        steps: [
          {
            label: "Get test tokens",
            address: deps.faucet,
            abi: tokenFaucetAbi as Abi,
            functionName: "dripAll",
            args: [recipient],
          },
        ],
      };
    }
  }
}
