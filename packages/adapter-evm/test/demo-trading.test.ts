import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keccak256, type Address, type PublicClient } from "viem";
import { readDemoMarket, readDemoTradeQuote, assertDemoTrade } from "../src/demo-trading";
import type { DemoDeployment } from "../src/demo-deployments";
const address = (n: number) => ("0x" + n.toString(16).padStart(40, "0")) as Address;
const config: DemoDeployment = {
  chainId: 84532,
  exchange: address(1),
  oracle: address(2),
  quoteToken: address(3),
  exchangeCodehash: keccak256("0x6001"),
  oracleCodehash: keccak256("0x6002"),
  assets: ["tAAPLc", "tNVDAc", "tMETAc", "tGOOGLc"].map((symbol, i) => ({
    token: address(4 + i),
    symbol,
    name: symbol,
    decimals: 8,
  })),
};
const defaultConfig = config;
const now = 1800000000,
  owner = address(20),
  amount = 100000000n;
function fixture(config: DemoDeployment = defaultConfig) {
  const state = {
    chain: 84532,
    code: "valid",
    inventory: 10n ** 20n,
    wallet: 10n ** 20n,
    native: 1n,
    price: 10000000000n,
    fee: 30n,
    usd: 100300000n,
    canonical: true,
    supported: true,
  };
  const client = {
    getChainId: async () => state.chain,
    getBlock: async (o: { blockTag?: string }) => ({
      number: 10n,
      hash: "0x" + (o.blockTag || state.canonical ? "11" : "22").repeat(32),
      timestamp: BigInt(now - 1),
    }),
    getCode: async (o: { address: Address; blockNumber: bigint }) => {
      expect(o.blockNumber).toBe(10n);
      return state.code === "bad" ? "0x6000" : o.address === config.exchange ? "0x6001" : "0x6002";
    },
    getBalance: async () => state.native,
    readContract: async (o: { address: Address; functionName: string; args?: unknown[]; blockNumber?: bigint }) => {
      if (o.blockNumber !== undefined) expect(o.blockNumber).toBe(10n);
      const asset = config.assets.find((a) => a.token === o.address);
      switch (o.functionName) {
        case "oracle":
          return config.oracle;
        case "quoteToken":
          return config.quoteToken;
        case "feeBps":
          return state.fee;
        case "maxStockAmount":
          return 25n * 10n ** BigInt(config.mode === "multi-asset" ? 18 : 8);
        case "maxAssetAmount":
          return 25n * 10n ** BigInt(config.assets.find((a) => a.token === o.args?.[0])!.decimals);
        case "isDemo":
          return true;
        case "supportedStock":
          return state.supported;
        case "getPrice":
          return state.price;
        case "decimals":
          return o.address === config.quoteToken ? 6 : asset?.decimals;
        case "symbol":
          return asset?.symbol ?? "TestUSDC";
        case "quote":
          return [state.usd, 300000n, state.price];
        case "balanceOf":
          return o.args?.[0] === config.exchange ? state.inventory : state.wallet;
        default:
          throw new Error("Unexpected read " + o.functionName);
      }
    },
  } as unknown as PublicClient;
  return { client, state };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
});
afterEach(() => vi.useRealTimers());
describe("continuous test-stock trading", () => {
  it("authenticates the eight-asset mixed-decimal extension with per-asset maxima", async () => {
    const multi: DemoDeployment = {
      ...config,
      mode: "multi-asset",
      assets: [
        ...config.assets,
        ...[
          { symbol: "tWETH", decimals: 18 },
          { symbol: "tcbBTC", decimals: 8 },
          { symbol: "vWETH", decimals: 18 },
          { symbol: "vUSDC", decimals: 6 },
        ].map((a, i) => ({ ...a, name: a.symbol, token: address(40 + i) })),
      ],
    };
    const f = fixture(multi),
      market = await readDemoMarket(f.client, multi);
    expect(market.assets).toHaveLength(8);
    for (const a of market.assets) expect(a.maxAmount).toBe(25n * 10n ** BigInt(a.decimals));
    const btc = multi.assets.find((a) => a.symbol === "tcbBTC")!;
    await expect(
      readDemoTradeQuote(f.client, { asset: btc.token, side: "buy", amount: 26n * 10n ** 8n }, multi),
    ).rejects.toThrow("25 tokens");
    expect((await readDemoTradeQuote(f.client, { asset: btc.token, side: "buy", amount: 100000n }, multi)).amount).toBe(
      100000n,
    );
  });
  it("verifies deployment identity and keeps synthetic evaluation distinct from a market observation", async () => {
    const f = fixture(),
      market = await readDemoMarket(f.client, config);
    expect(market).toMatchObject({
      chainId: 84532,
      exchange: config.exchange,
      feeBps: 30,
      ready: true,
      evaluatedAt: now - 1,
      validUntil: now + 19,
    });
    expect(market.assets).toHaveLength(4);
    expect(market.assets[0]?.priceUsd8).toBe(f.state.price);
  });
  it("quotes an exact stock purchase including fees without needing a connected wallet", async () => {
    const f = fixture(),
      q = await readDemoTradeQuote(f.client, { asset: address(4), side: "buy", amount }, config);
    expect(q).toMatchObject({
      inputToken: config.quoteToken,
      outputToken: address(4),
      inputAmount: 100300000n,
      outputAmount: amount,
      feeAmount: 300000n,
      owner: undefined,
    });
  });
  it("uses exact stock input and bounded USDC output for sales", async () => {
    const f = fixture();
    f.state.usd = 99700000n;
    expect(
      await readDemoTradeQuote(f.client, { asset: address(4), side: "sell", amount, owner }, config),
    ).toMatchObject({ inputAmount: amount, outputAmount: 99700000n, owner });
  });
  it.each([8453, 1, 31337])("rejects chain %s before accepting a demo target", async (chain) => {
    const f = fixture();
    f.state.chain = chain;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("Base Sepolia");
  });
  it("rejects code substitution even if getter values look correct", async () => {
    const f = fixture();
    f.state.code = "bad";
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("verified");
  });
  it("rejects changes to canonical evidence", async () => {
    const f = fixture();
    f.state.canonical = false;
    await expect(readDemoMarket(f.client, config)).rejects.toThrow("changed");
  });
  it("rejects unsupported, oversized and empty orders", async () => {
    const f = fixture();
    for (const request of [
      { asset: address(99), side: "buy" as const, amount },
      { asset: address(4), side: "buy" as const, amount: 26n * amount },
      { asset: address(4), side: "buy" as const, amount: 0n },
    ])
      await expect(readDemoTradeQuote(f.client, request, config)).rejects.toThrow();
  });
  it("does not offer a fill without enough output inventory", async () => {
    const f = fixture();
    f.state.inventory = amount - 1n;
    await expect(readDemoTradeQuote(f.client, { asset: address(4), side: "buy", amount }, config)).rejects.toThrow(
      "inventory",
    );
  });
  it("rechecks buy maximum input, sell minimum output and deadline", async () => {
    const f = fixture(),
      request = { asset: address(4), side: "buy" as const, amount, deadline: BigInt(now + 120), limit: 101000000n };
    await expect(assertDemoTrade(f.client, owner, request, config)).resolves.toMatchObject({ owner });
    await expect(assertDemoTrade(f.client, owner, { ...request, limit: 100000000n }, config)).rejects.toThrow(
      "price moved",
    );
    await expect(
      assertDemoTrade(f.client, owner, { ...request, side: "sell", limit: 102000000n }, config),
    ).rejects.toThrow("price moved");
    await expect(assertDemoTrade(f.client, owner, { ...request, deadline: BigInt(now) }, config)).rejects.toThrow(
      "expired",
    );
    await expect(assertDemoTrade(f.client, owner, { ...request, deadline: BigInt(now + 301) }, config)).rejects.toThrow(
      "expired",
    );
  });
  it("checks spend-limit coverage and test ETH before requesting approval", async () => {
    const f = fixture(),
      request = { asset: address(4), side: "buy" as const, amount, deadline: BigInt(now + 120), limit: 101000000n };
    f.state.wallet = 100300000n;
    await expect(assertDemoTrade(f.client, owner, request, config)).rejects.toThrow("balance");
    f.state.wallet = 10n ** 20n;
    f.state.native = 0n;
    await expect(assertDemoTrade(f.client, owner, request, config)).rejects.toThrow("test ETH");
  });
});
