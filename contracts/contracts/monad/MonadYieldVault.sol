// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { MonadTestToken } from "./MonadTestToken.sol";

/// @notice Monad testnet vault shares backed by real balances of valueless test assets.
/// @dev Yield comes only from separately funded test-asset donations, never minting unbacked shares.
///      This is not a lending/staking strategy, Treasury instrument, APY promise or issuer product.
contract MonadYieldVault is ERC4626, ReentrancyGuard {
    using SafeERC20 for IERC20;
    error DemoChainOnly();
    error InvalidUnderlying();
    error InvalidYield();
    event TestYieldFunded(address indexed funder, uint256 assets, uint256 assetsPerShare);
    uint256 private accountedAssets;

    function depositWithMin(uint256 assets, uint256 minShares, address receiver) external nonReentrant returns(uint256 shares) {
        shares = deposit(assets, receiver);
        if (minShares == 0 || shares < minShares) revert InvalidYield();
    }

    function redeemWithMin(uint256 shares, uint256 minAssets, address receiver) external nonReentrant returns(uint256 assets) {
        assets = redeem(shares, receiver, msg.sender);
        if (minAssets == 0 || assets < minAssets) revert InvalidYield();
    }

    // Unsolicited transfers do not manipulate NAV; only deposits and funded yield enter accounting.
    function totalAssets() public view override returns (uint256) { return accountedAssets; }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        accountedAssets += assets;
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal override
    {
        accountedAssets -= assets;
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    constructor(address underlying, string memory name_, string memory symbol_)
        ERC20(name_, symbol_)
        ERC4626(IERC20(underlying))
    {
        if (block.chainid != 10143) revert DemoChainOnly();
        if (underlying.codehash != keccak256(type(MonadTestToken).runtimeCode)) revert InvalidUnderlying();
    }

    /// @notice Add actual underlying tokens for existing shareholders. No shares are minted.
    /// @dev Limit a single contribution to 0.1% of assets. The oracle separately bounds the
    ///      cumulative exchange-rate change against its registered reference; no yield is fabricated.
    function fundTestYield(uint256 assets) external nonReentrant {
        if (block.chainid != 10143) revert DemoChainOnly();
        uint256 beforeAssets = totalAssets();
        if (assets == 0 || totalSupply() < 1000 * 10 ** decimals() || assets > beforeAssets / 1000) {
            revert InvalidYield();
        }
        uint256 beforeBalance = IERC20(asset()).balanceOf(address(this));
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        if (IERC20(asset()).balanceOf(address(this)) - beforeBalance != assets) revert InvalidYield();
        accountedAssets += assets;
        // A finite, explicit demo yield budget stays inside the NAV oracle's 5% reference bound.
        if (convertToAssets(10 ** decimals()) > 102 * 10 ** decimals() / 100) revert InvalidYield();
        emit TestYieldFunded(msg.sender, assets, convertToAssets(10 ** decimals()));
    }
}
