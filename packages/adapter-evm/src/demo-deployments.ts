// Generated only after complete synthetic Base Sepolia deployment verification.
import type { Address, Hash } from "viem";
export type DemoDeployment = {
  chainId: 84532;
  mode?: "multi-asset";
  exchange: Address;
  oracle: Address;
  exchangeCodehash: Hash;
  oracleCodehash: Hash;
  quoteToken: Address;
  assets: readonly { token: Address; symbol: string; name: string; decimals: number }[];
};
export const DEMO_DEPLOYMENTS: Readonly<Record<number, DemoDeployment>> = {
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
        decimals: 8,
      },
      {
        token: "0xe765a85774263a94595C3B36d5ce2e59b95689bE",
        symbol: "tNVDAc",
        name: "NVIDIA",
        decimals: 8,
      },
      {
        token: "0x9115c740B4F6a9B56B4cFFA039fb5B46Ba69f730",
        symbol: "tMETAc",
        name: "Meta",
        decimals: 8,
      },
      {
        token: "0x560B12E0a9F6f65301b79F24CCBfbC0360f31bC3",
        symbol: "tGOOGLc",
        name: "Alphabet",
        decimals: 8,
      },
      {
        token: "0x54f25F95Af2527E08cfBe5A0528038e9DC4265f2",
        symbol: "tWETH",
        name: "Wrapped Ether",
        decimals: 18,
      },
      {
        token: "0x21f0fb9B8672955D62C0C9fF2E9a5D021EADCeBe",
        symbol: "tcbBTC",
        name: "Coinbase wrapped Bitcoin",
        decimals: 8,
      },
      {
        token: "0x0E5a8E9308fd29BA52Da9126270061c014Fb09f8",
        symbol: "vWETH",
        name: "Test WETH Yield Vault",
        decimals: 18,
      },
      {
        token: "0x17e1d0B9A4045a080e9cB3BBC45da3ee3893B5f3",
        symbol: "vUSDC",
        name: "Test USDC Yield Vault",
        decimals: 6,
      },
    ],
  },
};
