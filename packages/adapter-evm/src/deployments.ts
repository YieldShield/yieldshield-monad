// Generated only after complete synthetic Base Sepolia deployment verification.
import type { Address } from "viem";
export type EvmDeployment = { factory: Address; compositeOracle: Address; faucet?: Address; deploymentBlock?: bigint };
export const DEPLOYMENTS: Record<number, EvmDeployment> = {
  46630: {
    factory: "0x067E0566c8242D57e1aF9FfecD18150C84F98E92",
    compositeOracle: "0x67A89f76Ae9a89866a0E62785d7999efE1c5E592",
    faucet: "0x6c4DdBC132C8e0aee4869334e449d664c40a147C",
  },
  84532: {
    factory: "0x600C46a5827b957cAF3a8Fd7a43cC4b24Ab5a230",
    compositeOracle: "0x932ee4a1eB3d17a9518981949ec4cdc6196Bba44",
    faucet: "0x5B934A891192CC6337cBdbdD35E3F4f4a336354A",
    deploymentBlock: 46556315n,
  },
};
