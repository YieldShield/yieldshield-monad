// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC20Metadata } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import { BaseStockTokenLib } from "../libraries/BaseStockTokenLib.sol";

/// @notice Operator-attested Base mainnet observations for valueless Base Sepolia alpha tokens.
/// @dev This is a trusted relay, not a trustless bridge or a Chainlink-operated feed. Deployment is
///      impossible outside chain 84532. Source price timestamps are never replaced with receipt time.
///      Registry/sequencer observations expire independently, including when equity prices are frozen.
contract BaseSepoliaStockRegistry is Ownable {
    uint256 public constant SOURCE_CHAIN_ID = 8453;
    uint256 public constant DESTINATION_CHAIN_ID = 84532;
    uint256 public constant MAX_OBSERVATION_AGE = 10 minutes;
    uint256 public constant MAX_SUBMISSION_LAG = 5 minutes;
    uint256 public constant SEQUENCER_GRACE_PERIOD = 1 hours;
    address public constant SOURCE_ORACLE_REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address public constant SOURCE_SEQUENCER_FEED = 0xBCF85224fc0756B9Fa45aA7892530B47e10b6433;
    address public constant SOURCE_USDC_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;

    struct TokenConfig {
        address sourceToken;
        address sourceFeed;
        bool isEquity;
    }

    struct Observation {
        uint80 roundId;
        int256 answer;
        uint256 startedAt;
        uint256 updatedAt;
        uint80 answeredInRound;
        uint128 multiplier;
        bool oraclePaused;
        int256 sequencerAnswer;
        uint256 sequencerStartedAt;
        uint256 sourceBlockNumber;
        uint256 sourceBlockTimestamp;
    }

    address public operator;
    bool public emergencyPaused;
    mapping(address testToken => TokenConfig config) public tokenConfigs;
    mapping(address sourceToken => address testToken) public testTokensBySource;
    mapping(address testToken => Observation observation) private _observations;
    mapping(address testToken => uint256 timestamp) public receivedAt;
    uint256 private _sequencerSourceBlock;
    uint256 private _sequencerSourceTimestamp;
    int256 private _sequencerAnswer;
    uint256 private _sequencerStartedAt;
    uint256 private _sequencerReceivedAt;

    error TestnetOnly(uint256 chainId);
    error InvalidOperator(address operator);
    error UnauthorizedOperator(address caller);
    error InvalidTokenConfiguration(address token);
    error TokenAlreadyRegistered(address token);
    error TokenNotRegistered(address token);
    error InvalidObservation(address token);
    error NonMonotonicObservation(address token);
    error ObservationUnavailable(address token);
    error SourceSequencerUnavailable();
    error RelayEmergencyPaused();
    error SourceOraclePaused(address token);

    event OperatorSet(address indexed operator);
    event TokenRegistered(address indexed testToken, address indexed sourceToken, address sourceFeed, bool isEquity);
    event ObservationSubmitted(
        address indexed testToken,
        uint80 indexed roundId,
        uint256 updatedAt,
        uint256 sourceBlockNumber,
        uint256 sourceBlockTimestamp,
        bool oraclePaused
    );
    event EmergencyPauseSet(bool paused);

    constructor(address initialOwner, address initialOperator) Ownable(initialOwner) {
        if (block.chainid != DESTINATION_CHAIN_ID) revert TestnetOnly(block.chainid);
        _setOperator(initialOperator);
    }

    function setOperator(address newOperator) external onlyOwner {
        _setOperator(newOperator);
    }

    function _setOperator(address newOperator) private {
        if (newOperator == address(0)) revert InvalidOperator(newOperator);
        operator = newOperator;
        emit OperatorSet(newOperator);
    }

    /// @notice Owner and operator may stop the relay; only the owner can resume it.
    function emergencyPause() external {
        if (msg.sender != owner() && msg.sender != operator) revert UnauthorizedOperator(msg.sender);
        emergencyPaused = true;
        emit EmergencyPauseSet(true);
    }

    function clearEmergencyPause() external onlyOwner {
        emergencyPaused = false;
        emit EmergencyPauseSet(false);
    }

    /// @notice Register each reviewed source pair exactly once; its source identity can never change.
    function registerToken(address testToken, address sourceToken, address sourceFeed) external onlyOwner {
        if (tokenConfigs[testToken].sourceToken != address(0) || testTokensBySource[sourceToken] != address(0)) {
            revert TokenAlreadyRegistered(testToken);
        }
        bool isEquity = BaseStockTokenLib.sourceFeed(sourceToken) != address(0);
        bool isUsdc = sourceToken == BaseStockTokenLib.BASE_USDC && sourceFeed == SOURCE_USDC_FEED;
        if (
            testToken == address(0) || testToken.code.length == 0
                || (isEquity ? sourceFeed != BaseStockTokenLib.sourceFeed(sourceToken) : !isUsdc)
        ) {
            revert InvalidTokenConfiguration(testToken);
        }
        try IERC20Metadata(testToken).decimals() returns (uint8 tokenDecimals) {
            if (tokenDecimals != (isEquity ? 8 : 6)) revert InvalidTokenConfiguration(testToken);
        } catch {
            revert InvalidTokenConfiguration(testToken);
        }
        tokenConfigs[testToken] = TokenConfig(sourceToken, sourceFeed, isEquity);
        testTokensBySource[sourceToken] = testToken;
        emit TokenRegistered(testToken, sourceToken, sourceFeed, isEquity);
    }

    /// @notice Submit data read at one Base-mainnet block. Operator attestation is an explicit alpha trust assumption.
    function submitObservation(address testToken, Observation calldata observation) external {
        if (msg.sender != operator) revert UnauthorizedOperator(msg.sender);
        TokenConfig memory config = tokenConfigs[testToken];
        if (config.sourceToken == address(0)) revert TokenNotRegistered(testToken);
        if (
            observation.roundId == 0 || observation.answer <= 0 || observation.answeredInRound < observation.roundId
                || observation.startedAt == 0 || observation.updatedAt < observation.startedAt
                || observation.updatedAt > observation.sourceBlockTimestamp || observation.multiplier == 0
                || (observation.sequencerAnswer != 0 && observation.sequencerAnswer != 1)
                || observation.sequencerStartedAt == 0
                || observation.sequencerStartedAt > observation.sourceBlockTimestamp
                || observation.sourceBlockNumber == 0 || observation.sourceBlockNumber > type(uint80).max
                || observation.sourceBlockTimestamp == 0 || observation.sourceBlockTimestamp > block.timestamp
                || block.timestamp - observation.sourceBlockTimestamp > MAX_SUBMISSION_LAG
                || (!config.isEquity && (observation.multiplier != 1e18 || observation.oraclePaused))
        ) revert InvalidObservation(testToken);

        Observation memory previous = _observations[testToken];
        if (receivedAt[testToken] != 0) {
            if (
                observation.roundId < previous.roundId || observation.updatedAt < previous.updatedAt
                    || observation.sourceBlockNumber < previous.sourceBlockNumber
                    || observation.sourceBlockTimestamp < previous.sourceBlockTimestamp
                    || observation.sequencerStartedAt < previous.sequencerStartedAt
            ) {
                revert NonMonotonicObservation(testToken);
            }
            // A duplicate source round cannot be re-priced or re-timestamped by the relay.
            if (
                observation.roundId == previous.roundId
                    && (observation.answer != previous.answer
                        || observation.startedAt != previous.startedAt
                        || observation.updatedAt != previous.updatedAt
                        || observation.answeredInRound != previous.answeredInRound)
            ) revert NonMonotonicObservation(testToken);
            if (
                observation.sourceBlockNumber == previous.sourceBlockNumber
                    && keccak256(abi.encode(observation)) != keccak256(abi.encode(previous))
            ) {
                revert NonMonotonicObservation(testToken);
            }
        }
        // A report at the same global source block must agree on the source sequencer state.
        if (
            observation.sourceBlockNumber == _sequencerSourceBlock
                && (observation.sourceBlockTimestamp != _sequencerSourceTimestamp
                    || observation.sequencerAnswer != _sequencerAnswer
                    || observation.sequencerStartedAt != _sequencerStartedAt)
        ) revert NonMonotonicObservation(testToken);

        _observations[testToken] = observation;
        receivedAt[testToken] = block.timestamp;
        if (observation.sourceBlockNumber >= _sequencerSourceBlock) {
            if (
                observation.sourceBlockTimestamp < _sequencerSourceTimestamp
                    || observation.sequencerStartedAt < _sequencerStartedAt
            ) revert NonMonotonicObservation(testToken);
            _sequencerSourceBlock = observation.sourceBlockNumber;
            _sequencerSourceTimestamp = observation.sourceBlockTimestamp;
            _sequencerAnswer = observation.sequencerAnswer;
            _sequencerStartedAt = observation.sequencerStartedAt;
            _sequencerReceivedAt = block.timestamp;
        }
        emit ObservationSubmitted(
            testToken,
            observation.roundId,
            observation.updatedAt,
            observation.sourceBlockNumber,
            observation.sourceBlockTimestamp,
            observation.oraclePaused
        );
    }

    /// @notice Unguarded provenance/status for monitoring. Never use this as an execution price.
    function lastObservation(address testToken)
        external
        view
        returns (Observation memory observation, uint256 observedAt)
    {
        return (_observations[testToken], receivedAt[testToken]);
    }

    function readObservation(address testToken) public view returns (Observation memory observation) {
        observation = _observations[testToken];
        _requireFreshObservation(testToken, receivedAt[testToken], observation.sourceBlockTimestamp);
        _requireFreshObservation(address(0), _sequencerReceivedAt, _sequencerSourceTimestamp);
        // A newer report for another asset may already have observed a source sequencer outage.
        if (
            _sequencerAnswer != 0 || _sequencerStartedAt == 0 || _sequencerStartedAt > block.timestamp
                || block.timestamp - _sequencerStartedAt <= SEQUENCER_GRACE_PERIOD
        ) {
            revert SourceSequencerUnavailable();
        }
        if (
            observation.sequencerAnswer != 0 || observation.sequencerStartedAt == 0
                || observation.sequencerStartedAt > block.timestamp
                || block.timestamp - observation.sequencerStartedAt <= SEQUENCER_GRACE_PERIOD
        ) {
            revert SourceSequencerUnavailable();
        }
    }

    /// @notice Exact Coinbase oracle-registry ABI, mapped to the registered alpha token.
    function getOracleParams(address testToken) external view returns (uint128 multiplier, bool paused) {
        Observation memory observation = readObservation(testToken);
        return (observation.multiplier, observation.oraclePaused);
    }

    function _requireFreshObservation(address token, uint256 receipt, uint256 sourceTimestamp) private view {
        if (emergencyPaused) revert RelayEmergencyPaused();
        if (
            receipt == 0 || receipt > block.timestamp || sourceTimestamp == 0 || sourceTimestamp > block.timestamp
                || block.timestamp - receipt > MAX_OBSERVATION_AGE
                || block.timestamp - sourceTimestamp > MAX_OBSERVATION_AGE
        ) {
            revert ObservationUnavailable(token);
        }
    }

    /// @notice Source Base-mainnet sequencer adapter. This is NOT independent Base-Sepolia uptime monitoring.
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        _requireFreshObservation(address(0), _sequencerReceivedAt, _sequencerSourceTimestamp);
        roundId = uint80(_sequencerSourceBlock);
        return (roundId, _sequencerAnswer, _sequencerStartedAt, _sequencerSourceTimestamp, roundId);
    }

    function decimals() external pure returns (uint8) {
        return 0;
    }

    function description() external pure returns (string memory) {
        return "Base mainnet sequencer relayed to Base Sepolia alpha";
    }

    function version() external pure returns (uint256) {
        return 1;
    }
}
