// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IOracleFeed } from "../interfaces/IOracleFeed.sol";
import { ICorporateActionPauseGuard } from "../interfaces/ICorporateActionPauseGuard.sol";
import { IClosedSessionExitPrice } from "../interfaces/IClosedSessionExitPrice.sol";
import { IProtectionOpeningEligibility } from "../interfaces/IProtectionOpeningEligibility.sol";
import { IRobinhoodStockOracleFeed } from "../interfaces/IRobinhoodStockOracleFeed.sol";
import { BaseStockTokenLib } from "../libraries/BaseStockTokenLib.sol";

interface ICoinbaseUSMarketSessionGate {
    function isMarketOpen() external view returns (bool);
    function emergencyPaused() external view returns (bool);
}

/// @notice Published Chainlink Coinbase external-adapter ABI; multiplier is already included in the TRV price.
interface ICoinbaseOracleRegistry {
    function getOracleParams(address token) external view returns (uint128 multiplier, bool paused);
}

/// @title ICoinbaseChainlinkOracleFeedOptional
/// @notice Optional ChainlinkOracleFeed functions mirrored by this wrapper. CompositeOracle
///         probes feeds for these selectors (`getPriceUnsafe`, `supportsCircuitBreaker`,
///         `supportsStrictProtectedPrice`, `isPriceStale`), so the wrapper must delegate each
///         of them to avoid silently downgrading the inner feed's advertised capabilities.
interface ICoinbaseChainlinkOracleFeedOptional {
    function getPriceUnsafe(address token) external view returns (uint256);
    function supportsCircuitBreaker(address token) external view returns (bool);
    function supportsStrictProtectedPrice(address token) external view returns (bool);
    function isPriceStale(address token) external view returns (bool isStale, uint256 updatedAt);
    function protectionOpeningMaxPriceAgeForToken(address token) external view returns (uint256 maxAge);
    function getPriceForClosedSessionExit(address token) external view returns (uint256 price);
    function supportsUserUpdates(address token) external view returns (bool);
    function refreshPrice(address token) external;
}

/// @title CoinbaseStockOracleFeed
/// @notice Guard Coinbase B20 prices with the issuer's oracle-registry pause and explicit equity sessions.
/// @dev All price paths fail closed on an unavailable/malformed registry. Token transfer pauses are a
///      different signal. Prices are Chainlink Total Return Values: NEVER apply the multiplier again.
///      Retains the legacy stock capability interface to preserve factory/CompositeOracle ABI compatibility.
contract CoinbaseStockOracleFeed is
    IOracleFeed,
    ICorporateActionPauseGuard,
    IProtectionOpeningEligibility,
    IClosedSessionExitPrice,
    IRobinhoodStockOracleFeed,
    Ownable
{
    /// @notice Maximum reviewed freshness window for opening Coinbase equity protection
    /// @dev Individual tokens must configure an explicit non-zero value on the inner feed and
    ///      may use a tighter bound. Ordinary and closed-session price reads are unchanged.
    uint256 public constant MAX_PROTECTION_OPENING_PRICE_AGE = 1 hours;

    /// @notice The wrapped ChainlinkOracleFeed that performs the actual price reads
    address public immutable innerFeed;

    /// @notice Fail-closed calendar used only when opening new protection positions
    address public immutable marketSessionGate;

    address public immutable oracleRegistry;
    mapping(address token => bool configured) private _configuredTokens;
    event TokenConfigured(address indexed token, bool configured);
    error InvalidOracleRegistry(address registry);

    /// @notice Custom error for zero inner feed address
    error InvalidInnerFeed(address feed);

    /// @notice Custom error when the inner feed does not report 8 decimals
    error InvalidInnerFeedDecimals(address feed, uint8 feedDecimals);

    /// @notice Custom error for an invalid market-session gate
    error InvalidMarketSessionGate(address gate);

    /// @notice Custom error when the stock token's oracle is paused for a corporate action
    error StockTokenOraclePaused(address token);

    /// @notice Custom error when no pause probe has been configured for a token
    error StockTokenPauseProbeNotConfigured(address token);

    /// @notice Custom error when the configured pause probe reverts or returns malformed data
    error StockTokenPauseProbeFailed(address token);

    /// @notice Custom error for a zero token address in pause-probe configuration
    error InvalidStockToken(address token);

    /// @notice Custom error when the extended exit-price path is requested during an open session
    error MarketSessionOpen(address token);

    /// @notice Custom error when emergency pause must not be treated as a scheduled market closure
    error MarketSessionEmergencyPaused(address token);

    /// @notice Custom error when the market-session gate cannot be read
    error MarketSessionStatusUnavailable(address gate);

    /// @notice Constructor
    /// @param _innerFeed The ChainlinkOracleFeed address to wrap
    /// @param _marketSessionGate Fail-closed US-equity session calendar
    constructor(address _innerFeed, address _marketSessionGate, address _oracleRegistry) Ownable(msg.sender) {
        if (_innerFeed == address(0)) revert InvalidInnerFeed(_innerFeed);
        if (_marketSessionGate == address(0) || _marketSessionGate.code.length == 0) {
            revert InvalidMarketSessionGate(_marketSessionGate);
        }
        uint8 innerDecimals = IOracleFeed(_innerFeed).decimals();
        if (innerDecimals != 8) revert InvalidInnerFeedDecimals(_innerFeed, innerDecimals);
        if (_oracleRegistry == address(0) || _oracleRegistry.code.length == 0) {
            revert InvalidOracleRegistry(_oracleRegistry);
        }
        if (block.chainid == 8453 && _oracleRegistry != BaseStockTokenLib.COINBASE_ORACLE_REGISTRY) {
            revert InvalidOracleRegistry(_oracleRegistry);
        }
        oracleRegistry = _oracleRegistry;
        innerFeed = _innerFeed;
        marketSessionGate = _marketSessionGate;
    }

    /// @notice Configure a reviewed stock token; mainnet is restricted to the official Coinbase allowlist.
    function setTokenConfigured(address token, bool configured) external onlyOwner {
        if (token == address(0) || (block.chainid == 8453 && !BaseStockTokenLib.isCanonicalStockToken(token))) {
            revert InvalidStockToken(token);
        }
        _configuredTokens[token] = configured;
        emit TokenConfigured(token, configured);
    }

    function isTokenConfigured(address token) public view returns (bool configured) {
        return _configuredTokens[token];
    }

    function _tryReadPauseState(address token) internal view returns (bool configured, bool readable, bool paused) {
        if (!_configuredTokens[token]) return (false, false, false);
        (bool success, bytes memory data) =
            oracleRegistry.staticcall(abi.encodeCall(ICoinbaseOracleRegistry.getOracleParams, (token)));
        if (!success || data.length != 64) return (true, false, false);
        uint256 encodedMultiplier;
        uint256 encodedBool;
        assembly ("memory-safe") {
            encodedMultiplier := mload(add(data, 32))
            encodedBool := mload(add(data, 64))
        }
        if (encodedMultiplier == 0 || encodedMultiplier > type(uint128).max || encodedBool > 1) {
            return (true, false, false);
        }
        return (true, true, encodedBool == 1);
    }

    /// @dev Reverts unless the token's explicitly configured pause flag is readable and false.
    function _requireNotPaused(address token) internal view {
        (bool configured, bool readable, bool paused) = _tryReadPauseState(token);
        if (!configured) revert StockTokenPauseProbeNotConfigured(token);
        if (!readable) revert StockTokenPauseProbeFailed(token);
        if (paused) revert StockTokenOraclePaused(token);
    }

    /// @inheritdoc IOracleFeed
    /// @dev Reverts while the token's oracle is paused for a corporate action; otherwise
    ///      delegates to the inner ChainlinkOracleFeed's protected price path.
    function getPrice(address token) external view override returns (uint256) {
        _requireNotPaused(token);
        return IOracleFeed(innerFeed).getPrice(token);
    }

    /// @notice Unprotected price getter mirroring the inner feed's `getPriceUnsafe` alias.
    /// @dev The corporate-action pause guard still applies — a paused stock token has no
    ///      readable price on any path. Otherwise delegates to the inner feed's `getPriceUnsafe`.
    /// @param token The token address
    /// @return price The price in USD with 8 decimals
    function getPriceUnsafe(address token) external view returns (uint256 price) {
        _requireNotPaused(token);
        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).getPriceUnsafe(token);
    }

    /// @notice Whether the inner feed exposes a protected price path for `token`.
    /// @param token The token address
    /// @return supported True if the inner feed supports circuit-breaker pricing for the token
    function supportsCircuitBreaker(address token) external view returns (bool supported) {
        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).supportsCircuitBreaker(token);
    }

    /// @notice Whether the inner token feed satisfies the stricter protected-collateral policy.
    /// @param token The token address
    /// @return supported True if the inner feed supports strict protected pricing for the token
    function supportsStrictProtectedPrice(address token) external view returns (bool supported) {
        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).supportsStrictProtectedPrice(token);
    }

    /// @inheritdoc ICorporateActionPauseGuard
    function supportsCorporateActionPauseGuard(address token) external view returns (bool supported) {
        return isTokenConfigured(token);
    }

    /// @inheritdoc IClosedSessionExitPrice
    function supportsClosedSessionExitPrice(address token) external view returns (bool supported) {
        return isTokenConfigured(token);
    }

    /// @inheritdoc IClosedSessionExitPrice
    /// @dev The extended Chainlink freshness window is reachable only while the configured
    ///      calendar reports the market closed, the emergency guardian has not paused sessions,
    ///      and the token's pause probe is readable and false.
    function getPriceForClosedSessionExit(address token) external view returns (uint256 price) {
        _requireNotPaused(token);

        bool emergencyPauseActive;
        try ICoinbaseUSMarketSessionGate(marketSessionGate).emergencyPaused() returns (bool paused) {
            emergencyPauseActive = paused;
        } catch {
            revert MarketSessionStatusUnavailable(marketSessionGate);
        }
        if (emergencyPauseActive) revert MarketSessionEmergencyPaused(token);

        bool marketOpen;
        try ICoinbaseUSMarketSessionGate(marketSessionGate).isMarketOpen() returns (bool open) {
            marketOpen = open;
        } catch {
            revert MarketSessionStatusUnavailable(marketSessionGate);
        }
        if (marketOpen) revert MarketSessionOpen(token);

        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).getPriceForClosedSessionExit(token);
    }

    /// @notice Whether the underlying Chainlink-compatible feed supports user refreshes.
    function supportsUserUpdates(address token) external view returns (bool supported) {
        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).supportsUserUpdates(token);
    }

    /// @notice Refresh a user-updatable underlying feed while preserving the stock pause guard.
    function refreshPrice(address token) external {
        _requireNotPaused(token);
        ICoinbaseChainlinkOracleFeedOptional(innerFeed).refreshPrice(token);
    }

    /// @notice Check if a price is stale for a given token
    /// @dev A paused token (or one with an unconfigured/unreadable probe) is reported as
    ///      stale with a zero timestamp so staleness-aware consumers fail closed during
    ///      corporate actions; otherwise delegates to the inner feed's `isPriceStale`.
    /// @param token The token address
    /// @return isStale True if the price is stale
    /// @return updatedAt The timestamp of the last update
    function isPriceStale(address token) external view returns (bool isStale, uint256 updatedAt) {
        (bool configured, bool readable, bool paused) = _tryReadPauseState(token);
        if (!configured || !readable || paused) return (true, 0);
        return ICoinbaseChainlinkOracleFeedOptional(innerFeed).isPriceStale(token);
    }

    /// @inheritdoc IProtectionOpeningEligibility
    function supportsProtectionOpeningEligibility(address token) external view returns (bool supported) {
        return isTokenConfigured(token);
    }

    /// @notice Whether a token has an explicit reviewed opening-specific freshness policy
    /// @dev Fails closed for incompatible inner feeds, missing policies, and values above the
    ///      immutable Coinbase equity ceiling.
    function isProtectionOpeningFreshnessConfigured(address token) public view returns (bool configured) {
        if (!isTokenConfigured(token)) return false;
        try ICoinbaseChainlinkOracleFeedOptional(innerFeed).protectionOpeningMaxPriceAgeForToken(token) returns (
            uint256 maxAge
        ) {
            return maxAge != 0 && maxAge <= MAX_PROTECTION_OPENING_PRICE_AGE;
        } catch {
            return false;
        }
    }

    /// @inheritdoc IProtectionOpeningEligibility
    /// @dev This does not gate price reads or exits. Missing token pause status, a failed market
    ///      status call, a closed calendar day, or an emergency pause all fail closed for openings.
    function isProtectionOpeningAllowed(address token) external view returns (bool allowed) {
        (bool configured, bool readable, bool paused) = _tryReadPauseState(token);
        if (!configured || !readable || paused) return false;

        try ICoinbaseUSMarketSessionGate(marketSessionGate).isMarketOpen() returns (bool marketOpen) {
            if (!marketOpen) return false;
        } catch {
            return false;
        }

        uint256 openingMaxAge;
        try ICoinbaseChainlinkOracleFeedOptional(innerFeed).protectionOpeningMaxPriceAgeForToken(token) returns (
            uint256 configuredMaxAge
        ) {
            if (configuredMaxAge == 0 || configuredMaxAge > MAX_PROTECTION_OPENING_PRICE_AGE) return false;
            openingMaxAge = configuredMaxAge;
        } catch {
            return false;
        }

        try ICoinbaseChainlinkOracleFeedOptional(innerFeed).isPriceStale(token) returns (
            bool isStale, uint256 updatedAt
        ) {
            if (isStale || updatedAt == 0 || updatedAt > block.timestamp) return false;
            return block.timestamp - updatedAt <= openingMaxAge;
        } catch {
            return false;
        }
    }

    /// @inheritdoc IOracleFeed
    function decimals() external pure override returns (uint8) {
        return 8;
    }

    /// @inheritdoc IOracleFeed
    function description() external pure override returns (string memory) {
        return "Coinbase Stock Chainlink Oracle Feed";
    }
}
