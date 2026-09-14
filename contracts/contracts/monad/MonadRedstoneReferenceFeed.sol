// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { IShMonadValuation } from "./MonadReferenceFeed.sol";

interface IMonadRedstoneAggregator {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

/// @notice Immutable RedStone MON/USD push-feed adapter for Monad testnet only.
/// @dev Provider-aggregated rounds do not expose Pyth confidence or EMA values. No such
/// checks are claimed here. Every price path rejects invalid/incomplete/future/stale rounds.
/// shMON uses the lower accounting/withdrawal NAV; TestUSDC remains a valueless test unit.
contract MonadRedstoneReferenceFeed {
    error InvalidConfiguration();
    error UnavailablePrice();
    error UnsupportedToken();
    IMonadRedstoneAggregator public immutable aggregator;
    address public immutable wrappedMon;
    address public immutable shMon;
    address public immutable testUsd;
    uint256 public immutable referenceRate;
    uint256 public constant MAX_AGE = 120;

    constructor(address source, address wmon, address lst, address usd) {
        if (
            block.chainid != 10143 || source.code.length == 0 || wmon.code.length == 0 || lst.code.length == 0
                || usd.code.length == 0 || wmon == lst || wmon == usd || lst == usd
        ) {
            revert InvalidConfiguration();
        }
        aggregator = IMonadRedstoneAggregator(source);
        if (
            aggregator.decimals() != 8
                || keccak256(bytes(aggregator.description())) != keccak256(bytes("RedStone Price Feed for MON"))
        ) revert InvalidConfiguration();
        wrappedMon = wmon;
        shMon = lst;
        testUsd = usd;
        uint256 rate = _rate();
        if (rate == 0) revert InvalidConfiguration();
        referenceRate = rate;
        monPrice();
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external pure returns (string memory) {
        return "RedStone MON/USD push reference; shMON delayed withdrawal NAV; synthetic TestUSDC";
    }

    function _rate() private view returns (uint256) {
        uint256 accounting = IShMonadValuation(shMon).convertToAssets(1e18);
        uint256 withdrawal = IShMonadValuation(shMon).previewUnstake(1e18);
        return accounting < withdrawal ? accounting : withdrawal;
    }

    function redemptionRate() public view returns (uint256 rate) {
        rate = _rate();
        if (rate == 0 || rate > referenceRate * 120 / 100) revert UnavailablePrice();
    }

    function monPrice() public view returns (uint256 price, uint64 publishedAt) {
        if (block.chainid != 10143) revert InvalidConfiguration();
        (uint80 round, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) =
            aggregator.latestRoundData();
        if (
            round == 0 || answeredInRound < round || answer <= 0 || uint256(answer) > type(uint64).max || startedAt == 0
                || startedAt > updatedAt || updatedAt == 0 || updatedAt > block.timestamp
                || block.timestamp - updatedAt > MAX_AGE
        ) revert UnavailablePrice();
        return (uint256(answer), uint64(updatedAt));
    }

    function getPrice(address token) public view returns (uint256) {
        if (block.chainid != 10143) revert InvalidConfiguration();
        if (token == testUsd) return 1e8;
        if (token != wrappedMon && token != shMon) revert UnsupportedToken();
        (uint256 mon,) = monPrice();
        return token == wrappedMon ? mon : Math.mulDiv(mon, redemptionRate(), 1e18);
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

    function supportsCircuitBreaker(address token) external view returns (bool) {
        return _supported(token);
    }

    function supportsStrictProtectedPrice(address token) external view returns (bool) {
        return _supported(token);
    }

    function isPriceStale(address token) external view returns (bool, uint64) {
        if (!_supported(token)) return (true, 0);
        try this.getPrice(token) returns (uint256 value) {
            if (token == testUsd) return (value == 0, 0);
            (, uint64 publishedAt) = monPrice();
            return (value == 0, publishedAt);
        } catch {
            return (true, 0);
        }
    }

    function _supported(address token) private view returns (bool) {
        return block.chainid == 10143 && (token == wrappedMon || token == shMon || token == testUsd);
    }
}
