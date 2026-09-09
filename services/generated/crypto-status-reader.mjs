// packages/adapter-evm/src/reader.ts
import { zeroAddress as zeroAddress2 } from "viem";

// packages/adapter-evm/src/demo-trading.ts
import {
  erc20Abi,
  getAddress,
  isAddress,
  keccak256,
  maxUint256,
  zeroAddress
} from "viem";

// packages/adapter-evm/src/demo-deployments.ts
var DEMO_DEPLOYMENTS = {
  84532: {
    chainId: 84532,
    mode: "multi-asset",
    exchange: "0x6f504fC32e1f93627E6A73907564e9ea4abfacf9",
    oracle: "0x083e5af6D2b23CFA5fee1006Cd5a5c691397aE14",
    exchangeCodehash: "0x6dc60120e8d708238ce01de2e6bfcf2f72e11f0a509768a6b39914bc9f0bb220",
    oracleCodehash: "0x4f4f358d51aed0f62128046c2fd3d644de047e393d87ebc9f25618b9dfc5c223",
    quoteToken: "0x4dFe9500E03AC27F25997184d162191cC5ADBf34",
    assets: [
      {
        token: "0xa301baB965098C9cFb72a270C80D818Fa10444DB",
        symbol: "tAAPLc",
        name: "Apple",
        decimals: 8
      },
      {
        token: "0xe765a85774263a94595C3B36d5ce2e59b95689bE",
        symbol: "tNVDAc",
        name: "NVIDIA",
        decimals: 8
      },
      {
        token: "0x9115c740B4F6a9B56B4cFFA039fb5B46Ba69f730",
        symbol: "tMETAc",
        name: "Meta",
        decimals: 8
      },
      {
        token: "0x560B12E0a9F6f65301b79F24CCBfbC0360f31bC3",
        symbol: "tGOOGLc",
        name: "Alphabet",
        decimals: 8
      },
      {
        token: "0x54f25F95Af2527E08cfBe5A0528038e9DC4265f2",
        symbol: "tWETH",
        name: "Wrapped Ether",
        decimals: 18
      },
      {
        token: "0x21f0fb9B8672955D62C0C9fF2E9a5D021EADCeBe",
        symbol: "tcbBTC",
        name: "Coinbase wrapped Bitcoin",
        decimals: 8
      },
      {
        token: "0x0E5a8E9308fd29BA52Da9126270061c014Fb09f8",
        symbol: "vWETH",
        name: "Test WETH Yield Vault",
        decimals: 18
      },
      {
        token: "0x17e1d0B9A4045a080e9cB3BBC45da3ee3893B5f3",
        symbol: "vUSDC",
        name: "Test USDC Yield Vault",
        decimals: 6
      }
    ]
  }
};

// packages/adapter-evm/src/abis/demoExchange.ts
import { parseAbi } from "viem";
var demoExchangeAbi = parseAbi([
  "function quote(address stock, bool buy, uint256 stockAmount) view returns (uint256 usdcAmount, uint256 feeAmount, uint256 price)",
  "function swap(address stock, bool buy, uint256 stockAmount, uint256 usdcLimit, uint256 deadline) returns (uint256 usdcAmount)",
  "function oracle() view returns (address)",
  "function quoteToken() view returns (address)",
  "function feeBps() view returns (uint256)",
  "function maxAssetAmount(address) view returns (uint256)",
  "function maxStockAmount() view returns (uint256)",
  "function supportedStock(address) view returns (bool)",
  "event Swapped(address indexed trader, address indexed stock, bool buy, uint256 stockAmount, uint256 usdcAmount, uint256 feeAmount)"
]);
var demoOracleAbi = parseAbi([
  "function getPrice(address token) view returns (uint256)",
  "function isDemo() view returns (bool)"
]);

// packages/adapter-evm/src/snapshot.ts
import { zeroHash } from "viem";
var SNAPSHOT_VALIDITY_SECONDS = 20n;
function checkedBlock(value, label) {
  const block = value;
  const now = BigInt(Math.floor(Date.now() / 1e3));
  if (!block || typeof block.number !== "bigint" || block.number <= 0n || typeof block.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || block.hash.toLowerCase() === zeroHash || typeof block.timestamp !== "bigint" || block.timestamp <= 0n || block.timestamp > now || now - block.timestamp >= SNAPSHOT_VALIDITY_SECONDS)
    throw new Error(`${label} data is out of date or unconfirmed. Refresh before continuing.`);
  return { number: block.number, hash: block.hash, timestamp: block.timestamp };
}
async function readSnapshot(client, label) {
  const block = checkedBlock(await client.getBlock({ blockTag: "latest" }), label);
  return {
    block,
    validUntil: block.timestamp + SNAPSHOT_VALIDITY_SECONDS,
    async finish(result) {
      const canonical = checkedBlock(await client.getBlock({ blockNumber: block.number }), label);
      if (canonical.number !== block.number || canonical.hash.toLowerCase() !== block.hash.toLowerCase() || canonical.timestamp !== block.timestamp)
        throw new Error(`${label} state changed during verification. Refresh before continuing.`);
      checkedBlock(block, label);
      return result;
    }
  };
}

// packages/adapter-evm/src/demo-trading.ts
var same = (a, b) => a.toLowerCase() === b.toLowerCase();
function requireState(value, message) {
  if (!value) throw new Error(message);
}
var validAddress = (value) => isAddress(value) && !same(value, zeroAddress);
async function readDemoContext(client, deployment) {
  const chainId = await client.getChainId();
  requireState(chainId === 84532, "Demo trading requires Base Sepolia.");
  const config = deployment ?? DEMO_DEPLOYMENTS[84532];
  requireState(config?.chainId === 84532, "Demo trading is being prepared.");
  requireState(
    [config.exchange, config.oracle, config.quoteToken, ...config.assets.map((a) => a.token)].every(validAddress),
    "Demo deployment is invalid."
  );
  requireState(
    config.assets.length === (config.mode === "multi-asset" ? 8 : 4) && new Set(config.assets.map((a) => a.token.toLowerCase())).size === config.assets.length && !config.assets.some((a) => same(a.token, config.quoteToken)),
    "Demo assets are invalid."
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
    client.readContract({ address: config.oracle, abi: demoOracleAbi, functionName: "isDemo", blockNumber })
  ]);
  requireState(
    exchangeCode && exchangeCode !== "0x" && same(keccak256(exchangeCode), config.exchangeCodehash),
    "Demo exchange could not be verified."
  );
  requireState(
    oracleCode && oracleCode !== "0x" && same(keccak256(oracleCode), config.oracleCodehash),
    "Demo pricing could not be verified."
  );
  requireState(
    same(oracle, config.oracle) && same(quoteToken, config.quoteToken) && isDemo === true && feeBps === 30n && maxStockAmount === 25n * 10n ** BigInt(config.mode === "multi-asset" ? 18 : 8),
    "Demo configuration differs from the reviewed deployment."
  );
  return { config, snapshot, exchange, blockNumber, feeBps, maxStockAmount };
}
async function readDemoMarket(client, deployment) {
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
          blockNumber
        }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "decimals", blockNumber }),
        client.readContract({ address: asset.token, abi: erc20Abi, functionName: "symbol", blockNumber })
      ]);
      requireState(
        supported === true && price > 0n && decimals === asset.decimals && [6, 8, 18].includes(decimals) && symbol === asset.symbol,
        "Asset configuration is unavailable."
      );
      const maxAmount = config.mode === "multi-asset" ? await client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [asset.token] }) : maxStockAmount;
      requireState(
        maxAmount === 25n * 10n ** BigInt(asset.decimals),
        "Asset quantity limit differs from the deployment."
      );
      return { ...asset, priceUsd8: price, maxAmount };
    })
  );
  const [usdDecimals, usdSymbol] = await Promise.all([
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "decimals", blockNumber }),
    client.readContract({ address: config.quoteToken, abi: erc20Abi, functionName: "symbol", blockNumber })
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
    quoteToken: { token: config.quoteToken, symbol: "TestUSDC", decimals: 6 }
  });
}
async function readDemoTradeQuote(client, request, deployment) {
  requireState(request.side === "buy" || request.side === "sell", "Choose Buy or Sell.");
  requireState(
    validAddress(request.asset) && typeof request.amount === "bigint" && request.amount > 0n && request.amount <= maxUint256,
    "Enter a valid asset amount."
  );
  requireState(request.owner === void 0 || validAddress(request.owner), "Wallet address is invalid.");
  const { config, snapshot, exchange, blockNumber, maxStockAmount } = await readDemoContext(client, deployment);
  const asset = config.assets.find((a) => same(a.token, request.asset));
  const maximum = asset && config.mode === "multi-asset" ? await client.readContract({ ...exchange, functionName: "maxAssetAmount", args: [asset.token] }) : maxStockAmount;
  requireState(
    asset && maximum === 25n * 10n ** BigInt(asset.decimals) && request.amount <= maximum,
    "Choose a supported asset and an amount up to 25 tokens."
  );
  const buy = request.side === "buy";
  const [supported, quote] = await Promise.all([
    client.readContract({ ...exchange, functionName: "supportedStock", args: [asset.token] }),
    client.readContract({ ...exchange, functionName: "quote", args: [asset.token, buy, request.amount] })
  ]);
  const [usdAmount, feeAmount, priceUsd8] = quote;
  requireState(
    supported && usdAmount > 0n && feeAmount >= 0n && priceUsd8 > 0n,
    "No executable demo quote is available."
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
    blockNumber
  });
  requireState(outputBalance >= outputAmount, "Demo trading inventory is insufficient for this amount.");
  return snapshot.finish({
    ...request,
    asset: asset.token,
    owner: request.owner ? getAddress(request.owner) : void 0,
    chainId: 84532,
    exchange: config.exchange,
    inputToken,
    outputToken,
    inputAmount,
    outputAmount,
    feeAmount,
    priceUsd8,
    quotedAt: Number(snapshot.block.timestamp),
    validUntil: Number(snapshot.validUntil)
  });
}

// packages/adapter-evm/src/abis/compositeOracle.ts
var compositeOracleAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "COOLDOWN_PERIOD",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "EMERGENCY_OVERRIDE_DELAY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "EMERGENCY_OVERRIDE_EXPIRY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "FEED_REMOVAL_DELAY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "FEED_REMOVAL_EXPIRY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_CHALLENGE_DURATION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "authorizedCallerAt",
    inputs: [
      {
        name: "index",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "authorizedCallerCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "authorizedCallers",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "cancelChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledOverride",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledRemoveTokenOracleFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "challengeDurationSec",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "challengeForToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "clearAuthorizedCallers",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "deviationThresholdBps",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "emergencyCancelChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "emergencyOverrides",
    inputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [
      {
        name: "executableAt",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "expiresAt",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "stateNonce",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "finalizeChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "forceResetToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getCurrentDeviation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getEquivalentAmount",
    inputs: [
      {
        name: "tokenA",
        type: "address",
        internalType: "address"
      },
      {
        name: "amountA",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "tokenB",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getEquivalentAmountUnsafe",
    inputs: [
      {
        name: "tokenA",
        type: "address",
        internalType: "address"
      },
      {
        name: "amountA",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "tokenB",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getOracleType",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPrice",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPriceForFeeAccrual",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPriceUnsafe",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPriceWithStrictCircuitBreaker",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getTokenDualFeedStatus",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "isDualFeed",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "primaryFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "isBackupActive",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "isChallengePending",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "challengeStartTime",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getTokenOracleFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getValue",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getValueUnsafe",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getValueWithFallback",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "value",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "isReliable",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isBackupActiveForToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isPriceStale",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "isStale",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "publishTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isTokenChallengeable",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isTokenSupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "removeTokenOracleFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "revertToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleEmergencyCancelChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleForceResetToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleRemoveTokenOracleFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduledRemovalTime",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setAuthorizedCaller",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      },
      {
        name: "authorized",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setChallengeDuration",
    inputs: [
      {
        name: "newDurationSec",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setDeviationThreshold",
    inputs: [
      {
        name: "newThresholdBps",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setStrictCircuitBreakerRequired",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "required",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTokenOracleFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTokenOracleFeedDual",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "primaryFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTokenOracleFeedWithType",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleType",
        type: "string",
        internalType: "string"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "strictCircuitBreakerRequired",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "supportsCircuitBreaker",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "supportsStrictProtectedPrice",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "AuthorizedCallerSet",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "authorized",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "BackupFeedSet",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ChallengeCancelled",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "reason",
        type: "string",
        indexed: false,
        internalType: "string"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ChallengeDurationUpdated",
    inputs: [
      {
        name: "oldDuration",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newDuration",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ChallengeFinalized",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "finalizer",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ChallengeInitiated",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "challenger",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "primaryPrice",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "backupPrice",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "deviation",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CooldownApplied",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "trigger",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "cooldownUntil",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "reason",
        type: "string",
        indexed: false,
        internalType: "string"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "DeviationThresholdUpdated",
    inputs: [
      {
        name: "oldThreshold",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newThreshold",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "EmergencyOverrideCancelled",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "EmergencyOverrideScheduled",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      },
      {
        name: "executableAt",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "stateNonce",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OracleSwitched",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "isBackupActive",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "RevertedToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "deviation",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "StrictCircuitBreakerRequirementUpdated",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oldRequired",
        type: "bool",
        indexed: false,
        internalType: "bool"
      },
      {
        name: "newRequired",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenOracleFeedRemovalCancelled",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenOracleFeedRemovalScheduled",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "executableAt",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenOracleFeedRemoved",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenOracleFeedSet",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "CancelNotPossible",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "ChallengeNotPossible",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "CircuitBreakerNotSupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "feed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "DecimalNormalizationOverflow",
    inputs: [
      {
        name: "price",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "fromDecimals",
        type: "uint8",
        internalType: "uint8"
      },
      {
        name: "toDecimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "EmergencyOverrideExpired",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "EmergencyOverrideNotScheduled",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "EmergencyOverridePreconditionNotMet",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "reason",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "EmergencyOverrideStateChanged",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "EmergencyOverrideTooEarly",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "executableAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "FeeAccrualBasisMismatch",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "primaryFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "FinalizeNotPossible",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidAuthorizedCaller",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidChallengeDuration",
    inputs: [
      {
        name: "duration",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidDeviationThreshold",
    inputs: [
      {
        name: "threshold",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidOracleFeed",
    inputs: [
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidPrice",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "price",
        type: "int256",
        internalType: "int256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidPrice",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "price",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidTokenAddress",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidTokenDecimals",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "decimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "NotDualFeedToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OracleChallengePending",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OraclePriceDisputed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "RevertNotPossible",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "reason",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "SameFeedNotAllowed",
    inputs: [
      {
        name: "feed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "TokenNotSupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "TokenOracleFeedRemovalExpired",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "expiredAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "TokenOracleFeedRemovalNotScheduled",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "TokenOracleFeedRemovalTooEarly",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "executableAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "UnauthorizedCaller",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  }
];

// packages/adapter-evm/src/abis/erc20.ts
var erc20Abi2 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }]
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  }
];

// packages/adapter-evm/src/abis/protectorReceiptNft.ts
var protectorReceiptNftAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "MAX_TRANSFER_LOCK",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MIN_TRANSFER_LOCK",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "burn",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPosition",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IProtectorReceiptNFT.ProtectorPosition",
        components: [
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "depositTime",
            type: "uint64",
            internalType: "uint64"
          },
          {
            name: "unlockRequestTime",
            type: "uint64",
            internalType: "uint64"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPositionWithFreshness",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "position",
        type: "tuple",
        internalType: "struct IProtectorReceiptNFT.ProtectorPosition",
        components: [
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "depositTime",
            type: "uint64",
            internalType: "uint64"
          },
          {
            name: "unlockRequestTime",
            type: "uint64",
            internalType: "uint64"
          }
        ]
      },
      {
        name: "isAmountFresh",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nextTokenId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pool",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "positions",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "depositTime",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "unlockRequestTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPool",
    inputs: [
      {
        name: "_pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTransferLockPeriod",
    inputs: [
      {
        name: "newPeriod",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setUnlockRequestTime",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "time",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferLockPeriod",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updateAmount",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "approved",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ParameterUpdated",
    inputs: [
      {
        name: "parameterName",
        type: "string",
        indexed: false,
        internalType: "string"
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorNFTBurned",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorNFTMinted",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorNFTPoolSet",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "ERC721IncorrectOwner",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InsufficientApproval",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidApprover",
    inputs: [
      {
        name: "approver",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidOperator",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidReceiver",
    inputs: [
      {
        name: "receiver",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721NonexistentToken",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidPoolAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidUnlockDuration",
    inputs: []
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: []
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "PoolAlreadySet",
    inputs: []
  },
  {
    type: "error",
    name: "TokenDoesNotExist",
    inputs: []
  },
  {
    type: "error",
    name: "TransferLocked",
    inputs: [
      {
        name: "unlockTime",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  }
];

// packages/adapter-evm/src/abis/shieldReceiptNft.ts
var shieldReceiptNftAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "MAX_TRANSFER_LOCK",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MIN_TRANSFER_LOCK",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "balanceOf",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "burn",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getApproved",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPosition",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct IShieldReceiptNFT.ShieldPosition",
        components: [
          {
            name: "amount",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "depositTime",
            type: "uint64",
            internalType: "uint64"
          },
          {
            name: "valueAtDeposit",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "collateralAmount",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "lastFeeClaimTime",
            type: "uint64",
            internalType: "uint64"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isApprovedForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "mint",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "valueAtDeposit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "collateralAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "mintWithDepositTime",
    inputs: [
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "valueAtDeposit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "collateralAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "originalDepositTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    outputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "nextTokenId",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "ownerOf",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pool",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "positions",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "depositTime",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "valueAtDeposit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "collateralAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "lastFeeClaimTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "safeTransferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setApprovalForAll",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPool",
    inputs: [
      {
        name: "_pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTransferLockPeriod",
    inputs: [
      {
        name: "newPeriod",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "supportsInterface",
    inputs: [
      {
        name: "interfaceId",
        type: "bytes4",
        internalType: "bytes4"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tokenURI",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferFrom",
    inputs: [
      {
        name: "from",
        type: "address",
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferLockPeriod",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updatePosition",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newValue",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newCollateralAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newLastFeeClaimTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "Approval",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "approved",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ApprovalForAll",
    inputs: [
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "operator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "approved",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ParameterUpdated",
    inputs: [
      {
        name: "parameterName",
        type: "string",
        indexed: false,
        internalType: "string"
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldNFTBurned",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldNFTMinted",
    inputs: [
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "valueAtDeposit",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldNFTPoolSet",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      {
        name: "from",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "to",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "ERC721IncorrectOwner",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InsufficientApproval",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidApprover",
    inputs: [
      {
        name: "approver",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidOperator",
    inputs: [
      {
        name: "operator",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidReceiver",
    inputs: [
      {
        name: "receiver",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721InvalidSender",
    inputs: [
      {
        name: "sender",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC721NonexistentToken",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "FutureTimestamp",
    inputs: [
      {
        name: "provided",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "currentTime",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidPoolAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidUnlockDuration",
    inputs: []
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: []
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "PoolAlreadySet",
    inputs: []
  },
  {
    type: "error",
    name: "TokenDoesNotExist",
    inputs: []
  },
  {
    type: "error",
    name: "TransferLocked",
    inputs: [
      {
        name: "unlockTime",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  }
];

// packages/adapter-evm/src/abis/splitRiskPool.ts
var splitRiskPoolAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "fallback",
    stateMutability: "nonpayable"
  },
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "BACKING_TOKEN",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "COLLATERAL_RATIO",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "COMMISSION_RATE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "POOL_CREATOR",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "POOL_FACTORY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "POOL_FEE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "SHIELDED_TOKEN",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "UPGRADE_INTERFACE_VERSION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "acceptGovernanceTimelock",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "acceptGovernanceTimelockFromFactory",
    inputs: [
      {
        name: "expectedGovernanceTimelock",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "accessControl",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "accessControlCanGateWithdrawals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "accumulatedCommissions",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "accumulatedPoolFee",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "accumulatedProtocolFee",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "backingTokenDecimals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "backingTokenScale",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "cancelGovernanceTimelockFromFactory",
    inputs: [
      {
        name: "expectedGovernanceTimelock",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelGovernanceTimelockTransfer",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelUnlockProcess",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimCommission",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimExpiredProtectorBacking",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minAmountOut",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "received",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "claimRewards",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "commissionsClaimed",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "currentEpochCommissionReserve",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "depositBackingAsset",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address"
      },
      {
        name: "depositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minReceivedAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "depositShieldedAsset",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address"
      },
      {
        name: "depositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minReceivedAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "feeValueBaselineUsd",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "forfeitCommission",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getAccessControlStatus",
    inputs: [],
    outputs: [
      {
        name: "activeAccessControl",
        type: "address",
        internalType: "address"
      },
      {
        name: "depositsGated",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "withdrawalsGated",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "governanceInstalled",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getAvailableForWithdrawal",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getClaimableCommission",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getExpiredProtectorBackingClaim",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getLockedAmount",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getOracleInfo",
    inputs: [],
    outputs: [
      {
        name: "oracle",
        type: "address",
        internalType: "address"
      },
      {
        name: "isDualOracle",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "primaryFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "isBackupActive",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPoolBalances",
    inputs: [],
    outputs: [
      {
        name: "shieldedTokenPoolBalance",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "totalBackingTokenPoolBalance",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getProtectorDepositInfo",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "depositTime",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "unlockRequestTime",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "lockedAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "availableAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "claimableCommission",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getProtectorPositionAmount",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getReservedFees",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getShieldDepositInfo",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "depositTime",
        type: "uint64",
        internalType: "uint64"
      },
      {
        name: "valueAtDeposit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "lastFeeClaimTime",
        type: "uint64",
        internalType: "uint64"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUserNFTCounts",
    inputs: [
      {
        name: "user",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "shieldNFTCount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "protectorNFTCount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUtilizationRatio",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getUtilizationRatioUsd",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getWithdrawableBalance",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "governanceAccessControlInstalled",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "governanceTimelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "hasEverLaunched",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "historicalCommissionReserve",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "_shieldedTokenInfo",
        type: "tuple",
        internalType: "struct TokenWhitelistLib.TokenInfo",
        components: [
          {
            name: "name",
            type: "string",
            internalType: "string"
          },
          {
            name: "symbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "token",
            type: "address",
            internalType: "address"
          },
          {
            name: "primaryOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "backupOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "minCollateralRatioBp",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "_backingTokenInfo",
        type: "tuple",
        internalType: "struct TokenWhitelistLib.TokenInfo",
        components: [
          {
            name: "name",
            type: "string",
            internalType: "string"
          },
          {
            name: "symbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "token",
            type: "address",
            internalType: "address"
          },
          {
            name: "primaryOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "backupOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "minCollateralRatioBp",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "_commissionRate",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolFee",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolCreator",
        type: "address",
        internalType: "address"
      },
      {
        name: "_collateralRatio",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_governanceTimelock",
        type: "address",
        internalType: "address"
      },
      {
        name: "_priceOracle",
        type: "address",
        internalType: "address"
      },
      {
        name: "_protocolFeeRecipient",
        type: "address",
        internalType: "address"
      },
      {
        name: "_shieldReceiptNFT",
        type: "address",
        internalType: "address"
      },
      {
        name: "_protectorReceiptNFT",
        type: "address",
        internalType: "address"
      },
      {
        name: "initialOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "initializeWithAccessControl",
    inputs: [
      {
        name: "_shieldedTokenInfo",
        type: "tuple",
        internalType: "struct TokenWhitelistLib.TokenInfo",
        components: [
          {
            name: "name",
            type: "string",
            internalType: "string"
          },
          {
            name: "symbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "token",
            type: "address",
            internalType: "address"
          },
          {
            name: "primaryOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "backupOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "minCollateralRatioBp",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "_backingTokenInfo",
        type: "tuple",
        internalType: "struct TokenWhitelistLib.TokenInfo",
        components: [
          {
            name: "name",
            type: "string",
            internalType: "string"
          },
          {
            name: "symbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "token",
            type: "address",
            internalType: "address"
          },
          {
            name: "primaryOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "backupOracleFeed",
            type: "address",
            internalType: "address"
          },
          {
            name: "minCollateralRatioBp",
            type: "uint256",
            internalType: "uint256"
          }
        ]
      },
      {
        name: "_commissionRate",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolFee",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolCreator",
        type: "address",
        internalType: "address"
      },
      {
        name: "_collateralRatio",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_governanceTimelock",
        type: "address",
        internalType: "address"
      },
      {
        name: "_priceOracle",
        type: "address",
        internalType: "address"
      },
      {
        name: "_protocolFeeRecipient",
        type: "address",
        internalType: "address"
      },
      {
        name: "_shieldReceiptNFT",
        type: "address",
        internalType: "address"
      },
      {
        name: "_protectorReceiptNFT",
        type: "address",
        internalType: "address"
      },
      {
        name: "initialOwner",
        type: "address",
        internalType: "address"
      },
      {
        name: "initialAccessControl",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "isAssetSupported",
    inputs: [
      {
        name: "asset",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "supported",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastClaimRewardsTime",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "partialWithdrawShielded",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "withdrawAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "preferredAsset",
        type: "address",
        internalType: "address"
      },
      {
        name: "minAmountOut",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "newTokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "pauseFromFactory",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "payPoolFee",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "payProtocolFee",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "pendingGovernanceTimelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pendingProtectorRewardDust",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolConfig",
    inputs: [],
    outputs: [
      {
        name: "shieldedMinDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "shieldedMaxDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "backingMinDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "backingMaxDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "maxTotalValueLockedUsd",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minimumPoolTime",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "unlockDuration",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "protocolFeeRecipient",
        type: "address",
        internalType: "address"
      },
      {
        name: "protocolFee",
        type: "uint96",
        internalType: "uint96"
      },
      {
        name: "priceOracle",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolFeeRecipient",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolState",
    inputs: [],
    outputs: [
      {
        name: "shieldedTokenBalance",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "totalBackingTokenBalance",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochBackingPositionSettled",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochBackingRemainingReserve",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochBackingRemainingShares",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochFinalRewardPerShare",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochPositionSettled",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochRemainingReserve",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorEpochRemainingShares",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorReceiptNFT",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorShareEpoch",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorShareEpochs",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorShares",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "protectorWithdraw",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "preferredAsset",
        type: "address",
        internalType: "address"
      },
      {
        name: "minAmountOut",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "proxiableUUID",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "refreshStrictProtectedBackingPriceFlag",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "requiresStrictProtectedBackingPrice",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "resetShieldedTokenTransferIntegrity",
    inputs: [
      {
        name: "probeAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "rewardDebt",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "rewardPerShareAccumulated",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "setAccessControl",
    inputs: [
      {
        name: "newAccessControl",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setGovernanceTimelock",
    inputs: [
      {
        name: "newGovernanceTimelock",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setGovernanceTimelockFromFactory",
    inputs: [
      {
        name: "newGovernanceTimelock",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPoolFeeRecipient",
    inputs: [
      {
        name: "newRecipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setProtectorTransferLockPeriod",
    inputs: [
      {
        name: "newPeriod",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setShieldTransferLockPeriod",
    inputs: [
      {
        name: "newPeriod",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "settleExpiredProtectorBacking",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minAmountOut",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "received",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "settleExpiredProtectorPosition",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "shieldReceiptNFT",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shieldedTokenDecimals",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint8",
        internalType: "uint8"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shieldedTokenScale",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shieldedTokenTransferIntegrityBroken",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shieldedTransferIntegrityProbe",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "contract TransferIntegrityProbe"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "shieldedWithdraw",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "preferredAsset",
        type: "address",
        internalType: "address"
      },
      {
        name: "minAmountOut",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "startUnlockProcess",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "sweepInactiveProtectorBackingDustFromFactory",
    inputs: [],
    outputs: [
      {
        name: "sweptAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "sweepUnaccountedSurplusFromFactory",
    inputs: [],
    outputs: [
      {
        name: "shieldedSweptAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "backingSweptAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "totalCommissionsEverAccumulated",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalProtectorShares",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalProtectorTokens",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalShieldCollateralAmount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalShieldedTokens",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "totalValueAtDeposit",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updatePoolConfig",
    inputs: [
      {
        name: "newShieldedMinDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newShieldedMaxDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newBackingMinDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newBackingMaxDepositAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newMaxTotalValueLockedUsd",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newMinimumPoolTime",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newUnlockDuration",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newProtocolFee",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "newProtocolFeeRecipient",
        type: "address",
        internalType: "address"
      },
      {
        name: "newPriceOracle",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      {
        name: "newImplementation",
        type: "address",
        internalType: "address"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "event",
    name: "AccessControlStatusUpdated",
    inputs: [
      {
        name: "accessControl",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "depositsGated",
        type: "bool",
        indexed: false,
        internalType: "bool"
      },
      {
        name: "withdrawalsGated",
        type: "bool",
        indexed: false,
        internalType: "bool"
      },
      {
        name: "governanceInstalled",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "AccessControlUpdated",
    inputs: [
      {
        name: "previousAccessControl",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newAccessControl",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CommissionClaimed",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CommissionForfeited",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "owner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "FeeDropped",
    inputs: [
      {
        name: "feeType",
        type: "string",
        indexed: false,
        internalType: "string"
      },
      {
        name: "droppedAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "currentAccumulated",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockTransferCancelled",
    inputs: [
      {
        name: "currentGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "cancelledGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockTransferStarted",
    inputs: [
      {
        name: "currentGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "pendingGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockUpdated",
    inputs: [
      {
        name: "previousGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
        internalType: "uint64"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "NoCommissionToClaim",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ParameterUpdated",
    inputs: [
      {
        name: "parameterName",
        type: "string",
        indexed: false,
        internalType: "string"
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PartialWithdrawal",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oldTokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "newTokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "withdrawAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "remainingAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Paused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolConfigUpdated",
    inputs: [
      {
        name: "shieldedMinDepositAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "shieldedMaxDepositAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "backingMinDepositAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "backingMaxDepositAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "maxTotalValueLockedUsd",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "minimumPoolTime",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "unlockDuration",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "protocolFee",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "protocolFeeRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "priceOracle",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolFeePaid",
    inputs: [
      {
        name: "creator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolFeeRecipientUpdated",
    inputs: [
      {
        name: "oldRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolUnaccountedSurplusSwept",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "nominalAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "receivedAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorAssetDeposited",
    inputs: [
      {
        name: "depositor",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "receiptTokenId",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorAssetWithdrawn",
    inputs: [
      {
        name: "user",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "assets",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "shares",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorResidualBackingReserved",
    inputs: [
      {
        name: "epoch",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtectorResidualBackingSwept",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtocolFeePaid",
    inputs: [
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtocolFeeRecipientUpdated",
    inputs: [
      {
        name: "oldRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "RewardsClaimed",
    inputs: [
      {
        name: "shieldedAddress",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "feesCharged",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldActivated",
    inputs: [
      {
        name: "withdrawer",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "shieldedTokenAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "backingTokenAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldedAssetDeposited",
    inputs: [
      {
        name: "depositor",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "asset",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "receiptTokenId",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldedTokenTransferIntegrityBroken",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "nominalAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "receivedAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldedTokenTransferIntegrityRestored",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "probeAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ShieldedWithdrawal",
    inputs: [
      {
        name: "withdrawer",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "preferredAsset",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "StrictPricingProbeFailed",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "factory",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "UnlockProcessCancelled",
    inputs: [
      {
        name: "protector",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "UnlockProcessStarted",
    inputs: [
      {
        name: "protector",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "tokenId",
        type: "uint256",
        indexed: true,
        internalType: "uint256"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Unpaused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "AccessControlDenied",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      },
      {
        name: "operation",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "AccountedBalanceExceedsTokenBalance",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "accountedBalance",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "actualBalance",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "AddressEmptyCode",
    inputs: [
      {
        name: "target",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ClaimRewardsCooldownNotMet",
    inputs: [
      {
        name: "availableAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "DecimalNormalizationOverflow",
    inputs: [
      {
        name: "price",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "fromDecimals",
        type: "uint8",
        internalType: "uint8"
      },
      {
        name: "toDecimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "DepositAmountTooLarge",
    inputs: []
  },
  {
    type: "error",
    name: "ERC1967InvalidImplementation",
    inputs: [
      {
        name: "implementation",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC1967NonPayable",
    inputs: []
  },
  {
    type: "error",
    name: "ERC4626BackingOracleUnsupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "EnforcedPause",
    inputs: []
  },
  {
    type: "error",
    name: "EtherTransferNotAllowed",
    inputs: []
  },
  {
    type: "error",
    name: "ExpectedPause",
    inputs: []
  },
  {
    type: "error",
    name: "FailedCall",
    inputs: []
  },
  {
    type: "error",
    name: "FeeAccrualWouldConsumePosition",
    inputs: [
      {
        name: "tokenId",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "positionAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "feeAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockAdminRetained",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "retainedAdmin",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockDelayTooLong",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "delay",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "maxDelay",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockDelayTooShort",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "minDelay",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockHasExtraAdmins",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "adminCount",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockImplementationMismatch",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "expectedCodehash",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "actualCodehash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockInvalidRoleMemberCount",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "role",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "memberCount",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockRoleMemberMismatch",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "role",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "expectedMember",
        type: "address",
        internalType: "address"
      },
      {
        name: "actualMember",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceZeroAddress",
    inputs: []
  },
  {
    type: "error",
    name: "IncompatibleShieldedTokenForCrossAssetWithdrawal",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InsufficientDepositAmount",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientPoolTimeWithDetails",
    inputs: [
      {
        name: "requiredTime",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "elapsedTime",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "InsufficientProtectorTokenBalance",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientTokenBalance",
    inputs: []
  },
  {
    type: "error",
    name: "InsufficientUnlockedTokens",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidAccessControlAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidAssetAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidCollateralRatio",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidCommissionRate",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidDepositAmountBounds",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidGovernanceTimelock",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidMinimumPoolTime",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidOraclePrice",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidPoolCreator",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidPoolFee",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidProtocolFee",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidProtocolFeeRecipient",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidTokenAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidTokenDecimals",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "decimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidTokenId",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidUnlockDuration",
    inputs: []
  },
  {
    type: "error",
    name: "NoPendingGovernance",
    inputs: []
  },
  {
    type: "error",
    name: "NoTokensToWithdraw",
    inputs: []
  },
  {
    type: "error",
    name: "NoUnlockToCancel",
    inputs: []
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: []
  },
  {
    type: "error",
    name: "NotOwner",
    inputs: []
  },
  {
    type: "error",
    name: "OraclePendingChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "PartialWithdrawalBelowMinimum",
    inputs: []
  },
  {
    type: "error",
    name: "PoolNotActive",
    inputs: []
  },
  {
    type: "error",
    name: "PoolNotEmptyForDeactivation",
    inputs: []
  },
  {
    type: "error",
    name: "ProtectorShareLimitExceeded",
    inputs: [
      {
        name: "shares",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "maxShares",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: []
  },
  {
    type: "error",
    name: "RewardAccumulationIncomplete",
    inputs: [
      {
        name: "expected",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "accumulated",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "redirected",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ShieldedFeePriceUnavailable",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "SlippageProtectionFailed",
    inputs: [
      {
        name: "minExpected",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "actualReceived",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "TVLLimitExceeded",
    inputs: []
  },
  {
    type: "error",
    name: "TransferIntegrityProbeRequired",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "TransferOperationFailed",
    inputs: []
  },
  {
    type: "error",
    name: "UUPSUnauthorizedCallContext",
    inputs: []
  },
  {
    type: "error",
    name: "UUPSUnsupportedProxiableUUID",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "UnauthorizedGovernance",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "UnauthorizedPendingGovernance",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "UnexpectedOutboundTransferAmount",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "expectedDebited",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "actualDebited",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "UnlockProcessAlreadyStarted",
    inputs: []
  },
  {
    type: "error",
    name: "UnsupportedAsset",
    inputs: []
  },
  {
    type: "error",
    name: "UpgradeDisabled",
    inputs: []
  }
];

// packages/adapter-evm/src/abis/splitRiskPoolFactory.ts
var splitRiskPoolFactoryAbi = [
  {
    type: "constructor",
    inputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "fallback",
    stateMutability: "nonpayable"
  },
  {
    type: "receive",
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "DEFAULT_MINIMUM_CREATION_BOND_USD",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "ERC4626_ORACLE_FEED_ROLE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "MAX_POOLS",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "PROTECTOR_ONLY_POOL_DEACTIVATION_DELAY",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "PYTH_ORACLE_ROLE",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "UPGRADE_INTERFACE_VERSION",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "string",
        internalType: "string"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "acceptGovernanceTimelock",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "acceptPoolGovernanceTimelockTransfers",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "activePoolCount",
    inputs: [],
    outputs: [
      {
        name: "count",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "activePools",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "addToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "primaryOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "minCollateralRatioBp",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "staticBalanceAcknowledged",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "addTokenInitial",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "primaryOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "minCollateralRatioBp",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "staticBalanceAcknowledged",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "assertPinnedPoolImplementation",
    inputs: [
      {
        name: "expectedImplementation",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "bootstrapModeEnabled",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "cancelCompositeOracleScheduledOverride",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "action",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelGovernanceTimelockTransfer",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelPoolGovernanceTimelockTransfers",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "expectedPendingGovernance",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledCompositeOracleTokenFeedRemoval",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledERC4626VaultRemoval",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledERC4626VaultSharePriceReferenceRefresh",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "cancelScheduledPythTokenRemoval",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "closePool",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "compositeOracle",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "createPool",
    inputs: [
      {
        name: "_shieldedToken",
        type: "address",
        internalType: "address"
      },
      {
        name: "_shieldedTokenSymbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "_backingToken",
        type: "address",
        internalType: "address"
      },
      {
        name: "_backingTokenSymbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "_commissionRate",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolFee",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_colleteralRatio",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_creationBondAmount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "poolAddress",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "createPoolWithAccessControl",
    inputs: [
      {
        name: "_shieldedToken",
        type: "address",
        internalType: "address"
      },
      {
        name: "_shieldedTokenSymbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "_backingToken",
        type: "address",
        internalType: "address"
      },
      {
        name: "_backingTokenSymbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "_commissionRate",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_poolFee",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_colleteralRatio",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "_creationBondAmount",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "initialAccessControl",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "poolAddress",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "creationBonds",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "creator",
        type: "address",
        internalType: "address"
      },
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "deactivateDustPool",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "deactivatePool",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "deactivateProtectorOnlyPool",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "defaultProtocolFeeRecipient",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "erc4626OracleFeed",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "executeCompositeOracleEmergencyCancelChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "executeCompositeOracleForceResetToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "finalizeBootstrap",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getActivePools",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
        internalType: "address[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getActivePoolsInfo",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        internalType: "struct ISplitRiskPoolFactory.PoolInfo[]",
        components: [
          {
            name: "shieldedToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "backingToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "shieldedTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "backingTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "commissionRate",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "poolFee",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "colleteralRatio",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "createdAt",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "creator",
            type: "address",
            internalType: "address"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPoolInfo",
    inputs: [
      {
        name: "_poolAddress",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "tuple",
        internalType: "struct ISplitRiskPoolFactory.PoolInfo",
        components: [
          {
            name: "shieldedToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "backingToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "shieldedTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "backingTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "commissionRate",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "poolFee",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "colleteralRatio",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "createdAt",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "creator",
            type: "address",
            internalType: "address"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPools",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "poolSlice",
        type: "address[]",
        internalType: "address[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getPoolsInfo",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "poolInfoSlice",
        type: "tuple[]",
        internalType: "struct ISplitRiskPoolFactory.PoolInfo[]",
        components: [
          {
            name: "shieldedToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "backingToken",
            type: "address",
            internalType: "address"
          },
          {
            name: "shieldedTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "backingTokenSymbol",
            type: "string",
            internalType: "string"
          },
          {
            name: "commissionRate",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "poolFee",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "colleteralRatio",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "createdAt",
            type: "uint256",
            internalType: "uint256"
          },
          {
            name: "creator",
            type: "address",
            internalType: "address"
          }
        ]
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getWhitelistedTokens",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
        internalType: "address[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "governanceTimelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "initialOwner",
        type: "address",
        internalType: "address"
      },
      {
        name: "governanceTimelock_",
        type: "address",
        internalType: "address"
      },
      {
        name: "poolImplementation_",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "isPoolActive",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isWhitelisted",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "maxActivePools",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "minimumCreationBondUsd",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "paused",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pendingGovernanceTimelock",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolCount",
    inputs: [],
    outputs: [
      {
        name: "count",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "poolImplementationCodehash",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pools",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "proxiableUUID",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "pythOracle",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "refreshERC4626VaultSharePriceReference",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "registerERC4626Vault",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      },
      {
        name: "underlying",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "removeCompositeOracleTokenFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "removeERC4626Vault",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "removePythToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "removeToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleCompositeOracleEmergencyCancelChallenge",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleCompositeOracleForceResetToPrimary",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleCompositeOracleTokenFeedRemoval",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleERC4626VaultRemoval",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "scheduleERC4626VaultSharePriceReferenceRefresh",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "schedulePythTokenRemoval",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracle",
    inputs: [
      {
        name: "newOracle",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracleAuthorizedCaller",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      },
      {
        name: "authorized",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracleChallengeDuration",
    inputs: [
      {
        name: "newDurationSec",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracleDeviationThreshold",
    inputs: [
      {
        name: "newThresholdBps",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracleTokenFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setCompositeOracleTokenFeedDual",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "primaryFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupFeed",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setDefaultProtocolFeeRecipient",
    inputs: [
      {
        name: "newRecipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setERC4626UnderlyingPriceOracle",
    inputs: [
      {
        name: "underlyingPriceOracle",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setERC4626VaultSharePriceDeviation",
    inputs: [
      {
        name: "vault",
        type: "address",
        internalType: "address"
      },
      {
        name: "maxDeviationBps",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setGovernanceTimelock",
    inputs: [
      {
        name: "newGovernanceTimelock",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setManagedERC4626OracleFeed",
    inputs: [
      {
        name: "newOracle",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setManagedPythOracle",
    inputs: [
      {
        name: "newOracle",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setMaxActivePools",
    inputs: [
      {
        name: "newMaxActivePools",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setMinimumCreationBondUsd",
    inputs: [
      {
        name: "newMinUsd",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPoolImplementation",
    inputs: [
      {
        name: "newImplementation",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxCompositePublishTimeSkew",
    inputs: [
      {
        name: "maxSkew",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxConfidenceBps",
    inputs: [
      {
        name: "maxConfidenceBps",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxEmaConfidenceBps",
    inputs: [
      {
        name: "maxEmaConfidenceBps",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxPriceAge",
    inputs: [
      {
        name: "maxPriceAge",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxPriceAgeForFeedId",
    inputs: [
      {
        name: "feedId",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "maxPriceAge",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxPriceAgeForToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "maxPriceAge",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythMaxPriceDeviation",
    inputs: [
      {
        name: "maxPriceDeviation",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythTokenCompositePriceFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "baseFeedId",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "quoteUsdFeedId",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setPythTokenPriceFeed",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "feedId",
        type: "bytes32",
        internalType: "bytes32"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTokenRequiresStrictProtectedPrice",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "required",
        type: "bool",
        internalType: "bool"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "splitRiskPoolImplementation",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "startPoolGovernanceTimelockTransfers",
    inputs: [
      {
        name: "offset",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "limit",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "tokenInfo",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "name",
        type: "string",
        internalType: "string"
      },
      {
        name: "symbol",
        type: "string",
        internalType: "string"
      },
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "primaryOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "backupOracleFeed",
        type: "address",
        internalType: "address"
      },
      {
        name: "minCollateralRatioBp",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "tokenRequiresStrictProtectedPrice",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferManagedOracleOwnership",
    inputs: [
      {
        name: "oracle",
        type: "address",
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "unpause",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "updateMinimumCollateral",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "newMinCollateralRatioBp",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "upgradeToAndCall",
    inputs: [
      {
        name: "newImplementation",
        type: "address",
        internalType: "address"
      },
      {
        name: "data",
        type: "bytes",
        internalType: "bytes"
      }
    ],
    outputs: [],
    stateMutability: "payable"
  },
  {
    type: "function",
    name: "whitelistedTokens",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "event",
    name: "BootstrapModeFinalized",
    inputs: [
      {
        name: "caller",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CompositeOracleTokenFeedRemoved",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CreationBondForfeited",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CreationBondPosted",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "creator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CreationBondReturned",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "creator",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "CreationBondShortfall",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recordedAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "paidAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockTransferCancelled",
    inputs: [
      {
        name: "currentGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "cancelledGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockTransferStarted",
    inputs: [
      {
        name: "currentGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "pendingGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "GovernanceTimelockUpdated",
    inputs: [
      {
        name: "previousGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newGovernance",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Initialized",
    inputs: [
      {
        name: "version",
        type: "uint64",
        indexed: false,
        internalType: "uint64"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ManagedOracleUpdated",
    inputs: [
      {
        name: "oracleRole",
        type: "bytes32",
        indexed: true,
        internalType: "bytes32"
      },
      {
        name: "previousOracle",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOracle",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MaxActivePoolsUpdated",
    inputs: [
      {
        name: "oldValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MinimumCollateralUpdated",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oldMinCollateral",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newMinCollateral",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "MinimumCreationBondUsdUpdated",
    inputs: [
      {
        name: "oldValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "newValue",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Paused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolClosed",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "creator",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolCreated",
    inputs: [
      {
        name: "poolAddress",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "shieldedToken",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "backingToken",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "commissionRate",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "poolFee",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "collateralRatio",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      },
      {
        name: "creator",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolDeactivated",
    inputs: [
      {
        name: "pool",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolImplementationPinChecked",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "codehash",
        type: "bytes32",
        indexed: false,
        internalType: "bytes32"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PoolImplementationUpdated",
    inputs: [
      {
        name: "previousImplementation",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newImplementation",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "PriceOracleUpdated",
    inputs: [
      {
        name: "previousOracle",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOracle",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "ProtocolFeeRecipientUpdated",
    inputs: [
      {
        name: "oldRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "newRecipient",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenRemoved",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenStrictProtectedPriceRequirementUpdated",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "oldRequired",
        type: "bool",
        indexed: false,
        internalType: "bool"
      },
      {
        name: "newRequired",
        type: "bool",
        indexed: false,
        internalType: "bool"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenWhitelisted",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "symbol",
        type: "string",
        indexed: false,
        internalType: "string"
      },
      {
        name: "primaryOracleFeed",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "backupOracleFeed",
        type: "address",
        indexed: false,
        internalType: "address"
      },
      {
        name: "minCollateralRatioBp",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Unpaused",
    inputs: [
      {
        name: "account",
        type: "address",
        indexed: false,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "Upgraded",
    inputs: [
      {
        name: "implementation",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "AccessControlDenied",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      },
      {
        name: "operation",
        type: "string",
        internalType: "string"
      }
    ]
  },
  {
    type: "error",
    name: "ActivePoolUsesCompositeOracle",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracle",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "AddressEmptyCode",
    inputs: [
      {
        name: "target",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "BalanceMutatingTokenUnsupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "CollateralBelowTokenMinimum",
    inputs: [
      {
        name: "provided",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minimum",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "CompositeOracleAuthorizationClosed",
    inputs: []
  },
  {
    type: "error",
    name: "CompositeOracleAuthorizedCallersPresent",
    inputs: [
      {
        name: "oracle",
        type: "address",
        internalType: "address"
      },
      {
        name: "count",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "CreationBondBelowMinimum",
    inputs: [
      {
        name: "providedUsd",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "minimumUsd",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "DecimalNormalizationOverflow",
    inputs: [
      {
        name: "price",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "fromDecimals",
        type: "uint8",
        internalType: "uint8"
      },
      {
        name: "toDecimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "ERC1967InvalidImplementation",
    inputs: [
      {
        name: "implementation",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "ERC1967NonPayable",
    inputs: []
  },
  {
    type: "error",
    name: "ERC4626BackingOracleUnsupported",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "oracleFeed",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "EnforcedPause",
    inputs: []
  },
  {
    type: "error",
    name: "EtherTransferNotAllowed",
    inputs: []
  },
  {
    type: "error",
    name: "ExpectedPause",
    inputs: []
  },
  {
    type: "error",
    name: "FailedCall",
    inputs: []
  },
  {
    type: "error",
    name: "GovernanceTimelockAdminRetained",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "retainedAdmin",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockDelayTooLong",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "delay",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "maxDelay",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockDelayTooShort",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "minDelay",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockHasExtraAdmins",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "adminCount",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockImplementationMismatch",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "expectedCodehash",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "actualCodehash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockInvalidRoleMemberCount",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "role",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "memberCount",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTimelockRoleMemberMismatch",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      },
      {
        name: "role",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "expectedMember",
        type: "address",
        internalType: "address"
      },
      {
        name: "actualMember",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceTransferPending",
    inputs: [
      {
        name: "pendingGovernance",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "GovernanceZeroAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InitialCreationBondRequired",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidAssetAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidBackingTokenSymbols",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidCollateralRatio",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidGovernanceTimelock",
    inputs: [
      {
        name: "candidate",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "InvalidInitialization",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidOraclePrice",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidShieldedTokenSymbol",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidTokenAddress",
    inputs: []
  },
  {
    type: "error",
    name: "InvalidTokenDecimals",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "decimals",
        type: "uint8",
        internalType: "uint8"
      }
    ]
  },
  {
    type: "error",
    name: "ManagedOracleInUse",
    inputs: [
      {
        name: "oracle",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "MaxPoolsExceeded",
    inputs: [
      {
        name: "current",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "max",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "NoPendingGovernance",
    inputs: []
  },
  {
    type: "error",
    name: "NotInitializing",
    inputs: []
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "PoolAlreadyInactive",
    inputs: []
  },
  {
    type: "error",
    name: "PoolDeactivationTooEarly",
    inputs: [
      {
        name: "executableAt",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "PoolDoesNotExist",
    inputs: []
  },
  {
    type: "error",
    name: "PoolGovernanceTransferOutOfSync",
    inputs: [
      {
        name: "pool",
        type: "address",
        internalType: "address"
      },
      {
        name: "currentGovernance",
        type: "address",
        internalType: "address"
      },
      {
        name: "pendingGovernance",
        type: "address",
        internalType: "address"
      },
      {
        name: "expectedGovernance",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "PoolGovernanceTransfersPending",
    inputs: [
      {
        name: "remainingPools",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "PoolImplementationCodehashMismatch",
    inputs: [
      {
        name: "expectedCodehash",
        type: "bytes32",
        internalType: "bytes32"
      },
      {
        name: "actualCodehash",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "PoolNotActive",
    inputs: []
  },
  {
    type: "error",
    name: "PoolNotEmptyForDeactivation",
    inputs: []
  },
  {
    type: "error",
    name: "ReentrancyGuardReentrantCall",
    inputs: []
  },
  {
    type: "error",
    name: "SafeERC20FailedOperation",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "StaticBalanceAcknowledgementRequired",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "TokenNotWhitelisted",
    inputs: []
  },
  {
    type: "error",
    name: "TokenNotWhitelisted",
    inputs: []
  },
  {
    type: "error",
    name: "TokenUsedByActivePool",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "pool",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "UUPSUnauthorizedCallContext",
    inputs: []
  },
  {
    type: "error",
    name: "UUPSUnsupportedProxiableUUID",
    inputs: [
      {
        name: "slot",
        type: "bytes32",
        internalType: "bytes32"
      }
    ]
  },
  {
    type: "error",
    name: "UnauthorizedGovernance",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "UnauthorizedPendingGovernance",
    inputs: [
      {
        name: "caller",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "UnexpectedOutboundTransferAmount",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "expectedDebited",
        type: "uint256",
        internalType: "uint256"
      },
      {
        name: "actualDebited",
        type: "uint256",
        internalType: "uint256"
      }
    ]
  },
  {
    type: "error",
    name: "UpgradeDisabled",
    inputs: []
  }
];

// packages/adapter-evm/src/positionId.ts
function encodePositionId(pool, side, tokenId) {
  return `${pool}-${side === "shield" ? "s" : "p"}-${tokenId}`;
}
function decodePositionId(id) {
  const m = /^(0x[0-9a-fA-F]{40})-(s|p)-(\d+)$/.exec(id);
  if (!m) throw new Error(`invalid EVM position id: ${id}`);
  return { pool: m[1], side: m[2] === "s" ? "shield" : "protector", tokenId: BigInt(m[3]) };
}

// packages/adapter-evm/src/crypto-deployment.ts
var CRYPTO_EXTENSION = {
  factory: "0x3EA26dA9eB47119c2B4E468F078f65683eB7F15f",
  factoryCodehash: "0xb1d996204f28a0b949694538406e66248b13709ae52486f024e1c8be42f329ac",
  factoryImplementation: "0x1BcA75eAF9042c1aF25d97a76711cB8628849352",
  factoryImplementationCodehash: "0x16da0886e6dbfbd4196c5a6d0f03650d6d3c3b5843c15fe60ac1271eb8241c4d",
  poolImplementation: "0xe0852d622dBE99a7E258F5c2bADff91e1A7A49cE",
  poolImplementationCodehash: "0x2098b7f85ebf8d11eee258e79e0f59bd28d0733d246e491c4318c43ed3b9727d",
  compositeOracleCodehash: "0xf9c997074c84e8b27f38381646766b75b5380e34c44260ea6374cf475091a77e",
  compositeOracle: "0x8455e1E78Ae337BcaE2A2248cA0057E65D8030B0",
  deploymentBlock: 46585202n,
  faucet: "0x5B934A891192CC6337cBdbdD35E3F4f4a336354A",
  pools: [
    "0xe3A6822a532848fBa8CAcAa70A82D8165d4EF90F",
    "0xEa246A4Cd3380A91a8FC372b206A5B9D04797B81",
    "0x7476dD1370aD6381FC9bc96125D084BEED5A6C49",
    "0xD6bb77374993ee78eD244C9d54ee735a2B67D36e",
    "0x511710Cae7Ee79633CdaD0f96b52AbD96F1b6E3F",
    "0x909eeD441E18538062bD37803223F4bd78cd44ac",
    "0x6d2B42d285667AbC09b55495e1f92C3b37ee093b",
    "0x5BfD6e1335919Ea0DF685BC8ec98353325b139aC",
    "0x92b7e0564B1e113C874A0B5f63f24Dc9D0CD0C47"
  ],
  vaults: [
    {
      address: "0x0E5a8E9308fd29BA52Da9126270061c014Fb09f8",
      symbol: "vWETH",
      underlying: "0x54f25F95Af2527E08cfBe5A0528038e9DC4265f2",
      decimals: 18,
      underlyingSymbol: "tWETH",
      codehash: "0xe3c8b609e3b223d28e8d2de96d8a19c31854bf3b3fb9c8bd610d086531c2759a"
    },
    {
      address: "0x17e1d0B9A4045a080e9cB3BBC45da3ee3893B5f3",
      symbol: "vUSDC",
      underlying: "0x4dFe9500E03AC27F25997184d162191cC5ADBf34",
      decimals: 6,
      underlyingSymbol: "TestUSDC",
      codehash: "0xe10a90ceb3e54b6eb73febcf4e1b9d645a6d139a9f14fcf72ffd969e2c21f82b"
    }
  ]
};

// packages/adapter-evm/src/pool-registry.ts
import { keccak256 as keccak2562 } from "viem";
var IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
var same2 = (a, b) => a?.toLowerCase() === b.toLowerCase();
var slotAddress = (slot) => slot && `0x${slot.slice(-40)}`;
async function assertCreationFactory(client, blockNumber) {
  const d = CRYPTO_EXTENSION;
  if (!d || await client.getChainId() !== 84532) throw new Error("Pool creation is available on Base Sepolia only.");
  const [codes, slot, implementation, oracle] = await Promise.all([
    Promise.all(
      [
        [d.factory, d.factoryCodehash],
        [d.factoryImplementation, d.factoryImplementationCodehash],
        [d.poolImplementation, d.poolImplementationCodehash],
        [d.compositeOracle, d.compositeOracleCodehash]
      ].map(async ([address, hash]) => {
        const code = await client.getCode({ address, blockNumber });
        return !!code && same2(keccak2562(code), hash);
      })
    ),
    client.getStorageAt({ address: d.factory, slot: IMPLEMENTATION_SLOT, blockNumber }),
    client.readContract({
      address: d.factory,
      abi: splitRiskPoolFactoryAbi,
      functionName: "splitRiskPoolImplementation",
      blockNumber
    }),
    client.readContract({ address: d.factory, abi: splitRiskPoolFactoryAbi, functionName: "compositeOracle", blockNumber })
  ]);
  if (!codes.every(Boolean) || !same2(slotAddress(slot), d.factoryImplementation) || !same2(implementation, d.poolImplementation) || !same2(oracle, d.compositeOracle))
    throw new Error("Pool creation deployment changed or could not be verified. Refresh before continuing.");
  return d;
}
async function assertCreatedPools(client, pools, blockNumber) {
  const d = await assertCreationFactory(client, blockNumber);
  await Promise.all(
    pools.map(async (address) => {
      const [code, slot, factory] = await Promise.all([
        client.getCode({ address, blockNumber }),
        client.getStorageAt({ address, slot: IMPLEMENTATION_SLOT, blockNumber }),
        client.readContract({ address, abi: splitRiskPoolAbi, functionName: "POOL_FACTORY", blockNumber })
      ]);
      if (!code || !same2(keccak2562(code), d.factoryCodehash) || !same2(slotAddress(slot), d.poolImplementation) || !same2(factory, d.factory))
        throw new Error("A discovered pool could not be authenticated. Refresh before continuing.");
    })
  );
}

// packages/adapter-evm/src/reader.ts
var BPS = 10000n;
var ratioBps = (num, den) => den > 0n ? num * BPS / den : null;
var clampBps = (b) => b > BPS ? BPS : b;
var MAX_TOKEN_IDS = 2000n;
var ACTIVITY_LIMIT = 25;
var MAX_POOLS = 1000n;
var PROTECTOR_UNLOCK_WINDOW = 7n * 24n * 60n * 60n;
var ACTIVITY_BLOCK_RANGE = 2000n;
var requireRead = (r) => {
  if (!r || r.status !== "success") throw new Error("On-chain data unavailable. Please refresh before continuing.");
  return r.result;
};
function receiptOwner(r) {
  if (r?.status === "success") return r.result;
  let error = r && r.status === "failure" ? r.error : void 0;
  const visited = /* @__PURE__ */ new Set();
  while (error && typeof error === "object" && !visited.has(error)) {
    visited.add(error);
    const cause = error;
    if (cause.data?.errorName === "ERC721NonexistentToken") return null;
    error = cause.cause;
  }
  throw new Error("Position discovery data unavailable. Please refresh before continuing.");
}
var ceilDiv = (num, den) => (num + den - 1n) / den;
function netShieldAmount(amount, valueAtDeposit, feeBaseline, price, decimals, rates) {
  if (price <= 0n) throw new Error("Current price feed unavailable for withdrawal quote.");
  const scale = 10n ** BigInt(decimals);
  const current = amount * price / scale;
  const baseline = feeBaseline === 0n ? valueAtDeposit : feeBaseline;
  const gain = current > baseline ? current - baseline : 0n;
  const fees = rates.reduce((total, rate) => total + ceilDiv(ceilDiv(gain * rate, BPS) * scale, price), 0n);
  return fees >= amount ? 0n : amount - fees;
}
var openingPolicyAbi = [
  {
    type: "function",
    name: "protectionOpeningEligibilityRequired",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isProtectionOpeningAllowed",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "bool" }],
    stateMutability: "view"
  }
];
var ready = () => ({ state: "available", blockers: [] });
var unavailable = (code, message, state = "blocked") => ({
  state,
  blockers: [{ code, message }]
});
var VIEW_VALIDITY_SECONDS = SNAPSHOT_VALIDITY_SECONDS;
var MAX_DEPOSIT = (1n << 128n) - 1n;
function maximumDeposit(input, side) {
  const {
    shieldedPrice,
    backingPrice,
    shieldedDecimals,
    backingDecimals,
    totalProtectorTokens,
    totalShieldCollateralAmount,
    totalValueAtDeposit,
    trackedTvlUsd,
    maxTvlUsd,
    collateralRatioBps,
    minDeposit,
    maxDeposit
  } = input;
  if (backingPrice <= 0n || side === "shield" && shieldedPrice <= 0n || collateralRatioBps <= 0n || maxDeposit <= 0n || minDeposit < 0n || trackedTvlUsd >= maxTvlUsd)
    return 0n;
  const shieldScale = 10n ** BigInt(shieldedDecimals), backingScale = 10n ** BigInt(backingDecimals);
  const value = (amount) => side === "shield" ? amount * shieldedPrice / shieldScale : amount * backingPrice / backingScale;
  const nativeCap = (usd) => ceilDiv(usd * collateralRatioBps, BPS) * backingScale / backingPrice;
  const protectorUsd = totalProtectorTokens * backingPrice / backingScale;
  const existingShares = totalProtectorTokens === 0n ? 0n : input.totalProtectorShares ?? 0n;
  const mintedShares = (amount) => existingShares > 0n ? amount * existingShares / totalProtectorTokens : amount * 10n ** 18n / backingScale;
  const fits = (amount) => {
    const usd = value(amount);
    return trackedTvlUsd + usd <= maxTvlUsd && (side === "backing" ? input.totalProtectorShares === void 0 || existingShares + mintedShares(amount) <= 10n ** 38n : ceilDiv((totalValueAtDeposit + usd) * collateralRatioBps, BPS) <= protectorUsd && totalShieldCollateralAmount + nativeCap(usd) <= totalProtectorTokens);
  };
  let lo = 0n, hi = maxDeposit < MAX_DEPOSIT ? maxDeposit : MAX_DEPOSIT;
  while (lo < hi) {
    const mid = (lo + hi + 1n) / 2n;
    if (fits(mid)) lo = mid;
    else hi = mid - 1n;
  }
  return lo < minDeposit || value(lo) === 0n || side === "shield" && nativeCap(value(lo)) === 0n || side === "backing" && input.totalProtectorShares !== void 0 && mintedShares(lo) === 0n ? 0n : lo;
}
function simulationFailure(error) {
  let cause = error;
  const seen = /* @__PURE__ */ new Set();
  while (cause && typeof cause === "object" && !seen.has(cause)) {
    seen.add(cause);
    const e = cause;
    if (e.name === "ContractFunctionRevertedError" || e.data?.errorName)
      return unavailable("preflight-failed", e.shortMessage ?? "The contract cannot execute this action now.");
    cause = e.cause;
  }
  return unavailable(
    "preflight-unavailable",
    "Withdrawal checks are unavailable. Refresh before continuing.",
    "unknown"
  );
}
var closedSessionPriceAbi = [
  {
    type: "function",
    name: "getPriceForClosedSessionExit",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
    stateMutability: "view"
  }
];
var ok = (r) => r && r.status === "success" ? r.result : null;
async function rawMulticall(client, contracts, blockNumber) {
  if (contracts.length === 0) return [];
  const res = await client.multicall({ contracts, allowFailure: true, blockNumber });
  return res;
}
var ACTIVITY_EVENT_KINDS = {
  ShieldedAssetDeposited: "deposit",
  ProtectorAssetDeposited: "backing",
  ShieldedWithdrawal: "withdraw",
  PartialWithdrawal: "withdraw",
  ProtectorAssetWithdrawn: "withdraw",
  ShieldActivated: "activate",
  RewardsClaimed: "collect",
  CommissionClaimed: "collect",
  UnlockProcessStarted: "notice",
  UnlockProcessCancelled: "notice"
};
var ACTIVITY_EVENTS = splitRiskPoolAbi.filter(
  (e) => e.type === "event" && e.name in ACTIVITY_EVENT_KINDS
);
function createReader(client, deps) {
  const factory = { address: deps.factory, abi: splitRiskPoolFactoryAbi };
  const poolC = (address) => ({ address, abi: splitRiskPoolAbi });
  async function allPools(blockNumber) {
    const count = await client.readContract({ ...factory, functionName: "poolCount", blockNumber });
    if (count > MAX_POOLS) throw new Error("Pool discovery limit reached. An indexer is required for a complete view.");
    if (count === 0n) return [];
    return await client.readContract({
      ...factory,
      functionName: "getPools",
      args: [0n, count],
      blockNumber
    });
  }
  function classifyFeed(token, stale, backup, dual, challenge, price) {
    const staleRes = ok(stale);
    const isStale = staleRes ? staleRes[0] : false;
    const probeFailed = staleRes === null || ok(backup) === null || ok(dual) === null || ok(challenge) === null || (ok(price) ?? 0n) <= 0n;
    const backupActive = ok(backup) ?? false;
    const dualRes = ok(dual);
    const challenged = (dualRes ? dualRes[4] : false) || ok(challenge) === true;
    let status = "healthy";
    let reason = null;
    if (challenged) {
      status = "paused";
      reason = "price under verification";
    } else if (probeFailed) {
      status = "paused";
      reason = "price feed unavailable";
    } else if (isStale) {
      status = "paused";
      reason = "price is stale";
    } else if (backupActive) {
      status = "degraded";
      reason = "serving backup feed";
    }
    return { token, status, reason, challenged, backupActive, stale: isStale || probeFailed };
  }
  return {
    getDemoMarket: () => readDemoMarket(client),
    getDemoTradeQuote: (request) => readDemoTradeQuote(client, request),
    async loadPools() {
      const snapshot = await readSnapshot(client, "Pool");
      const block = snapshot.block;
      const blockNumber = block.number;
      const pools = await allPools(blockNumber);
      if (CRYPTO_EXTENSION && deps.factory.toLowerCase() === CRYPTO_EXTENSION.factory.toLowerCase())
        await assertCreatedPools(client, pools, blockNumber);
      if (pools.length === 0) return snapshot.finish([]);
      const infos = await Promise.all(
        pools.map(
          (address) => client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber })
        )
      );
      const poolConfigs = await rawMulticall(
        client,
        pools.map((p) => ({ ...poolC(p), functionName: "poolConfig" })),
        blockNumber
      );
      const perPool = await rawMulticall(
        client,
        pools.flatMap((p, i) => {
          const info = infos[i];
          const config = requireRead(poolConfigs[i]);
          const poolOracle = { address: config[9], abi: compositeOracleAbi };
          return [
            { ...poolC(p), functionName: "poolConfig" },
            { ...poolC(p), functionName: "paused" },
            { ...poolC(p), functionName: "totalProtectorTokens" },
            { ...poolC(p), functionName: "totalShieldCollateralAmount" },
            { ...poolC(p), functionName: "totalValueAtDeposit" },
            { ...poolC(p), functionName: "shieldedTokenDecimals" },
            { ...poolC(p), functionName: "backingTokenDecimals" },
            { ...poolC(p), functionName: "accessControl" },
            { ...poolC(p), functionName: "protectorReceiptNFT" },
            { ...factory, functionName: "tokenInfo", args: [info.shieldedToken] },
            { ...factory, functionName: "tokenInfo", args: [info.backingToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isPriceStale", args: [info.backingToken] },
            { ...poolOracle, functionName: "isBackupActiveForToken", args: [info.backingToken] },
            { ...poolOracle, functionName: "getTokenDualFeedStatus", args: [info.backingToken] },
            { ...factory, functionName: "isPoolActive", args: [p] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "isTokenChallengeable", args: [info.backingToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.shieldedToken] },
            { ...poolOracle, functionName: "getPrice", args: [info.backingToken] },
            { ...poolC(p), functionName: "poolState" },
            { ...poolC(p), functionName: "totalShieldedTokens" },
            { ...poolC(p), functionName: "requiresStrictProtectedBackingPrice" },
            { ...poolC(p), functionName: "shieldedTokenTransferIntegrityBroken" },
            { ...poolOracle, functionName: "getPriceWithStrictCircuitBreaker", args: [info.backingToken] },
            {
              address: config[9],
              abi: openingPolicyAbi,
              functionName: "protectionOpeningEligibilityRequired",
              args: [info.shieldedToken]
            },
            {
              address: config[9],
              abi: openingPolicyAbi,
              functionName: "isProtectionOpeningAllowed",
              args: [info.shieldedToken]
            },
            { ...poolC(p), functionName: "totalProtectorShares" }
          ];
        }),
        blockNumber
      );
      const PER = 30;
      const nftAddrs = pools.map((_, i) => requireRead(perPool[i * PER + 8]));
      const nexts = await rawMulticall(
        client,
        nftAddrs.map((address) => ({ address, abi: protectorReceiptNftAbi, functionName: "nextTokenId" })),
        blockNumber
      );
      const countCalls = nftAddrs.flatMap((address, i) => {
        const next = requireRead(nexts[i]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required for accurate counts.");
        return Array.from({ length: Number(next) }, (_, tokenId) => ({
          pool: i,
          contract: { address, abi: protectorReceiptNftAbi, functionName: "ownerOf", args: [BigInt(tokenId)] }
        }));
      });
      const countOwners = await rawMulticall(
        client,
        countCalls.map((c) => c.contract),
        blockNumber
      );
      const counts = pools.map(() => 0n);
      countCalls.forEach((call, i) => {
        if (receiptOwner(countOwners[i])) counts[call.pool] = counts[call.pool] + 1n;
      });
      const result = pools.map((p, i) => {
        const info = infos[i];
        const at = (j) => perPool[i * PER + j];
        const config = requireRead(at(0));
        const paused = requireRead(at(1));
        const active = requireRead(at(17));
        const totalProtectorTokens = requireRead(at(2));
        const totalShieldCollateral = requireRead(at(3));
        const totalValueAtDeposit = requireRead(at(4));
        const shieldedDecimals = requireRead(at(5));
        const backingDecimals = requireRead(at(6));
        const accessControl = requireRead(at(7));
        const shInfo = ok(at(9));
        const bkInfo = ok(at(10));
        const shielded = {
          token: info.shieldedToken,
          symbol: info.shieldedTokenSymbol,
          name: shInfo?.[0] ?? info.shieldedTokenSymbol,
          decimals: shieldedDecimals
        };
        const backing = {
          token: info.backingToken,
          symbol: info.backingTokenSymbol,
          name: bkInfo?.[0] ?? info.backingTokenSymbol,
          decimals: backingDecimals
        };
        const feeds = [
          classifyFeed(
            info.shieldedToken,
            at(11),
            at(12),
            at(13),
            at(18),
            at(20)
          ),
          classifyFeed(
            info.backingToken,
            at(14),
            at(15),
            at(16),
            at(19),
            at(21)
          )
        ];
        const worst = { healthy: 0, degraded: 1, paused: 2 };
        const status = feeds.reduce(
          (w, f) => worst[f.status] > worst[w] ? f.status : w,
          "healthy"
        );
        const oracleHealth = { status, feeds, paused: status === "paused" };
        const maxTvlUsd = config[4];
        const poolState = ok(at(22));
        const totalShielded = ok(at(23));
        const strict = ok(at(24));
        const shieldedPrice = ok(at(20));
        const backingPrice = strict === null ? null : ok(at(strict ? 26 : 21));
        const openingRequired = ok(at(27));
        const openingAllowed = ok(at(28));
        const transferBroken = ok(at(25));
        const totalProtectorShares = ok(at(29));
        const hasShieldExposure = poolState === null || totalShielded === null ? null : poolState[0] !== 0n || totalShielded !== 0n || totalValueAtDeposit !== 0n || totalShieldCollateral !== 0n;
        const trackedTvlUsd = poolState !== null && backingPrice !== null && backingPrice > 0n && hasShieldExposure !== null && (!hasShieldExposure || shieldedPrice !== null && shieldedPrice > 0n) ? (hasShieldExposure ? poolState[0] * shieldedPrice / 10n ** BigInt(shieldedDecimals) : 0n) + poolState[1] * backingPrice / 10n ** BigInt(backingDecimals) : null;
        const capacityInput = {
          shieldedPrice: shieldedPrice ?? 0n,
          backingPrice: backingPrice ?? 0n,
          shieldedDecimals,
          backingDecimals,
          totalProtectorTokens,
          totalShieldCollateralAmount: totalShieldCollateral,
          totalValueAtDeposit,
          trackedTvlUsd: trackedTvlUsd ?? 0n,
          maxTvlUsd,
          collateralRatioBps: info.colleteralRatio,
          totalProtectorShares: totalProtectorShares ?? void 0
        };
        const maxShieldedDeposit = trackedTvlUsd === null || shieldedPrice === null || shieldedPrice <= 0n ? null : maximumDeposit({ ...capacityInput, minDeposit: config[0], maxDeposit: config[1] }, "shield");
        const maxBackingDeposit = trackedTvlUsd === null || totalProtectorShares === null ? null : maximumDeposit({ ...capacityInput, minDeposit: config[2], maxDeposit: config[3] }, "backing");
        const eligibility = (side) => {
          const blockers = [];
          let unknown = false;
          const add = (code, message, isUnknown = false) => {
            blockers.push({ code, message });
            unknown ||= isUnknown;
          };
          if (!active) add("pool-inactive", "This pool no longer accepts deposits.");
          if (paused) add("pool-paused", "This pool is paused.");
          if (side === "shield") {
            if (openingRequired === null || openingRequired && openingAllowed === null)
              add("status-unknown", "Opening eligibility is unavailable.", true);
            else if (openingRequired && !openingAllowed)
              add("opening-unavailable", "New protection is unavailable under this asset's opening policy.");
            if (transferBroken === null) add("status-unknown", "Token transfer checks are unavailable.", true);
            else if (transferBroken) add("token-transfer-paused", "This token is paused for transfer checks.");
          }
          if (feeds[1].status === "paused" || backingPrice === null || backingPrice <= 0n)
            add("price-unavailable", "Backing-token pricing is unavailable.", true);
          if ((side === "shield" || hasShieldExposure !== false) && feeds[0].status === "paused")
            add("price-unavailable", "Stock pricing is unavailable.", true);
          const capacity = side === "shield" ? maxShieldedDeposit : maxBackingDeposit;
          if (capacity === null) add("capacity-unavailable", "Pool capacity is unavailable.", true);
          else if (capacity === 0n) add("capacity-exhausted", "This pool has no capacity for a valid deposit.");
          if (accessControl !== zeroAddress2)
            add("account-restriction", "Connect a wallet to check this pool's account restrictions.", true);
          return blockers.length ? { state: unknown ? "unknown" : "blocked", blockers } : ready();
        };
        const availability = {
          blockNumber,
          evaluatedAt: block.timestamp,
          validUntil: block.timestamp + VIEW_VALIDITY_SECONDS,
          openPosition: eligibility("shield"),
          provideCollateral: eligibility("backing"),
          maxShieldedDeposit,
          maxBackingDeposit,
          trackedTvlUsd
        };
        return {
          address: p,
          stats: {
            address: p,
            shieldedToken: info.shieldedToken,
            backingToken: info.backingToken,
            active: active && !paused,
            premiumRateBp: info.commissionRate,
            poolFeeBp: info.poolFee,
            protocolFeeBp: config?.[8] ?? 0n,
            collateralRatioBp: info.colleteralRatio,
            protectorPositionCount: counts[i],
            coverageBps: ratioBps(totalProtectorTokens, totalShieldCollateral),
            utilizationBps: ratioBps(totalShieldCollateral, totalProtectorTokens),
            maxTvlUsd,
            shieldTvlUsd: totalValueAtDeposit,
            capacityBps: maxTvlUsd > 0n && trackedTvlUsd !== null ? clampBps(trackedTvlUsd * BPS / maxTvlUsd) : null,
            shieldedMinDeposit: config?.[0] ?? 0n,
            shieldedMaxDeposit: config?.[1] ?? 0n,
            backingMinDeposit: config?.[2] ?? 0n,
            backingMaxDeposit: config?.[3] ?? 0n,
            minimumPoolTime: config?.[5] ?? 0n,
            unlockDuration: config?.[6] ?? 0n,
            hasAccessControl: accessControl !== zeroAddress2
          },
          shielded,
          backing,
          oracle: oracleHealth,
          availability
        };
      });
      return snapshot.finish(result);
    },
    async getOwnerPositions(owner) {
      const user = owner;
      const snapshot = await readSnapshot(client, "Position");
      const block = snapshot.block;
      const blockNumber = block.number;
      const now = block.timestamp;
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return snapshot.finish({ shield: [], protector: [] });
      const meta = await rawMulticall(
        client,
        pools.flatMap((p) => [
          { ...poolC(p), functionName: "getUserNFTCounts", args: [user] },
          { ...poolC(p), functionName: "shieldReceiptNFT" },
          { ...poolC(p), functionName: "protectorReceiptNFT" },
          { ...poolC(p), functionName: "poolConfig" },
          { ...poolC(p), functionName: "SHIELDED_TOKEN" },
          { ...poolC(p), functionName: "shieldedTokenDecimals" },
          { ...poolC(p), functionName: "COMMISSION_RATE" },
          { ...poolC(p), functionName: "POOL_FEE" },
          { ...poolC(p), functionName: "shieldedTokenTransferIntegrityBroken" }
        ]),
        blockNumber
      );
      const M = 9;
      const sides = [];
      pools.forEach((p, i) => {
        const cnt = requireRead(meta[i * M]);
        const config = requireRead(meta[i * M + 3]);
        const shieldedToken = requireRead(meta[i * M + 4]);
        const base = {
          pool: p,
          minimumPoolTime: config[5],
          unlockDuration: config[6],
          shieldedToken,
          decimals: requireRead(meta[i * M + 5]),
          oracle: config[9],
          rates: [requireRead(meta[i * M + 6]), requireRead(meta[i * M + 7]), config[8]],
          transferIntegrityBroken: ok(meta[i * M + 8])
        };
        const shieldNft = requireRead(meta[i * M + 1]);
        const protectorNft = requireRead(meta[i * M + 2]);
        if (cnt[0] > 0n) sides.push({ ...base, expectedCount: cnt[0], nft: shieldNft, kind: "shield" });
        if (cnt[1] > 0n) sides.push({ ...base, expectedCount: cnt[1], nft: protectorNft, kind: "protector" });
      });
      if (sides.length === 0) return snapshot.finish({ shield: [], protector: [] });
      const nexts = await rawMulticall(
        client,
        sides.map((s) => ({ address: s.nft, abi: shieldReceiptNftAbi, functionName: "nextTokenId" })),
        blockNumber
      );
      const ownerOfCalls = sides.flatMap((s, si) => {
        const next = requireRead(nexts[si]);
        if (next > MAX_TOKEN_IDS)
          throw new Error("Position discovery limit reached. An indexer is required to list all positions.");
        const upper = next;
        return Array.from({ length: Number(upper) }, (_, t) => ({
          side: si,
          tokenId: BigInt(t),
          contract: {
            address: s.nft,
            abi: shieldReceiptNftAbi,
            functionName: "ownerOf",
            args: [BigInt(t)]
          }
        }));
      });
      const owners = await rawMulticall(
        client,
        ownerOfCalls.map((c) => c.contract),
        blockNumber
      );
      const held = ownerOfCalls.filter((c, i) => receiptOwner(owners[i])?.toLowerCase() === user.toLowerCase());
      sides.forEach((s, i) => {
        if (BigInt(held.filter((h) => h.side === i).length) !== s.expectedCount)
          throw new Error("Position discovery is incomplete. Please refresh before continuing.");
      });
      const details = await rawMulticall(
        client,
        held.map((h) => {
          const s = sides[h.side];
          return s.kind === "shield" ? { address: s.nft, abi: shieldReceiptNftAbi, functionName: "getPosition", args: [h.tokenId] } : { ...poolC(s.pool), functionName: "getProtectorDepositInfo", args: [h.tokenId] };
        }),
        blockNumber
      );
      const shieldHeld = held.filter((h) => sides[h.side].kind === "shield");
      const values = await rawMulticall(
        client,
        shieldHeld.flatMap((h) => {
          const s = sides[h.side];
          const pos = requireRead(details[held.indexOf(h)]);
          return [
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getValue",
              args: [s.shieldedToken, pos.amount]
            },
            {
              address: s.oracle,
              abi: compositeOracleAbi,
              functionName: "getPriceForFeeAccrual",
              args: [s.shieldedToken]
            },
            {
              address: s.oracle,
              abi: closedSessionPriceAbi,
              functionName: "getPriceForClosedSessionExit",
              args: [s.shieldedToken]
            },
            { ...poolC(s.pool), functionName: "feeValueBaselineUsd", args: [h.tokenId] }
          ];
        }),
        blockNumber
      );
      const shield = [];
      const protector = [];
      held.forEach((h, i) => {
        const s = sides[h.side];
        if (s.kind === "shield") {
          const pos = requireRead(details[i]);
          const vi = shieldHeld.indexOf(h) * 4;
          const currentValueUsd = ok(values[vi]);
          const normalFeePrice = ok(values[vi + 1]);
          const feePrice = normalFeePrice !== null && normalFeePrice > 0n ? normalFeePrice : ok(values[vi + 2]);
          const baseline = ok(values[vi + 3]);
          const ordinaryQuote = feePrice !== null && feePrice > 0n && baseline !== null;
          const quoteAvailable = s.transferIntegrityBroken === true || s.transferIntegrityBroken === false && ordinaryQuote;
          const netAmount = s.transferIntegrityBroken === true ? pos.amount : quoteAvailable ? netShieldAmount(pos.amount, pos.valueAtDeposit, baseline, feePrice, s.decimals, s.rates) : 0n;
          const depositTime = BigInt(pos.depositTime);
          const unlockAt = depositTime + s.minimumPoolTime;
          shield.push({
            id: encodePositionId(s.pool, "shield", h.tokenId),
            pool: s.pool,
            deposited: pos.amount,
            withdrawableNet: netAmount,
            sameAssetQuoteAvailable: quoteAvailable,
            evaluatedAt: now,
            validUntil: now + VIEW_VALIDITY_SECONDS,
            valueAtDepositUsd: pos.valueAtDeposit,
            collateralAmount: pos.collateralAmount,
            depositTime,
            protectedExitUnlockTime: unlockAt,
            protectedExitUnlocked: now >= unlockAt,
            currentValueUsd,
            earnedUsd: currentValueUsd !== null ? currentValueUsd > pos.valueAtDeposit ? currentValueUsd - pos.valueAtDeposit : 0n : null
          });
        } else {
          const pos = requireRead(details[i]);
          const [amount, depositTime, unlockRequestTime, lockedAmount, availableAmount] = pos;
          const isUnlocking = unlockRequestTime > 0n && now <= BigInt(unlockRequestTime) + PROTECTOR_UNLOCK_WINDOW;
          const availableAt = isUnlocking ? BigInt(unlockRequestTime) : 0n;
          protector.push({
            id: encodePositionId(s.pool, "protector", h.tokenId),
            pool: s.pool,
            collateral: amount,
            claimableCommission: pos[5],
            availableToWithdraw: availableAmount,
            backingActive: lockedAmount,
            depositTime: BigInt(depositTime),
            isUnlocking,
            availableAt,
            noticeSecondsRemaining: isUnlocking && availableAt > now ? availableAt - now : 0n
          });
        }
      });
      await Promise.all(
        shield.map(async (position) => {
          const decoded = decodePositionId(position.id);
          const side = sides.find((s) => s.pool.toLowerCase() === decoded.pool.toLowerCase() && s.kind === "shield");
          if (!position.sameAssetQuoteAvailable)
            position.sameAssetExit = unavailable(
              "price-unavailable",
              "Stock withdrawal pricing is unavailable.",
              "unknown"
            );
          else if (position.withdrawableNet === 0n)
            position.sameAssetExit = unavailable("no-output", "No positive stock withdrawal amount is available.");
          else {
            try {
              await client.simulateContract({
                ...poolC(decoded.pool),
                functionName: "shieldedWithdraw",
                args: [decoded.tokenId, side.shieldedToken, position.withdrawableNet],
                account: user,
                blockNumber
              });
              position.sameAssetExit = ready();
            } catch (error) {
              position.sameAssetExit = simulationFailure(error);
            }
          }
          if (!position.protectedExitUnlocked)
            position.protectedExit = unavailable(
              "withdrawal-delay",
              "This position's protected exit delay has not elapsed."
            );
          else {
            try {
              const quote = await this.getProtectedExitQuote(position.id);
              await client.simulateContract({
                ...poolC(decoded.pool),
                functionName: "shieldedWithdraw",
                args: [decoded.tokenId, quote.token, quote.amount],
                account: user,
                blockNumber: quote.blockNumber
              });
              position.protectedExitQuote = quote;
              position.protectedExit = ready();
            } catch (error) {
              position.protectedExit = simulationFailure(error);
            }
          }
        })
      );
      return snapshot.finish({ shield, protector });
    },
    async listWhitelistedTokens() {
      const tokens = await client.readContract({
        ...factory,
        functionName: "getWhitelistedTokens"
      });
      const meta = await rawMulticall(
        client,
        tokens.flatMap((t) => [
          { ...factory, functionName: "tokenInfo", args: [t] },
          { address: t, abi: erc20Abi2, functionName: "decimals" }
        ])
      );
      return tokens.map((t, i) => {
        const info = requireRead(meta[i * 2]);
        const minCollateralRatioBp = info?.[5] ?? 0n;
        return {
          token: t,
          symbol: info?.[1] ?? "\u2014",
          name: info?.[0] ?? "Token",
          decimals: requireRead(meta[i * 2 + 1]),
          minCollateralRatioBp,
          tranche: minCollateralRatioBp >= 15000n ? "volatile" : "stable"
        };
      }).sort((a, b) => a.symbol.localeCompare(b.symbol));
    },
    async getTokenBalance(owner, token) {
      try {
        const bal = await client.readContract({
          address: token,
          abi: erc20Abi2,
          functionName: "balanceOf",
          args: [owner]
        });
        return bal;
      } catch {
        return null;
      }
    },
    async getBalances(owner) {
      const tokens = await this.listWhitelistedTokens();
      const balances = await rawMulticall(
        client,
        tokens.map((t) => ({
          address: t.token,
          abi: erc20Abi2,
          functionName: "balanceOf",
          args: [owner]
        }))
      );
      return tokens.map((token, i) => ({ token, amount: requireRead(balances[i]) }));
    },
    async getProtectedExitQuote(position) {
      const { pool, side, tokenId } = decodePositionId(position);
      if (side !== "shield") throw new Error("Position type does not match a protected exit.");
      const snapshot = await readSnapshot(client, "Protected exit");
      const block = snapshot.block;
      const blockNumber = block.number;
      await client.readContract({ ...factory, functionName: "getPoolInfo", args: [pool], blockNumber });
      const [config, nft, backingToken, decimals, paused, strict] = await Promise.all([
        client.readContract({ ...poolC(pool), functionName: "poolConfig", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "shieldReceiptNFT", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "BACKING_TOKEN", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "backingTokenDecimals", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "paused", blockNumber }),
        client.readContract({ ...poolC(pool), functionName: "requiresStrictProtectedBackingPrice", blockNumber })
      ]);
      if (paused) throw new Error("Pool is paused.");
      const [pos, price, receiptOwner2] = await Promise.all([
        client.readContract({
          address: nft,
          abi: shieldReceiptNftAbi,
          functionName: "getPosition",
          args: [tokenId],
          blockNumber
        }),
        client.readContract({
          address: config[9],
          abi: compositeOracleAbi,
          functionName: strict ? "getPriceWithStrictCircuitBreaker" : "getPrice",
          args: [backingToken],
          blockNumber
        }),
        client.readContract({
          address: nft,
          abi: shieldReceiptNftAbi,
          functionName: "ownerOf",
          args: [tokenId],
          blockNumber
        })
      ]);
      if (pos.amount === 0n || price <= 0n) throw new Error("Current price feed unavailable for exit quote.");
      const uncapped = pos.valueAtDeposit * 10n ** BigInt(decimals) / price;
      const amount = uncapped < pos.collateralAmount ? uncapped : pos.collateralAmount;
      if (amount <= 0n) throw new Error("No positive protected exit quote is available.");
      if (block.timestamp < BigInt(pos.depositTime) + config[5])
        throw new Error("This position's protected exit delay has not elapsed.");
      await client.simulateContract({
        ...poolC(pool),
        functionName: "shieldedWithdraw",
        args: [tokenId, backingToken, amount],
        account: receiptOwner2,
        blockNumber
      });
      return snapshot.finish({ amount, token: backingToken, blockNumber, quotedAt: block.timestamp });
    },
    async getActivity(owner) {
      const user = owner.toLowerCase();
      const blockNumber = await client.getBlockNumber();
      const pools = await allPools(blockNumber);
      if (pools.length === 0) return [];
      if (deps.deploymentBlock === void 0)
        throw new Error("Activity data unavailable until the deployment block is configured.");
      const infos = await Promise.all(
        pools.map(
          (address) => client.readContract({ ...factory, functionName: "getPoolInfo", args: [address], blockNumber })
        )
      );
      const infoByPool = new Map(pools.map((address, i) => [address.toLowerCase(), infos[i]]));
      const readLogs = (fromBlock, toBlock) => client.getLogs({ address: pools, events: ACTIVITY_EVENTS, fromBlock, toBlock });
      const mine = [];
      for (let toBlock = blockNumber; toBlock >= deps.deploymentBlock; ) {
        const fromBlock = toBlock - deps.deploymentBlock >= ACTIVITY_BLOCK_RANGE ? toBlock - ACTIVITY_BLOCK_RANGE + 1n : deps.deploymentBlock;
        const logs = await readLogs(fromBlock, toBlock);
        mine.push(
          ...logs.filter((log) => {
            const a = log.args;
            const actor = a.depositor ?? a.withdrawer ?? a.shieldedAddress ?? a.recipient ?? a.protector ?? a.user;
            return actor?.toLowerCase() === user;
          })
        );
        if (mine.length >= ACTIVITY_LIMIT * 2 || fromBlock === deps.deploymentBlock) break;
        toBlock = fromBlock - 1n;
      }
      const activated = new Set(
        mine.filter((log) => log.eventName === "ShieldActivated").map((log) => `${log.transactionHash}:${log.address.toLowerCase()}`)
      );
      const recent = mine.filter(
        (log) => !(log.eventName === "ShieldedWithdrawal" && activated.has(`${log.transactionHash}:${log.address.toLowerCase()}`))
      ).sort((x, y) => Number((y.blockNumber ?? 0n) - (x.blockNumber ?? 0n)) || (y.logIndex ?? 0) - (x.logIndex ?? 0)).slice(0, ACTIVITY_LIMIT);
      const blockNumbers = [...new Set(recent.map((l) => l.blockNumber).filter((b) => b !== null))];
      const blocks = await Promise.all(blockNumbers.map((b) => client.getBlock({ blockNumber: b }).catch(() => null)));
      const timeByBlock = new Map(blockNumbers.map((b, i) => [b, blocks[i] ? Number(blocks[i].timestamp) : null]));
      return recent.map((log) => {
        const a = log.args;
        const info = infoByPool.get(log.address.toLowerCase());
        const token = a.asset ?? a.preferredAsset ?? (log.eventName === "ShieldActivated" ? info?.backingToken : ["CommissionClaimed", "PartialWithdrawal"].includes(log.eventName ?? "") ? info?.shieldedToken : void 0);
        const amount = a.amount ?? a.backingTokenAmount ?? a.assets ?? a.withdrawAmount;
        return {
          txId: log.transactionHash ?? "",
          kind: ACTIVITY_EVENT_KINDS[log.eventName ?? ""] ?? "collect",
          timestamp: log.blockNumber !== null ? timeByBlock.get(log.blockNumber) ?? null : null,
          rawAmount: amount ?? null,
          token: token ?? null
        };
      });
    }
  };
}

// packages/adapter-evm/src/faucet.ts
import { erc20Abi as erc20Abi3, getAddress as getAddress2, zeroAddress as zeroAddress3, zeroHash as zeroHash2 } from "viem";

// packages/adapter-evm/src/abis/tokenFaucet.ts
var tokenFaucetAbi = [
  {
    type: "constructor",
    inputs: [
      {
        name: "owner_",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "COOLDOWN_PERIOD",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "canDrip",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "canDripNow",
        type: "bool",
        internalType: "bool"
      },
      {
        name: "nextDripTime",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "configureToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "drip",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "dripAll",
    inputs: [
      {
        name: "recipient",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "dripAmount",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "enabledTokens",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "bool",
        internalType: "bool"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getAllTokens",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address[]",
        internalType: "address[]"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "getTokenCount",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "lastDripTime",
    inputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      },
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "owner",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "removeToken",
    inputs: [
      {
        name: "token",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "renounceOwnership",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "setTokens",
    inputs: [
      {
        name: "newTokens",
        type: "address[]",
        internalType: "address[]"
      },
      {
        name: "newDripAmounts",
        type: "uint256[]",
        internalType: "uint256[]"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "tokens",
    inputs: [
      {
        name: "",
        type: "uint256",
        internalType: "uint256"
      }
    ],
    outputs: [
      {
        name: "",
        type: "address",
        internalType: "address"
      }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "transferOwnership",
    inputs: [
      {
        name: "newOwner",
        type: "address",
        internalType: "address"
      }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      {
        name: "previousOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "newOwner",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenConfigured",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "dripAmount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokenRemoved",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      }
    ],
    anonymous: false
  },
  {
    type: "event",
    name: "TokensDripped",
    inputs: [
      {
        name: "token",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "recipient",
        type: "address",
        indexed: true,
        internalType: "address"
      },
      {
        name: "amount",
        type: "uint256",
        indexed: false,
        internalType: "uint256"
      }
    ],
    anonymous: false
  },
  {
    type: "error",
    name: "OwnableInvalidOwner",
    inputs: [
      {
        name: "owner",
        type: "address",
        internalType: "address"
      }
    ]
  },
  {
    type: "error",
    name: "OwnableUnauthorizedAccount",
    inputs: [
      {
        name: "account",
        type: "address",
        internalType: "address"
      }
    ]
  }
];

// packages/adapter-evm/src/faucet.ts
function requireState2(condition, message) {
  if (!condition) throw new Error(message);
}
var nowSeconds = () => Math.floor(Date.now() / 1e3);
async function readFaucetStatus(client, faucetAddress, recipient, expectedTokens) {
  const address = getAddress2(faucetAddress), owner = getAddress2(recipient);
  requireState2(address !== zeroAddress3 && owner !== zeroAddress3, "Test-token dispenser or wallet is not configured.");
  requireState2(await client.getChainId() === 84532, "Test tokens require Base Sepolia.");
  const block = await client.getBlock({ blockTag: "latest" });
  requireState2(
    typeof block.number === "bigint" && block.number > 0n && /^0x[0-9a-fA-F]{64}$/.test(block.hash ?? "") && block.hash !== zeroHash2,
    "Test-token status needs a confirmed block."
  );
  const checkFresh = () => requireState2(
    typeof block.timestamp === "bigint" && block.timestamp > 0n && block.timestamp <= BigInt(nowSeconds()) && BigInt(nowSeconds()) - block.timestamp < 120n,
    "Test-token status is out of date. Refresh and try again."
  );
  checkFresh();
  const blockNumber = block.number;
  const [code, nativeBalance, inventory] = await Promise.all([
    client.getCode({ address, blockNumber }),
    client.getBalance({ address: owner, blockNumber }),
    client.readContract({ address, abi: tokenFaucetAbi, functionName: "getAllTokens", blockNumber })
  ]);
  requireState2(code && code !== "0x", "The configured test-token dispenser has no contract.");
  requireState2(typeof nativeBalance === "bigint" && nativeBalance >= 0n, "Test ETH balance is unavailable.");
  requireState2(Array.isArray(inventory) && inventory.length <= 64, "Test-token inventory is invalid.");
  const tokens = inventory.map((token) => getAddress2(token));
  requireState2(
    !tokens.includes(zeroAddress3) && new Set(tokens).size === tokens.length,
    "Test-token inventory contains duplicate or invalid tokens."
  );
  if (expectedTokens) {
    const expected = expectedTokens.map((token) => getAddress2(token));
    requireState2(
      expected.length === tokens.length && new Set(expected).size === expected.length && expected.every((token) => tokens.includes(token)),
      "Test-token inventory differs from the reviewed deployment."
    );
  }
  const states = await Promise.all(
    tokens.map(async (token) => {
      const [enabled, dripAmount, eligibility, faucetBalance] = await Promise.all([
        client.readContract({
          address,
          abi: tokenFaucetAbi,
          functionName: "enabledTokens",
          args: [token],
          blockNumber
        }),
        client.readContract({ address, abi: tokenFaucetAbi, functionName: "dripAmount", args: [token], blockNumber }),
        client.readContract({
          address,
          abi: tokenFaucetAbi,
          functionName: "canDrip",
          args: [token, owner],
          blockNumber
        }),
        client.readContract({ address: token, abi: erc20Abi3, functionName: "balanceOf", args: [address], blockNumber })
      ]);
      requireState2(
        typeof enabled === "boolean" && typeof dripAmount === "bigint" && dripAmount >= 0n && typeof faucetBalance === "bigint" && faucetBalance >= 0n,
        "Test-token inventory is unreadable."
      );
      requireState2(
        Array.isArray(eligibility) && typeof eligibility[0] === "boolean" && typeof eligibility[1] === "bigint" && eligibility[1] >= 0n && eligibility[1] <= BigInt(Number.MAX_SAFE_INTEGER),
        "Wallet claim eligibility is unavailable."
      );
      const funded = dripAmount > 0n && faucetBalance >= dripAmount;
      const canDrip = enabled && funded && eligibility[0] && eligibility[1] === 0n;
      return {
        address: token,
        enabled,
        funded,
        canDrip,
        dripAmount,
        faucetBalance,
        nextDripTime: Number(eligibility[1])
      };
    })
  );
  const canonical = await client.getBlock({ blockNumber });
  requireState2(
    canonical.number === blockNumber && canonical.hash === block.hash,
    "Test-token status changed during verification. Refresh and try again."
  );
  checkFresh();
  const evaluatedAt = nowSeconds();
  return {
    address,
    recipient: owner,
    chainId: 84532,
    blockNumber,
    blockHash: block.hash,
    evaluatedAt,
    validUntil: Math.min(evaluatedAt + 20, Number(block.timestamp) + 120),
    nativeBalance,
    configured: states.length > 0,
    ready: states.some((token) => token.canDrip),
    tokens: states
  };
}
export {
  createReader,
  readDemoMarket,
  readFaucetStatus
};
