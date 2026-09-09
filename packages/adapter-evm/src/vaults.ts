import { erc20Abi, keccak256, parseAbi, type Address, type PublicClient } from "viem";
import type { DemoVault } from "@yieldshield/core";
import { CRYPTO_EXTENSION } from "./crypto-deployment.js";
import { readSnapshot } from "./snapshot.js";
export const demoVaultAbi = parseAbi([
  "function asset() view returns(address)",
  "function totalAssets() view returns(uint256)",
  "function convertToAssets(uint256) view returns(uint256)",
  "function previewDeposit(uint256) view returns(uint256)",
  "function previewRedeem(uint256) view returns(uint256)",
  "function depositWithMin(uint256 assets,uint256 minShares,address receiver) returns(uint256 shares)",
  "function redeemWithMin(uint256 shares,uint256 minAssets,address receiver) returns(uint256 assets)",
  "function fundTestYield(uint256 assets)",
]);
export async function readDemoVaults(client: PublicClient): Promise<DemoVault[]> {
  if (!CRYPTO_EXTENSION) return [];
  if ((await client.getChainId()) !== 84532) throw new Error("Vault demonstration requires Base Sepolia.");
  const snapshot = await readSnapshot(client, "Vault");
  const blockNumber = snapshot.block.number;
  const result = await Promise.all(
    CRYPTO_EXTENSION.vaults.map(async (v) => {
      const [code, asset, assets, supply, rate, balance] = await Promise.all([
        client.getCode({ address: v.address, blockNumber }),
        client.readContract({ address: v.address, abi: demoVaultAbi, functionName: "asset", blockNumber }),
        client.readContract({ address: v.address, abi: demoVaultAbi, functionName: "totalAssets", blockNumber }),
        client.readContract({ address: v.address, abi: erc20Abi, functionName: "totalSupply", blockNumber }),
        client.readContract({
          address: v.address,
          abi: demoVaultAbi,
          functionName: "convertToAssets",
          args: [10n ** BigInt(v.decimals)],
          blockNumber,
        }),
        client.readContract({
          address: v.underlying,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [v.address],
          blockNumber,
        }),
      ]);
      if (
        !code ||
        keccak256(code) !== v.codehash ||
        asset.toLowerCase() !== v.underlying.toLowerCase() ||
        assets <= 0n ||
        supply <= 0n ||
        balance < assets ||
        rate <= 0n
      )
        throw new Error("Vault backing could not be verified.");
      return {
        address: v.address,
        symbol: v.symbol,
        underlying: v.underlying,
        underlyingSymbol: v.underlyingSymbol,
        decimals: v.decimals,
        totalAssets: assets,
        totalShares: supply,
        assetsPerShare: rate,
        evaluatedAt: Number(snapshot.block.timestamp),
        validUntil: Number(snapshot.validUntil),
      };
    }),
  );
  return snapshot.finish(result);
}
export async function checkDemoVault(client: PublicClient, vault: string) {
  const v = (await readDemoVaults(client)).find((v) => v.address.toLowerCase() === vault.toLowerCase());
  if (!v) throw new Error("Choose a configured test vault.");
  return v;
}
export async function readDemoVaultQuote(
  client: PublicClient,
  vault: string,
  action: "deposit" | "redeem",
  amount: bigint,
) {
  if (amount <= 0n) throw new Error("Enter a positive vault amount.");
  const v = await checkDemoVault(client, vault);
  const amountOut = await client.readContract({
    address: v.address as Address,
    abi: demoVaultAbi,
    functionName: action === "deposit" ? "previewDeposit" : "previewRedeem",
    args: [amount],
  });
  if (amountOut <= 0n) throw new Error("This amount is too small.");
  return { amountOut, validUntil: v.validUntil };
}
