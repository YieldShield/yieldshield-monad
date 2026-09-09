// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { ProtocolAccessControlUpgradeable } from "../base/ProtocolAccessControlUpgradeable.sol";
import { BasePoolInitializeModule } from "../base-modules/BasePoolInitializeModule.sol";
import { TokenWhitelistLib } from "../libraries/TokenWhitelistLib.sol";

/// @notice Monad testnet adapter for the audited-layout, immutable module router foundation.
/// @dev Only pinned assets are eligible for the 60-second protected exit / 120-second junior notice.
/// Storage layout is inherited exactly; module address and asset addresses are immutable.
contract MonadPoolInitializeModule is ProtocolAccessControlUpgradeable {
    error InvalidConfiguration();
    address public immutable originalModule;
    bytes32 public immutable originalModuleCodeHash;
    address public immutable wmon;
    address public immutable shmon;
    address public immutable scenario;
    address public immutable usd;
    address public immutable usdVault;
    BasePoolInitializeModule.PoolConfig private _poolConfig;
    constructor(address original, address w, address s, address lab, address u, address v) {
        if (block.chainid != 10143 || original.code.length == 0 || w.code.length == 0 ||
            s.code.length == 0 || lab.code.length == 0 || u.code.length == 0 || v.code.length == 0) revert InvalidConfiguration();
        originalModule = original; originalModuleCodeHash = original.codehash;
        wmon = w; shmon = s; scenario = lab; usd = u; usdVault = v;
        _disableInitializers();
    }
    fallback() external {
        if (block.chainid != 10143 || originalModule.codehash != originalModuleCodeHash ||
            (msg.sig != BasePoolInitializeModule.initialize.selector && msg.sig != BasePoolInitializeModule.initializeWithAccessControl.selector)) revert InvalidConfiguration();
        (TokenWhitelistLib.TokenInfo memory shielded, TokenWhitelistLib.TokenInfo memory backing) =
            abi.decode(msg.data[4:], (TokenWhitelistLib.TokenInfo, TokenWhitelistLib.TokenInfo));
        if ((shielded.token != wmon && shielded.token != shmon && shielded.token != scenario) ||
            (backing.token != usd && backing.token != usdVault)) revert InvalidConfiguration();
        (bool success, bytes memory result) = originalModule.delegatecall(msg.data);
        if (!success) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
        _poolConfig.minimumPoolTime = 60;
        _poolConfig.unlockDuration = 120;
        assembly ("memory-safe") { return(add(result, 32), mload(result)) }
    }
}
