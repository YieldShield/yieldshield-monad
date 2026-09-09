// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

/// @notice Reviewed Coinbase B20 token/feed pairs from Base's official tokenized-stock specification.
/// @dev Address identity is authoritative. B20 precompiles have no bytecode and raw balances do not rebase.
///      Never use these mainnet exemptions on another chain or for arbitrary B20 issuers.
library BaseStockTokenLib {
    uint256 internal constant BASE_CHAIN_ID = 8453;
    address internal constant COINBASE_ORACLE_REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address internal constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    function isCanonicalStockToken(address token) internal view returns (bool) {
        return block.chainid == BASE_CHAIN_ID && sourceFeed(token) != address(0);
    }

    /// @notice Canonical Base-mainnet identity, also used to verify metadata of testnet relays.
    function sourceFeed(address token) internal pure returns (address) {
        if (token == 0xb200000000000000000000C2e324d24d7eEcd1fb) return 0x787f13dEa48Db0897CbCDD985de77809D837F988;
        if (token == 0xb200000000000000000000d9192b6B456483C2E8) return 0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295;
        if (token == 0xb200000000000000000000c85a31389D71F3ecfb) return 0x408e44f504A7371a345F03a73dDC96A4b48e8aa7;
        if (token == 0xB20000000000000000000019f6E7C675b73C2e4D) return 0x0231cF2635D1E17bB5c2462cc7504Ba1fBd61f33;
        if (token == 0xb2000000000000000000002D0BA3164cc74f58B7) return 0x5bF49E0ffA937CE2FfF033c739aD7C634c4D34F2;
        if (token == 0xB2000000000000000000004AFF16039bA04bdFBc) return 0xAB657C39bac0D5886250D70849e2E3E008F2EECB;
        if (token == 0xb2000000000000000000008bC8786B856E61707C) return 0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D;
        if (token == 0xB200000000000000000000Ab99cFa739E253872B) return 0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c;
        if (token == 0xb2000000000000000000004884b426556b92883d) return 0xB3cE282CD188b35DA0E38D8Bc7d58e33173D202a;
        if (token == 0xb20000000000000000000078ee7ce2fE4908108C) return 0x04689a41629776563E6822F76f2e57D148d28513;
        if (token == 0xb200000000000000000000397293Cb8cda9a10c5) return 0x388b0dC46C0Fb05A74BeE0994fa5b02c6Fcca2eA;
        if (token == 0xb2000000000000000000007b9fcbd005511aCBd5) return 0x6A634B235903C4ad6376892180d6fF8612e3Fa68;
        if (token == 0xb2000000000000000000001e800a7f5189430cD0) return 0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4;
        return address(0);
    }
}
