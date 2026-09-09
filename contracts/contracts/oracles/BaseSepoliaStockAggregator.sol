// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { BaseSepoliaStockRegistry } from "./BaseSepoliaStockRegistry.sol";

/// @notice Chainlink-shaped interface to owner-attested real Base observations for valueless Sepolia tokens.
/// @dev No permissionless refresh or price/timestamp setter. Local alpha sanity bounds are not source Chainlink bounds.
contract BaseSepoliaStockAggregator {
    BaseSepoliaStockRegistry public immutable registry;
    address public immutable testToken;
    address public immutable sourceToken;
    address public immutable sourceFeed;
    bool public immutable isEquity;
    int192 public immutable minAnswer;
    int192 public immutable maxAnswer;
    error InvalidRelayConfiguration();

    constructor(address registry_, address testToken_) {
        if (block.chainid != 84532 || registry_.code.length == 0) revert InvalidRelayConfiguration();
        registry = BaseSepoliaStockRegistry(registry_);
        (address sourceToken_, address sourceFeed_, bool isEquity_) = registry.tokenConfigs(testToken_);
        if (sourceToken_ == address(0) || sourceFeed_ == address(0)) revert InvalidRelayConfiguration();
        testToken = testToken_;
        sourceToken = sourceToken_;
        sourceFeed = sourceFeed_;
        isEquity = isEquity_;
        minAnswer = isEquity_ ? int192(1) : int192(50_000_000);
        maxAnswer = isEquity_ ? int192(1_000_000e8) : int192(150_000_000);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        BaseSepoliaStockRegistry.Observation memory observation = registry.readObservation(testToken);
        if (observation.oraclePaused) revert BaseSepoliaStockRegistry.SourceOraclePaused(testToken);
        return (
            observation.roundId,
            observation.answer,
            observation.startedAt,
            observation.updatedAt,
            observation.answeredInRound
        );
    }

    function decimals() external pure returns (uint8) {
        return 8;
    }

    function description() external view returns (string memory) {
        return
            isEquity ? "Base equity TRV operator relay - Sepolia alpha" : "Base USDC USD operator relay - Sepolia alpha";
    }

    function version() external pure returns (uint256) {
        return 1;
    }
}
