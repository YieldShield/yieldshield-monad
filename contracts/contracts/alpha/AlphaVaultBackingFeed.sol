// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { ERC4626OracleFeed } from "../oracles/ERC4626OracleFeed.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Base Sepolia backing-share price at checked LIVE redeemable NAV.
/// @dev The generic ERC4626 feed's upward-clamped getPrice is intentionally prohibited as
///      backing: it would overpay shares. This distinct, immutable feed uses its live-rate
///      path, retaining minimum liquidity, rate-deviation and protected-underlying checks.
///      Only a configured synthetic vault is supported. No owner, mutable rate or fallback.
contract AlphaVaultBackingFeed {
    error InvalidConfiguration();
    ERC4626OracleFeed public navFeed;
    address public backingVault;
    constructor(address feed, address vault) {
        if (block.chainid != 84532 || feed.code.length == 0 || vault.code.length == 0) revert InvalidConfiguration();
        navFeed = ERC4626OracleFeed(feed);
        backingVault = vault;
        if (navFeed.getPriceForFeeAccrual(vault) == 0) revert InvalidConfiguration();
    }
    function decimals() external pure returns(uint8) { return 8; }
    function description() external pure returns(string memory) { return "Test vault live NAV backing price"; }
    function getPrice(address token) public view returns(uint256) {
        if (block.chainid != 84532 || token != backingVault) revert InvalidConfiguration();
        // Retain the generic feed's liquidity, reference bounds and underlying health checks.
        navFeed.getPriceForFeeAccrual(token);
        IERC4626 vault = IERC4626(token);
        uint256 sampleFactor = 1e8;
        uint256 sample = (10 ** IERC20Metadata(token).decimals()) * sampleFactor;
        uint256 accounting = vault.convertToAssets(sample);
        uint256 redeemable = vault.previewRedeem(sample);
        uint256 assets = accounting < redeemable ? accounting : redeemable;
        address underlying = vault.asset();
        uint256 underlyingPrice = navFeed.underlyingPriceOracle().getPrice(underlying);
        // Round the denominator UP: a precision loss must not overpay backing shares.
        return Math.mulDiv(assets + 1, underlyingPrice, (10 ** IERC20Metadata(underlying).decimals()) * sampleFactor, Math.Rounding.Ceil);
    }
    function getPriceUnsafe(address token) external view returns(uint256) { return getPrice(token); }
    function getPriceForFeeAccrual(address token) external view returns(uint256) { return getPrice(token); }
    function getPriceWithStrictCircuitBreaker(address token) external view returns(uint256) { return getPrice(token); }
    function supportsCircuitBreaker(address token) external view returns(bool) { return _supported(token); }
    function supportsStrictProtectedPrice(address token) external view returns(bool) { return _supported(token); }
    function isPriceStale(address token) external view returns(bool,uint64) {
        getPrice(token);
        return navFeed.isPriceStale(token);
    }
    function _supported(address token) private view returns(bool) {
        return block.chainid == 84532 && token == backingVault && navFeed.supportsStrictProtectedPrice(token);
    }
}
