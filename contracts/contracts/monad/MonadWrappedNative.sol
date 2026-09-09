// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice YieldShield's explicit testnet MON wrapper. Not the canonical ecosystem WMON.
/// @dev Every share is redeemable 1:1 for held native testnet MON. No owner or mint privilege.
contract MonadWrappedNative is ERC20, ReentrancyGuard {
    error TestnetOnly();
    error InvalidAmount();
    error NativeTransferFailed();
    constructor() ERC20("YieldShield Wrapped Testnet MON", "WMON") {
        if (block.chainid != 10143) revert TestnetOnly();
    }
    receive() external payable { deposit(); }
    function deposit() public payable {
        if (block.chainid != 10143) revert TestnetOnly();
        if (msg.value == 0) revert InvalidAmount();
        _mint(msg.sender, msg.value);
    }
    function withdraw(uint256 amount) external nonReentrant {
        if (block.chainid != 10143) revert TestnetOnly();
        if (amount == 0) revert InvalidAmount();
        _burn(msg.sender, amount);
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NativeTransferFailed();
    }
}
