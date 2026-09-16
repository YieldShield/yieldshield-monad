// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { ProtocolAccessControlUpgradeable } from "../base/ProtocolAccessControlUpgradeable.sol";
import { BasePoolInitializeModule } from "../base-modules/BasePoolInitializeModule.sol";
import { TokenWhitelistLib } from "../libraries/TokenWhitelistLib.sol";
import { MonadAssetRegistry } from "./MonadAssetRegistry.sol";

/// @notice Preserves the original pool storage layout; asset policy lives in a pinned external contract.
contract MonadExpandedInitializeModule is ProtocolAccessControlUpgradeable {
    error InvalidConfiguration();
    address public immutable originalModule;
    bytes32 public immutable originalModuleCodeHash;
    MonadAssetRegistry public immutable assetRegistry;
    bytes32 public immutable registryCodeHash;
    BasePoolInitializeModule.PoolConfig private _poolConfig;
    constructor(address original, address registry) {
        if (block.chainid != 10143 || original.code.length == 0 || registry.code.length == 0) revert InvalidConfiguration();
        originalModule = original; originalModuleCodeHash = original.codehash;
        assetRegistry = MonadAssetRegistry(registry); registryCodeHash = registry.codehash;
        _disableInitializers();
    }
    fallback() external {
        if (block.chainid != 10143 || originalModule.codehash != originalModuleCodeHash || address(assetRegistry).codehash != registryCodeHash ||
            (msg.sig != BasePoolInitializeModule.initialize.selector && msg.sig != BasePoolInitializeModule.initializeWithAccessControl.selector)) revert InvalidConfiguration();
        (TokenWhitelistLib.TokenInfo memory shielded, TokenWhitelistLib.TokenInfo memory backing) = abi.decode(msg.data[4:], (TokenWhitelistLib.TokenInfo, TokenWhitelistLib.TokenInfo));
        if (shielded.token == backing.token || !assetRegistry.canProtect(shielded.token) || !assetRegistry.canBack(backing.token)) revert InvalidConfiguration();
        (bool success, bytes memory result) = originalModule.delegatecall(msg.data);
        if (!success) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
        _poolConfig.minimumPoolTime = 60;
        _poolConfig.unlockDuration = 120;
        assembly ("memory-safe") { return(add(result, 32), mload(result)) }
    }
}
