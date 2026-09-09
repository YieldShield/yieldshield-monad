// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Fixed-supply, valueless Base Sepolia demo token. Not a stock, claim, or redeemable dollar.
/// @dev No owner, minting, upgrades, transfer fees, or issuer controls. The decimals live in storage
///      so every deployment has identical runtime code, which alpha integrations authenticate.
contract BaseSepoliaAlphaToken is ERC20 {
    error DemoChainOnly();
    error InvalidDemoToken();

    uint256 public constant DEMO_CHAIN_ID = 84532;
    uint8 private _demoDecimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply, address recipient)
        ERC20(name_, symbol_)
    {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
        if ((decimals_ != 6 && decimals_ != 8) || initialSupply == 0 || recipient == address(0)) {
            revert InvalidDemoToken();
        }
        _demoDecimals = decimals_;
        _mint(recipient, initialSupply);
    }

    function decimals() public view override returns (uint8) {
        return _demoDecimals;
    }

    function isSyntheticDemo() external pure returns (bool) {
        return true;
    }
}
