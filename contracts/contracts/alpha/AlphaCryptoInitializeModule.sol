// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { ProtocolAccessControlUpgradeable } from "../base/ProtocolAccessControlUpgradeable.sol";
import { BasePoolInitializeModule } from "../base-modules/BasePoolInitializeModule.sol";
import { AlphaCryptoToken } from "./AlphaCryptoToken.sol";
import { BaseSepoliaAlphaToken } from "./BaseSepoliaAlphaToken.sol";
import { TokenWhitelistLib } from "../libraries/TokenWhitelistLib.sol";

/// @notice Base Sepolia-only initialization adapter with explicit short demo waiting periods.
/// @dev Reuses the original initializer by delegatecall, preserving every validation and all
///      pool storage. ONLY the first struct's two timing fields are changed after initialization.
///      Inheriting the original access-control base preserves its slots 0..49. The original
///      PoolConfig struct follows at slot 50; layout regressions pin timing fields at 55 and 56.
///      Wire this module into a NEW immutable BasePoolRouter. Existing pools are unaffected.
contract AlphaCryptoInitializeModule is ProtocolAccessControlUpgradeable {
    error DemoChainOnly();
    error InvalidModule();
    error InvalidDemoToken();
    error UnknownSelector();

    uint256 public constant DEMO_CHAIN_ID = 84532;
    uint256 public constant DEMO_MINIMUM_POOL_TIME = 60;
    uint256 public constant DEMO_UNLOCK_DURATION = 120;
    address public immutable originalModule;
    bytes32 public immutable originalModuleCodeHash;
    BasePoolInitializeModule.PoolConfig private _poolConfig;
    address public immutable wethVault;
    address public immutable usdVault;
    bytes32 private immutable wethVaultHash;
    bytes32 private immutable usdVaultHash;

    constructor(address originalModule_, address wethVault_, address usdVault_) {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if (originalModule_.code.length == 0) revert InvalidModule();
        if (wethVault_.code.length == 0 || usdVault_.code.length == 0) revert InvalidDemoToken();
        wethVault = wethVault_; usdVault = usdVault_;
        wethVaultHash = wethVault_.codehash; usdVaultHash = usdVault_.codehash;
        originalModule = originalModule_;
        originalModuleCodeHash = originalModule_.codehash;
        _disableInitializers();
    }

    fallback() external {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if (
            msg.sig != BasePoolInitializeModule.initialize.selector
                && msg.sig != BasePoolInitializeModule.initializeWithAccessControl.selector
        ) revert UnknownSelector();
        if (originalModule.codehash != originalModuleCodeHash) revert InvalidModule();
        (TokenWhitelistLib.TokenInfo memory shielded, TokenWhitelistLib.TokenInfo memory backing) =
            abi.decode(msg.data[4:], (TokenWhitelistLib.TokenInfo, TokenWhitelistLib.TokenInfo));
        bool shieldedAllowed = shielded.token.codehash == keccak256(type(AlphaCryptoToken).runtimeCode)
            || (shielded.token.codehash == keccak256(type(BaseSepoliaAlphaToken).runtimeCode) && BaseSepoliaAlphaToken(shielded.token).decimals() == 8)
            || (shielded.token == wethVault && shielded.token.codehash == wethVaultHash);
        bool backingAllowed = (backing.token.codehash == keccak256(type(BaseSepoliaAlphaToken).runtimeCode)
            && BaseSepoliaAlphaToken(backing.token).decimals() == 6)
            || (backing.token == usdVault && backing.token.codehash == usdVaultHash);
        if (!shieldedAllowed || !backingAllowed) revert InvalidDemoToken();
        (bool success, bytes memory data) = originalModule.delegatecall(msg.data);
        if (!success) assembly ("memory-safe") { revert(add(data, 32), mload(data)) }
        _poolConfig.minimumPoolTime = DEMO_MINIMUM_POOL_TIME;
        _poolConfig.unlockDuration = DEMO_UNLOCK_DURATION;
        assembly ("memory-safe") { return(add(data, 32), mload(data)) }
    }
}
