import type { Address, Hash } from "viem";
export type CryptoExtension = {
  factory: Address;
  factoryCodehash: Hash;
  factoryImplementation: Address;
  factoryImplementationCodehash: Hash;
  poolImplementation: Address;
  poolImplementationCodehash: Hash;
  compositeOracleCodehash: Hash;
  compositeOracle: Address;
  deploymentBlock: bigint;
  faucet: Address;
  pools: readonly Address[];
  vaults: readonly {
    address: Address;
    symbol: string;
    underlying: Address;
    underlyingSymbol: string;
    decimals: number;
    codehash: Hash;
  }[];
};
/** Published after complete additive deployment verification. */
export const CRYPTO_EXTENSION: CryptoExtension | undefined = {
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
    "0x92b7e0564B1e113C874A0B5f63f24Dc9D0CD0C47",
  ],
  vaults: [
    {
      address: "0x0E5a8E9308fd29BA52Da9126270061c014Fb09f8",
      symbol: "vWETH",
      underlying: "0x54f25F95Af2527E08cfBe5A0528038e9DC4265f2",
      decimals: 18,
      underlyingSymbol: "tWETH",
      codehash: "0xe3c8b609e3b223d28e8d2de96d8a19c31854bf3b3fb9c8bd610d086531c2759a",
    },
    {
      address: "0x17e1d0B9A4045a080e9cB3BBC45da3ee3893B5f3",
      symbol: "vUSDC",
      underlying: "0x4dFe9500E03AC27F25997184d162191cC5ADBf34",
      decimals: 6,
      underlyingSymbol: "TestUSDC",
      codehash: "0xe10a90ceb3e54b6eb73febcf4e1b9d645a6d139a9f14fcf72ffd969e2c21f82b",
    },
  ],
};
