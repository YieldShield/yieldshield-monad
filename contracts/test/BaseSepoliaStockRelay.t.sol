// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { BaseSepoliaStockRegistry } from "../contracts/oracles/BaseSepoliaStockRegistry.sol";
import { BaseSepoliaStockAggregator } from "../contracts/oracles/BaseSepoliaStockAggregator.sol";
import { ChainlinkOracleFeed } from "../contracts/oracles/ChainlinkOracleFeed.sol";
import { CoinbaseStockOracleFeed } from "../contracts/oracles/CoinbaseStockOracleFeed.sol";
import { USMarketSessionGate } from "../contracts/oracles/USMarketSessionGate.sol";

contract BaseRelayTestToken is ERC20 {
    uint8 private immutable _decimals;

    constructor(uint8 decimals_) ERC20("Valueless test token", "TEST") {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}

contract BaseSepoliaStockRelayTest is Test {
    address internal constant AAPL = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address internal constant AAPL_FEED = 0x787f13dEa48Db0897CbCDD985de77809D837F988;
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address internal constant USDC_FEED = 0x7e860098F58bBFC8648a4311b374B1D669a2bc6B;
    BaseSepoliaStockRegistry private registry;
    BaseSepoliaStockAggregator private aggregator;
    ChainlinkOracleFeed private chainlink;
    CoinbaseStockOracleFeed private wrapper;
    USMarketSessionGate private gate;
    address private stock;
    address private usdc;
    BaseSepoliaStockRegistry.Observation private observation;

    function setUp() public {
        vm.chainId(84532);
        vm.warp(20_000 days + 12 hours);
        stock = address(new BaseRelayTestToken(8));
        usdc = address(new BaseRelayTestToken(6));
        registry = new BaseSepoliaStockRegistry(address(this), address(this));
        registry.registerToken(stock, AAPL, AAPL_FEED);
        registry.registerToken(usdc, USDC, USDC_FEED);
        observation = BaseSepoliaStockRegistry.Observation({
            roundId: 100,
            answer: 200e8,
            startedAt: block.timestamp - 60,
            updatedAt: block.timestamp - 60,
            answeredInRound: 100,
            multiplier: 1e18,
            oraclePaused: false,
            sequencerAnswer: 0,
            sequencerStartedAt: block.timestamp - 2 hours,
            sourceBlockNumber: 1000,
            sourceBlockTimestamp: block.timestamp
        });
        registry.submitObservation(stock, observation);
        aggregator = new BaseSepoliaStockAggregator(address(registry), stock);
        chainlink = new ChainlinkOracleFeed(1 days);
        chainlink.setSequencerUptimeFeed(address(registry));
        chainlink.setTokenFeed(stock, address(aggregator));
        chainlink.setProtectionOpeningMaxPriceAgeForToken(stock, 1 hours);
        gate = new USMarketSessionGate(address(this), address(0xBEEF));
        gate.setDailySession(uint64(block.timestamp / 1 days), 0, uint32(1 days));
        wrapper = new CoinbaseStockOracleFeed(address(chainlink), address(gate), address(registry));
        wrapper.setTokenConfigured(stock, true);
    }

    function test_relayAndAggregatorCannotDeployOnMainnet() public {
        vm.chainId(8453);
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.TestnetOnly.selector, uint256(8453)));
        new BaseSepoliaStockRegistry(address(this), address(this));
        vm.expectRevert(BaseSepoliaStockAggregator.InvalidRelayConfiguration.selector);
        new BaseSepoliaStockAggregator(address(registry), stock);
    }

    function test_sourceMetadataIsVerifiedAndPermanent() public {
        assertEq(aggregator.sourceToken(), AAPL);
        assertEq(aggregator.sourceFeed(), AAPL_FEED);
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.TokenAlreadyRegistered.selector, stock));
        registry.registerToken(stock, USDC, USDC_FEED);
        address unregistered = address(new BaseRelayTestToken(8));
        vm.expectRevert(
            abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidTokenConfiguration.selector, unregistered)
        );
        registry.registerToken(unregistered, address(0x999), AAPL_FEED);
    }

    function test_wrongFeedAndWrongDecimalsCannotBeRegistered() public {
        address nvda = 0xb20000000000000000000078ee7ce2fE4908108C;
        address nvdaFeed = 0x04689a41629776563E6822F76f2e57D148d28513;
        address token8 = address(new BaseRelayTestToken(8));
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidTokenConfiguration.selector, token8));
        registry.registerToken(token8, nvda, AAPL_FEED);
        address token18 = address(new BaseRelayTestToken(18));
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidTokenConfiguration.selector, token18));
        registry.registerToken(token18, nvda, nvdaFeed);
    }

    function test_sourceRoundAndTimestampArePreservedExactly() public view {
        (uint80 round, int256 answer, uint256 started, uint256 updated, uint80 answered) = aggregator.latestRoundData();
        assertEq(round, observation.roundId);
        assertEq(answer, observation.answer);
        assertEq(started, observation.startedAt);
        assertEq(updated, observation.updatedAt);
        assertEq(answered, observation.answeredInRound);
        assertEq(wrapper.getPrice(stock), 200e8);
    }

    function test_noPermissionlessObservationOrTimestampRefresh() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.UnauthorizedOperator.selector, address(0xBAD)));
        registry.submitObservation(stock, observation);
        assertFalse(chainlink.supportsUserUpdates(stock));
        vm.expectRevert();
        wrapper.refreshPrice(stock);
    }

    function test_sameRoundCannotChangePriceOrTimestamp() public {
        _advanceObservationBlock();
        observation.answer += 1;
        _expectNonMonotonic();
        observation.answer -= 1;
        observation.updatedAt += 1;
        _expectNonMonotonic();
    }

    function test_sourceRoundsAndBlocksCannotRegress() public {
        observation.roundId -= 1;
        _expectNonMonotonic();
        observation.roundId += 1;
        observation.sourceBlockNumber -= 1;
        _expectNonMonotonic();
    }

    function test_pauseOnlyUpdatePreservesPriceFreshness() public {
        uint256 originalTimestamp = observation.updatedAt;
        _advanceObservationBlock();
        observation.oraclePaused = true;
        registry.submitObservation(stock, observation);
        (, bool paused) = registry.getOracleParams(stock);
        assertTrue(paused);
        (BaseSepoliaStockRegistry.Observation memory stored,) = registry.lastObservation(stock);
        assertEq(stored.updatedAt, originalTimestamp);
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenOraclePaused.selector, stock));
        wrapper.getPrice(stock);
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.SourceOraclePaused.selector, stock));
        aggregator.latestRoundData();
    }

    function test_registryStateExpiresEvenIfSourcePriceWithinOrdinaryWindow() public {
        vm.warp(block.timestamp + 10 minutes + 1);
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.ObservationUnavailable.selector, stock));
        registry.getOracleParams(stock);
        assertFalse(wrapper.isProtectionOpeningAllowed(stock));
        vm.expectRevert();
        wrapper.getPrice(stock);
    }

    function test_replayingSameSourceBlockCannotRenewSourceStateForever() public {
        vm.warp(block.timestamp + 4 minutes);
        registry.submitObservation(stock, observation);
        vm.warp(block.timestamp + 6 minutes + 1);
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.ObservationUnavailable.selector, stock));
        registry.readObservation(stock);
    }

    function test_freshPauseObservationsNeverMakeOldPriceFresh() public {
        _advanceObservationBlock();
        observation.roundId += 1;
        observation.answeredInRound = observation.roundId;
        observation.startedAt = block.timestamp;
        observation.updatedAt = block.timestamp;
        registry.submitObservation(stock, observation);
        vm.warp(block.timestamp + 1 hours + 1);
        observation.sourceBlockNumber += 100;
        observation.sourceBlockTimestamp = block.timestamp;
        registry.submitObservation(stock, observation);
        assertEq(wrapper.getPrice(stock), 200e8);
        assertFalse(wrapper.isProtectionOpeningAllowed(stock));
        assertEq(_latestUpdatedAt(), observation.updatedAt);
    }

    function test_freshObservationOfWeekendCloseRetainsClosedExitOnlyPolicy() public {
        vm.warp(block.timestamp + 2 days);
        observation.sourceBlockNumber += 1000;
        observation.sourceBlockTimestamp = block.timestamp;
        registry.submitObservation(stock, observation);
        vm.expectRevert();
        wrapper.getPrice(stock);
        assertFalse(wrapper.isProtectionOpeningAllowed(stock));
        assertEq(wrapper.getPriceForClosedSessionExit(stock), 200e8);
        assertEq(_latestUpdatedAt(), observation.updatedAt);
    }

    function test_futureAndDelayedSourceObservationsRejected() public {
        observation.sourceBlockTimestamp = block.timestamp + 1;
        _expectInvalid();
        observation.sourceBlockTimestamp = block.timestamp - 5 minutes - 1;
        observation.startedAt = observation.sourceBlockTimestamp;
        observation.updatedAt = observation.sourceBlockTimestamp;
        _expectInvalid();
    }

    function test_futurePriceAndIncompleteRoundsRejected() public {
        observation.updatedAt = block.timestamp + 1;
        _expectInvalid();
        observation.updatedAt = observation.startedAt;
        observation.answeredInRound = observation.roundId - 1;
        _expectInvalid();
    }

    function test_zeroMultiplierAndUnknownSequencerStatusRejected() public {
        observation.multiplier = 0;
        _expectInvalid();
        observation.multiplier = 1e18;
        observation.sequencerAnswer = 2;
        _expectInvalid();
    }

    function test_sourceSequencerOutageAndRecoveryGraceBlockPrices() public {
        _advanceObservationBlock();
        observation.sequencerAnswer = 1;
        observation.sequencerStartedAt = block.timestamp;
        registry.submitObservation(stock, observation);
        vm.expectRevert(BaseSepoliaStockRegistry.SourceSequencerUnavailable.selector);
        aggregator.latestRoundData();
        vm.expectRevert(ChainlinkOracleFeed.SequencerDown.selector);
        chainlink.getPrice(stock);
        _advanceObservationBlock();
        observation.sequencerAnswer = 0;
        observation.sequencerStartedAt = block.timestamp;
        registry.submitObservation(stock, observation);
        vm.expectRevert(BaseSepoliaStockRegistry.SourceSequencerUnavailable.selector);
        aggregator.latestRoundData();
    }

    function test_oneFreshTokenCannotMaskAnotherTokensExpiredObservation() public {
        vm.warp(block.timestamp + 10 minutes + 1);
        BaseSepoliaStockRegistry.Observation memory usdcObservation = observation;
        usdcObservation.answer = 1e8;
        usdcObservation.sourceBlockNumber += 100;
        usdcObservation.sourceBlockTimestamp = block.timestamp;
        usdcObservation.startedAt = block.timestamp;
        usdcObservation.updatedAt = block.timestamp;
        registry.submitObservation(usdc, usdcObservation);
        registry.latestRoundData();
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.ObservationUnavailable.selector, stock));
        registry.readObservation(stock);
    }

    function test_newerGlobalSourceOutageBlocksDirectReadOfPreviouslyHealthyToken() public {
        BaseSepoliaStockRegistry.Observation memory usdcObservation = observation;
        vm.warp(block.timestamp + 1);
        usdcObservation.answer = 1e8;
        usdcObservation.sourceBlockNumber += 1;
        usdcObservation.sourceBlockTimestamp = block.timestamp;
        usdcObservation.sequencerAnswer = 1;
        usdcObservation.sequencerStartedAt = block.timestamp;
        registry.submitObservation(usdc, usdcObservation);
        vm.expectRevert(BaseSepoliaStockRegistry.SourceSequencerUnavailable.selector);
        registry.getOracleParams(stock);
    }

    function test_sourceSequencerTimestampCannotRegressWithinTokenOrAcrossAssets() public {
        _advanceObservationBlock();
        observation.sequencerStartedAt -= 1;
        _expectNonMonotonic();
        observation.answer = 1e8;
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.NonMonotonicObservation.selector, usdc));
        registry.submitObservation(usdc, observation);
    }

    function test_usdcIsExplicitNonEquityWithLocalSanityBounds() public {
        BaseSepoliaStockRegistry.Observation memory usdcObservation = observation;
        usdcObservation.answer = 1e8;
        registry.submitObservation(usdc, usdcObservation);
        BaseSepoliaStockAggregator usdcAggregator = new BaseSepoliaStockAggregator(address(registry), usdc);
        assertFalse(usdcAggregator.isEquity());
        chainlink.setTokenFeed(usdc, address(usdcAggregator));
        assertTrue(chainlink.supportsStrictProtectedPrice(usdc));
        assertEq(chainlink.getPrice(usdc), 1e8);
        vm.warp(block.timestamp + 1);
        usdcObservation.sourceBlockNumber += 1;
        usdcObservation.sourceBlockTimestamp = block.timestamp;
        usdcObservation.roundId += 1;
        usdcObservation.answeredInRound = usdcObservation.roundId;
        usdcObservation.answer = 50_000_000;
        registry.submitObservation(usdc, usdcObservation);
        vm.expectRevert();
        chainlink.getPrice(usdc);
    }

    function test_usdcCannotUseSyntheticMultiplierOrCorporatePause() public {
        observation.answer = 1e8;
        observation.multiplier = 2e18;
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidObservation.selector, usdc));
        registry.submitObservation(usdc, observation);
        observation.multiplier = 1e18;
        observation.oraclePaused = true;
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidObservation.selector, usdc));
        registry.submitObservation(usdc, observation);
    }

    function test_operatorCanPauseButOnlyOwnerCanResume() public {
        registry.setOperator(address(0xBEEF));
        vm.prank(address(0xBEEF));
        registry.emergencyPause();
        vm.expectRevert(BaseSepoliaStockRegistry.RelayEmergencyPaused.selector);
        registry.readObservation(stock);
        vm.prank(address(0xBEEF));
        vm.expectRevert();
        registry.clearEmergencyPause();
        registry.clearEmergencyPause();
        assertEq(wrapper.getPrice(stock), 200e8);
    }

    function _advanceObservationBlock() private {
        vm.warp(block.timestamp + 60);
        observation.sourceBlockNumber += 1;
        observation.sourceBlockTimestamp = block.timestamp;
    }

    function _expectInvalid() private {
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.InvalidObservation.selector, stock));
        registry.submitObservation(stock, observation);
    }

    function _expectNonMonotonic() private {
        vm.expectRevert(abi.encodeWithSelector(BaseSepoliaStockRegistry.NonMonotonicObservation.selector, stock));
        registry.submitObservation(stock, observation);
    }

    function _latestUpdatedAt() private view returns (uint256 updatedAt) {
        (,,, updatedAt,) = aggregator.latestRoundData();
    }
}
