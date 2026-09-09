import { erc20Abi, getAddress, zeroAddress, zeroHash, type Address, type PublicClient } from "viem";
import { tokenFaucetAbi } from "./abis/tokenFaucet.js";

export type EvmFaucetStatus = {
  address: string;
  recipient: string;
  chainId: number;
  blockNumber: bigint;
  blockHash: string;
  evaluatedAt: number;
  validUntil: number;
  nativeBalance: bigint;
  configured: boolean;
  ready: boolean;
  tokens: Array<{
    address: string;
    enabled: boolean;
    funded: boolean;
    canDrip: boolean;
    dripAmount: bigint;
    faucetBalance: bigint;
    nextDripTime: number;
  }>;
};
function requireState(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** Reads the independently published Base Sepolia faucet. Never accepts a target from a status response. */
export async function readFaucetStatus(
  client: PublicClient,
  faucetAddress: Address,
  recipient: Address,
  expectedTokens?: readonly Address[],
): Promise<EvmFaucetStatus> {
  const address = getAddress(faucetAddress),
    owner = getAddress(recipient);
  requireState(address !== zeroAddress && owner !== zeroAddress, "Test-token dispenser or wallet is not configured.");
  requireState((await client.getChainId()) === 84532, "Test tokens require Base Sepolia.");
  const block = await client.getBlock({ blockTag: "latest" });
  requireState(
    typeof block.number === "bigint" &&
      block.number > 0n &&
      /^0x[0-9a-fA-F]{64}$/.test(block.hash ?? "") &&
      block.hash !== zeroHash,
    "Test-token status needs a confirmed block.",
  );
  const checkFresh = () =>
    requireState(
      typeof block.timestamp === "bigint" &&
        block.timestamp > 0n &&
        block.timestamp <= BigInt(nowSeconds()) &&
        BigInt(nowSeconds()) - block.timestamp < 120n,
      "Test-token status is out of date. Refresh and try again.",
    );
  checkFresh();
  const blockNumber = block.number;
  const [code, nativeBalance, inventory] = await Promise.all([
    client.getCode({ address, blockNumber }),
    client.getBalance({ address: owner, blockNumber }),
    client.readContract({ address, abi: tokenFaucetAbi, functionName: "getAllTokens", blockNumber }),
  ]);
  requireState(code && code !== "0x", "The configured test-token dispenser has no contract.");
  requireState(typeof nativeBalance === "bigint" && nativeBalance >= 0n, "Test ETH balance is unavailable.");
  requireState(Array.isArray(inventory) && inventory.length <= 64, "Test-token inventory is invalid.");
  const tokens = inventory.map((token) => getAddress(token));
  requireState(
    !tokens.includes(zeroAddress) && new Set(tokens).size === tokens.length,
    "Test-token inventory contains duplicate or invalid tokens.",
  );
  if (expectedTokens) {
    const expected = expectedTokens.map((token) => getAddress(token));
    requireState(
      expected.length === tokens.length &&
        new Set(expected).size === expected.length &&
        expected.every((token) => tokens.includes(token)),
      "Test-token inventory differs from the reviewed deployment.",
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
          blockNumber,
        }),
        client.readContract({ address, abi: tokenFaucetAbi, functionName: "dripAmount", args: [token], blockNumber }),
        client.readContract({
          address,
          abi: tokenFaucetAbi,
          functionName: "canDrip",
          args: [token, owner],
          blockNumber,
        }),
        client.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [address], blockNumber }),
      ]);
      requireState(
        typeof enabled === "boolean" &&
          typeof dripAmount === "bigint" &&
          dripAmount >= 0n &&
          typeof faucetBalance === "bigint" &&
          faucetBalance >= 0n,
        "Test-token inventory is unreadable.",
      );
      requireState(
        Array.isArray(eligibility) &&
          typeof eligibility[0] === "boolean" &&
          typeof eligibility[1] === "bigint" &&
          eligibility[1] >= 0n &&
          eligibility[1] <= BigInt(Number.MAX_SAFE_INTEGER),
        "Wallet claim eligibility is unavailable.",
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
        nextDripTime: Number(eligibility[1]),
      };
    }),
  );
  const canonical = await client.getBlock({ blockNumber });
  requireState(
    canonical.number === blockNumber && canonical.hash === block.hash,
    "Test-token status changed during verification. Refresh and try again.",
  );
  checkFresh();
  const evaluatedAt = nowSeconds();
  return {
    address,
    recipient: owner,
    chainId: 84532,
    blockNumber,
    blockHash: block.hash!,
    evaluatedAt,
    validUntil: Math.min(evaluatedAt + 20, Number(block.timestamp) + 120),
    nativeBalance,
    configured: states.length > 0,
    ready: states.some((token) => token.canDrip),
    tokens: states,
  };
}
