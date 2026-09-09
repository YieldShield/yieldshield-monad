// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
interface IShMonadDeposit { function deposit(uint256 assets, address receiver) external payable returns(uint256 shares); }
/// @notice Native MON -> shMON with a user-selected minimum share output and short deadline.
/// @dev No approval of native MON. Shares go to the caller. Unstaking remains a distinct protocol flow.
contract MonadStakingRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;
    address public immutable shMon;
    error InvalidRequest();
    constructor(address token) {
        if (block.chainid != 10143 || token.code.length == 0) revert InvalidRequest();
        shMon = token;
    }
    function stake(uint256 minShares, uint256 deadline) external payable nonReentrant returns(uint256 shares) {
        if (block.chainid != 10143 || msg.value == 0 || minShares == 0 || deadline < block.timestamp || deadline > block.timestamp + 600) revert InvalidRequest();
        uint256 beforeShares = IERC20(shMon).balanceOf(address(this));
        IShMonadDeposit(shMon).deposit{value:msg.value}(msg.value,address(this));
        shares = IERC20(shMon).balanceOf(address(this)) - beforeShares;
        if (shares < minShares) revert InvalidRequest();
        IERC20(shMon).safeTransfer(msg.sender,shares);
    }
}
