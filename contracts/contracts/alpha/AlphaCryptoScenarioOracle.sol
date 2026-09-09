// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IPriceOracle } from "../interfaces/IPriceOracle.sol";
import { AlphaCryptoToken } from "./AlphaCryptoToken.sol";
import { BaseSepoliaAlphaToken } from "./BaseSepoliaAlphaToken.sol";

/// @notice Synthetic, predictable prices for valueless Base Sepolia demo tokens only.
/// @dev These are NOT market observations. A timestamp-driven cycle demonstrates gains/losses
///      continuously without a publisher: baseline -> +25% -> baseline -> -25% -> baseline.
///      All config is constructor-only; storage (rather than Solidity immutables) lets consumers
///      authenticate this exact runtime code. Safe/unsafe prices coincide because bounds are
///      mathematical, not because this provides a circuit breaker for any real market.
contract AlphaCryptoScenarioOracle is IPriceOracle {
    error DemoChainOnly();
    error InvalidConfiguration();
    error UnsupportedToken(address token);
    error BeforeDemoEpoch();

    uint256 public constant DEMO_CHAIN_ID = 84532;
    uint256 public constant QUOTE_PRICE = 1e8;
    uint256 public constant MAX_BASE_PRICE = 1_000_000e8;
    address public quoteToken;
    uint64 public epoch;
    uint64 public cycleSeconds;
    address[] public stockTokens;
    mapping(address => uint256) public basePrice;
    mapping(address => uint256) private _tokenScale;

    constructor(address quoteToken_, address[] memory stocks, uint256[] memory basePrices, uint64 cycleSeconds_) {
        _requireDemoChain();
        if (
            stocks.length == 0 || stocks.length > 8 || stocks.length != basePrices.length || cycleSeconds_ < 4 minutes
                || cycleSeconds_ > 1 days || cycleSeconds_ % 4 != 0 || block.timestamp > type(uint64).max
        ) revert InvalidConfiguration();
        _requireDemoToken(quoteToken_, 6);
        quoteToken = quoteToken_;
        epoch = uint64(block.timestamp);
        cycleSeconds = cycleSeconds_;
        basePrice[quoteToken_] = QUOTE_PRICE;
        _tokenScale[quoteToken_] = 1e6;
        for (uint256 i; i < stocks.length; ++i) {
            address token = stocks[i];
            if (basePrice[token] != 0 || basePrices[i] < 1e8 || basePrices[i] > MAX_BASE_PRICE) {
                revert InvalidConfiguration();
            }
            uint8 tokenDecimals = BaseSepoliaAlphaToken(token).decimals();
            if (tokenDecimals != 8 && tokenDecimals != 18) revert InvalidConfiguration();
            _requireDemoToken(token, tokenDecimals);
            basePrice[token] = basePrices[i];
            _tokenScale[token] = 10 ** tokenDecimals;
            stockTokens.push(token);
        }
    }

    function isDemo() external pure returns (bool) {
        return true;
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "YieldShield synthetic Base Sepolia demo prices";
    }

    function stockCount() external view returns (uint256) {
        return stockTokens.length;
    }

    function getPrice(address token) public view returns (uint256) {
        return priceAt(token, block.timestamp);
    }

    function getPriceUnsafe(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function getPriceForFeeAccrual(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function getPriceWithStrictCircuitBreaker(address token) external view returns (uint256) {
        return getPrice(token);
    }

    function priceAt(address token, uint256 timestamp) public view returns (uint256) {
        _requireDemoChain();
        uint256 baseline = basePrice[token];
        if (baseline == 0) revert UnsupportedToken(token);
        if (timestamp < epoch) revert BeforeDemoEpoch();
        if (token == quoteToken) return QUOTE_PRICE;
        uint256 phase = (timestamp - epoch) % cycleSeconds;
        uint256 quarter = cycleSeconds / 4;
        if (phase <= quarter) return baseline + Math.mulDiv(baseline, phase, cycleSeconds);
        if (phase <= quarter * 2) return baseline + Math.mulDiv(baseline, quarter * 2 - phase, cycleSeconds);
        if (phase <= quarter * 3) return baseline - Math.mulDiv(baseline, phase - quarter * 2, cycleSeconds);
        return baseline - Math.mulDiv(baseline, cycleSeconds - phase, cycleSeconds);
    }

    function getValue(address token, uint256 amount) public view returns (uint256) {
        return Math.mulDiv(amount, getPrice(token), _tokenScale[token]);
    }

    function getValueUnsafe(address token, uint256 amount) external view returns (uint256) {
        return getValue(token, amount);
    }

    function getEquivalentAmount(address tokenA, uint256 amountA, address tokenB) public view returns (uint256) {
        // The constructor bounds prices/scales, so these products cannot overflow. Single
        // full-precision division avoids an intermediate value-rounding loss for small amounts.
        uint256 priceA = getPrice(tokenA);
        uint256 priceB = getPrice(tokenB);
        return Math.mulDiv(amountA, priceA * _tokenScale[tokenB], priceB * _tokenScale[tokenA]);
    }

    function getEquivalentAmountUnsafe(address tokenA, uint256 amountA, address tokenB)
        external
        view
        returns (uint256)
    {
        return getEquivalentAmount(tokenA, amountA, tokenB);
    }

    function supportsCircuitBreaker(address token) external view returns (bool) {
        return _supported(token);
    }

    function supportsStrictProtectedPrice(address token) external view returns (bool) {
        return _supported(token);
    }

    function supportsProtectionOpeningEligibility(address token) external view returns (bool) {
        return _supported(token);
    }

    function isProtectionOpeningAllowed(address token) external view returns (bool) {
        return _supported(token);
    }

    /// @dev Timestamp is the evaluation time of a formula, never represented as a market publication.
    function isPriceStale(address token) external view returns (bool isStale, uint64 evaluatedAt) {
        getPrice(token);
        if (block.timestamp > type(uint64).max) revert InvalidConfiguration();
        return (false, uint64(block.timestamp));
    }

    function _supported(address token) private view returns (bool) {
        return block.chainid == DEMO_CHAIN_ID && basePrice[token] != 0;
    }

    function _requireDemoChain() private view {
        if (block.chainid != DEMO_CHAIN_ID) revert DemoChainOnly();
    }

    function _requireDemoToken(address token, uint8 expectedDecimals) private view {
        if (
            (token.codehash != keccak256(type(BaseSepoliaAlphaToken).runtimeCode) && token.codehash != keccak256(type(AlphaCryptoToken).runtimeCode))
                || BaseSepoliaAlphaToken(token).decimals() != expectedDecimals
        ) revert InvalidConfiguration();
    }
}
