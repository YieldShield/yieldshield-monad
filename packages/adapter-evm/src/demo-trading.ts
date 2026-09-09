import {
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  maxUint256,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import type { DemoMarket, DemoTradeQuote, DemoTradeRequest } from "@yieldshield/core";
import { DEMO_DEPLOYMENTS, type DemoDeployment } from "./demo-deployments.js";
import { demoExchangeAbi, demoOracleAbi } from "./abis/demoExchange.js";
import { readSnapshot } from "./snapshot.js";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
function requireState(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
const validAddress = (value: string) => isAddress(value) && !same(value, zeroAddress);

/** A reviewed, immutable test deployment is the only accepted execution target. */
export async function readDemoContext(client: PublicClient, deployment?: DemoDeployment) {
  const chainId = await client.getChainId();
  requireState(chainId === 84532, "Demo trading requires Base Sepolia.");
  const config = deployment ?? DEMO_DEPLOYMENTS[84532];
  requireState(config?.chainId === 84532, "Demo trading is being prepared.");
  requireState(
    [config.exchange, config.oracle, config.quoteToken, ...config.assets.map((a) => a.token)].every(validAddress),
    "Demo deployment is invalid.",
  );
  requireState(
    config.assets.length === (config.mode === "multi-asset" ? 8 : 4) &&
      new Set(config.assets.map((a) => a.token.toLowerCase())).size === config.assets.length &&
      !config.assets.some((a) => same(a.token, config.quoteToken)),
    "Demo assets are invalid.",
  );
  const snapshot = await readSnapshot(client, "Demo trading");
  const blockNumber = snapshot.block.number;
  const exchange = { address: config.exchange, abi: demoExchangeAbi, blockNumber };
  const [exchangeCode, oracleCode, oracle, quoteToken, feeBps, maxStockAmount, isDemo] = await Promise.all([
    client.getCode({ address: config.exchange, blockNumber }),
    client.getCode({ address: config.oracle, blockNumber }),
    client.readContract({ ...exchange, functionName: "oracle" }),
    client.readContract({ ...exchange, functionName: "quoteToken" }),
    client.readContract({ ...exchange, functionName: "feeBps" }),
    client.readContract({ ...exchange, functionName: "maxStockAmount" }),
    client.readContract({ address: config.oracle, abi: demoOracleAbi, functionName: "isDemo", blockNumber }),
  ]);
  requireState(
    exchangeCode && exchangeCode !== "0x" && same(keccak256(exchangeCode), config.exchangeCodehash),
    "Demo exchange could not be verified.",
  );
  requireState(
    oracleCode && oracleCode !== "0x" && same(keccak256(oracleCode), config.oracleCodehash),
    "Demo pricing could not be verified.",
  );
  requireState(
    same(oracle, config.oracle) &&
      same(quoteToken, config.quoteToken) &&
      isDemo === true &&
      feeBps === 30n &&
      maxStockAmount === 25n * 10n ** BigInt(config.mode === "multi-asset" ? 18 : 8),
    "Demo configuration differs from the reviewed deployment.",
  );
  return { config, snapshot, exchange, blockNumber, feeBps, maxStockAmount };
}

export async function readDemoMarket(client: PublicClient, deployment?: DemoDeployment): Promise<DemoMarket> {
  const { config, snapshot, exchange, blockNumber, feeBps, maxStockAmount } = await readDemoContext(client, deployment);
  const assets = await Promise.all(
    config.assets.map(async (asset) => {
      const [supported, price, decimals, symbol] = await Promise.all([
        client.readContract({ ...exchange, functionName: "supportedStock", args: [asset.token] }),
        client.readContract({
          address: config.oracle,
          abi: demoOracleAbi,
          functionName: "getPrice",
          args: [asset.token],
          blockNumber,
        }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "symbol", blockNumber }),
      ]);
      requireState(
        supported === true &&
          price > 0n &&
          decimals === asset.decimals &&
          [6, 8, 18].includes(decimals) &&
          symbol === asset.symbol,
        "Asset configuration is unavailable.",
      );
      const maxAmount =
        config.mode === "multi-asset"
          ? await client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [asset.token] })
          : maxStockAmount;
      requireState(
        maxAmount === 25n * 10n ** BigInt(asset.decimals),
        "Asset quantity limit differs from the deployment.",
      );
      return { ...asset, priceUsd8: price, maxAmount };
    }),
  );
  const [usdDecimals, usdSymbol] = await Promise.all([
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber }),
  ]);
  requireState(usdDecimals === 6 && usdSymbol === "TestUSDC", "Demo quote token is invalid.");
  return snapshot.finish({
    chainId: 84532,
    exchange: config.exchange,
    ready: true,
    evaluatedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
    feeBps: Number(feeBps),
    maxStockAmount,
    assets,
    quoteToken: { token: config.quoteToken, symbol: "TestUSDC", decimals: 6 },
  });
}

export async function readDemoTradeQuote(
  client: PublicClient,
  request: DemoTradeRequest,
  deployment?: DemoDeployment,
): Promise<DemoTradeQuote> {
  requireState(request.side === "buy" || request.side === "sell", "Choose Buy or Sell.");
  requireState(
    validAddress(request.asset) &&
      typeof request.amount === "bigint" &&
      request.amount > 0n &&
      request.amount <= maxUint256,
    "Enter a valid asset amount.",
  );
  requireState(request.owner === undefined || validAddress(request.owner), "Wallet address is invalid.");
  const { config, snapshot, exchange, blockNumber, maxStockAmount } = await readDemoContext(client, deployment);
  const asset = config.assets.find((a) => same(a.token, request.asset));
  const maximum =
    asset && config.mode === "multi-asset"
      ? await client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [asset.token] })
      : maxStockAmount;
  requireState(
    asset && maximum === 25n * 10n ** BigInt(asset.decimals) && request.amount <= maximum,
    "Choose a supported asset and an amount up to 25 tokens.",
  );
  const buy = request.side === "buy";
  const [supported, quote] = await Promise.all([
    client.readContract({ ...exchange, functionName: "supportedStock", args: [asset.token] }),
    client.readContract({ ...exchange, functionName: "quote", args: [asset.token, buy, request.amount] }),
  ]);
  const [usdAmount, feeAmount, priceUsd8] = quote;
  requireState(
    supported && usdAmount > 0n && feeAmount >= 0n && priceUsd8 > 0n,
    "No executable demo quote is available.",
  );
  const inputToken = buy ? config.quoteToken : asset.token;
  const outputToken = buy ? asset.token : config.quoteToken;
  const inputAmount = buy ? usdAmount : request.amount;
  const outputAmount = buy ? request.amount : usdAmount;
  const outputBalance = await client.readContract({
    address: outputToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [config.exchange],
    blockNumber,
  });
  requireState(outputBalance >= outputAmount, "Demo trading inventory is insufficient for this amount.");
  // An unconnected visitor can inspect a quote; execution independently checks wallet funds.
  return snapshot.finish({
    ...request,
    asset: asset.token,
    owner: request.owner ? getAddress(request.owner) : undefined,
    chainId: 84532,
    exchange: config.exchange,
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    feeAmount,
    priceUsd8,
    quotedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil),
  });
}

export async function assertDemoTrade(
  client: PublicClient,
  owner: Address,
  request: DemoTradeRequest & { limit: bigint; deadline: bigint },
  deployment?: DemoDeployment,
) {
  const quote = await readDemoTradeQuote(client, { ...request, owner }, deployment);
  const now = BigInt(Math.floor(Date.now() / 1000));
  requireState(
    typeof request.limit === "bigint" &&
      request.limit > 0n &&
      request.limit <= maxUint256 &&
      typeof request.deadline === "bigint" &&
      request.deadline > now &&
      request.deadline <= now + 300n,
    "This trade quote expired. Review a new quote.",
  );
  const buy = request.side === "buy";
  requireState(
    buy ? quote.inputAmount <= request.limit : quote.outputAmount >= request.limit,
    "The price moved beyond your reviewed limit. Get a new quote.",
  );
  const balance = await client.readContract({
    address: quote.inputToken as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner],
  });
  requireState(
    balance >= (buy ? request.limit : request.amount),
    "Your test-token balance is insufficient for this trade.",
  );
  requireState(
    (await client.getBalance({ address: owner })) > 0n,
    "Add Base Sepolia test ETH to pay the transaction fee.",
  );
  return quote;
}
