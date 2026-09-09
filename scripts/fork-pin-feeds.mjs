/**
 * Re-pin every mock Chainlink feed on a LOCAL anvil fork of Robinhood testnet so prices are
 * fresh and pools leave the "Paused for safety" state. (The mock feeds only update when the
 * owner pushes a price; max price age is 1 day, so a fork — and the live testnet, absent a
 * keeper — goes stale within a day of the last push.)
 *
 * Re-sets each feed to its current answer with a new timestamp, impersonating the feed owner.
 *
 *   anvil --fork-url https://rpc.testnet.chain.robinhood.com --port 8545   # running
 *   node scripts/fork-pin-feeds.mjs
 */
import { createTestClient, createWalletClient, http } from "viem";
import { createEvmAdapter, robinhoodTestnet } from "@yieldshield/adapter-evm";

const RPC = process.env.FORK_RPC ?? "http://127.0.0.1:8545";

// smart-contracts/deployments/46630.json (2026-07-10 redeploy)
const MOCK_FEEDS = {
  USDG: "0x264E49fF51c763eb1226136De585bd8f10D7A90f",
  WETH: "0x7A1b58f9338886169AB3eC53bF042458bC0897C4",
  SGOV: "0xb10b3Dd440A0aE22152de0cF8b73ED02EEbB5Af9",
  SPY: "0xEDf08f770135db33cEC87f00E415c2ae39A3A885",
  QQQ: "0xEe5785e51D7e8A4438Dc029A3C642BaC2D558bC4",
  TSLA: "0xCEDdb0b2E34D3d332F347fe76FC5efcb9Df5ae03",
  AMZN: "0xa7c2Ff0c7729870dF6ED2f74f3aF0DE31883a222",
  PLTR: "0xD7F92C03c07Addea25C2e3B5f97f523a52fC6ce1",
  NFLX: "0x82f506B8Df120344cB69aF781dFDE2128447687A",
  AMD: "0x3d5aEd8e523eec8Fd3A45e1D80096A8EEFC88282",
};

const AGGREGATOR_ABI = [
  {
    type: "function",
    name: "latestRoundData",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint80" }, { type: "int256" }, { type: "uint256" }, { type: "uint256" }, { type: "uint80" }],
  },
  { type: "function", name: "setAnswer", stateMutability: "nonpayable", inputs: [{ type: "int256" }], outputs: [] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
];

const adapter = createEvmAdapter({ chain: robinhoodTestnet, rpcUrl: RPC });
const pub = adapter.publicClient;
const testClient = createTestClient({ chain: robinhoodTestnet, mode: "anvil", transport: http(RPC) });
const wallet = createWalletClient({ chain: robinhoodTestnet, transport: http(RPC) });

for (const [symbol, feed] of Object.entries(MOCK_FEEDS)) {
  const owner = await pub.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "owner" });
  await testClient.impersonateAccount({ address: owner });
  await testClient.setBalance({ address: owner, value: 10n ** 20n });
  const [, answer] = await pub.readContract({ address: feed, abi: AGGREGATOR_ABI, functionName: "latestRoundData" });
  const hash = await wallet.writeContract({
    address: feed,
    abi: AGGREGATOR_ABI,
    functionName: "setAnswer",
    args: [answer],
    account: owner,
    chain: robinhoodTestnet,
    gas: 500_000n,
  });
  await pub.waitForTransactionReceipt({ hash });
  console.log(`re-pinned ${symbol.padEnd(5)} @ ${Number(answer) / 1e8}`);
}

const pools = await adapter.reader.loadPools();
const paused = pools.filter((p) => p.oracle.paused).length;
console.log(
  `\nfeeds fresh — ${pools.length - paused}/${pools.length} pools healthy${paused ? ` (${paused} still paused)` : ""}`,
);
