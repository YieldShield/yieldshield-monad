// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Test } from "forge-std/Test.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SplitRiskPoolFactory } from "../contracts/SplitRiskPoolFactory.sol";
import { BaseStockTokenLib } from "../contracts/libraries/BaseStockTokenLib.sol";
import { ErrorsLib } from "../contracts/libraries/ErrorsLib.sol";
import { ChainlinkOracleFeed } from "../contracts/oracles/ChainlinkOracleFeed.sol";
import { CoinbaseStockOracleFeed } from "../contracts/oracles/CoinbaseStockOracleFeed.sol";
import { CompositeOracle } from "../contracts/oracles/CompositeOracle.sol";
import { USMarketSessionGate } from "../contracts/oracles/USMarketSessionGate.sol";
import { MockChainlinkAggregator } from "../contracts/mocks/MockChainlinkAggregator.sol";

contract BaseStaticBalanceHarness is SplitRiskPoolFactory {
    function check(address token) external view {
        _validateStaticBalanceToken(token);
    }
}

contract BaseTransferHarness {
    function transfer(address token, address recipient, uint256 amount) external {
        SafeERC20.safeTransfer(IERC20(token), recipient, amount);
    }

    function transferFrom(address token, address from, address recipient, uint256 amount) external {
        SafeERC20.safeTransferFrom(IERC20(token), from, recipient, amount);
    }
}

contract BaseRegistryResponseMock {
    bytes private _response;
    bool private _reverts;

    function setResponse(bytes calldata response) external {
        _response = response;
    }

    function setReverts(bool reverts_) external {
        _reverts = reverts_;
    }

    fallback() external {
        require(!_reverts, "unavailable");
        bytes memory response = _response;
        assembly ("memory-safe") { return(add(response, 32), mload(response)) }
    }
}

contract BaseOracleSecurityTest is Test {
    address internal constant AAPL = 0xb200000000000000000000C2e324d24d7eEcd1fb;
    address internal constant REGISTRY = 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD;
    address internal constant STOCK = address(0x1234);
    ChainlinkOracleFeed private chainlink;
    CoinbaseStockOracleFeed private stockFeed;
    BaseRegistryResponseMock private registry;
    MockChainlinkAggregator private priceFeed;
    USMarketSessionGate private gate;

    function setUp() public {
        vm.chainId(31337);
        vm.warp(20_000 days + 12 hours);
        registry = new BaseRegistryResponseMock();
        registry.setResponse(abi.encode(uint128(1e18), false));
        priceFeed = new MockChainlinkAggregator("AAPLc TRV / USD", 8, 200e8);
        chainlink = new ChainlinkOracleFeed(1 days);
        chainlink.setTokenFeed(STOCK, address(priceFeed));
        chainlink.setProtectionOpeningMaxPriceAgeForToken(STOCK, 1 hours);
        gate = new USMarketSessionGate(address(this), address(0xBEEF));
        gate.setDailySession(uint64(block.timestamp / 1 days), 0, uint32(1 days));
        stockFeed = new CoinbaseStockOracleFeed(address(chainlink), address(gate), address(registry));
        stockFeed.setTokenConfigured(STOCK, true);
    }

    function test_trvIsNeverMultipliedAgain() public {
        registry.setResponse(abi.encode(uint128(10e18), false));
        assertEq(stockFeed.getPrice(STOCK), 200e8);
        assertEq(stockFeed.getPriceUnsafe(STOCK), 200e8);
    }

    function test_eightDecimalRawBalanceUsesTotalReturnValueExactlyOnce() public {
        vm.mockCall(STOCK, abi.encodeWithSignature("decimals()"), abi.encode(uint8(8)));
        registry.setResponse(abi.encode(uint128(10e18), false));
        CompositeOracle composite = new CompositeOracle();
        composite.setRobinhoodStockOracleFeed(address(stockFeed));
        composite.setTokenOracleFeed(STOCK, address(stockFeed));
        assertEq(composite.getValue(STOCK, 1e8), 200e8);
        assertEq(composite.getValue(STOCK, 25_000_000), 50e8);
    }

    function test_safeTransfersSupportTrueReturningPrecompileButRejectEmptyEOA() public {
        BaseTransferHarness harness = new BaseTransferHarness();
        address recipient = address(0x5678);
        vm.mockCall(AAPL, abi.encodeCall(IERC20.transfer, (recipient, 1e8)), abi.encode(true));
        vm.mockCall(AAPL, abi.encodeCall(IERC20.transferFrom, (address(this), recipient, 1e8)), abi.encode(true));
        vm.etch(AAPL, hex"");
        assertEq(AAPL.code.length, 0);
        harness.transfer(AAPL, recipient, 1e8);
        harness.transferFrom(AAPL, address(this), recipient, 1e8);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, STOCK));
        harness.transfer(STOCK, recipient, 1e8);
    }

    function test_registryPauseBlocksEveryPricePathEvenWithFreshFeedAndUnpausedToken() public {
        vm.mockCall(STOCK, abi.encodeWithSignature("paused()"), abi.encode(false));
        registry.setResponse(abi.encode(uint128(1e18), true));
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenOraclePaused.selector, STOCK));
        stockFeed.getPrice(STOCK);
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenOraclePaused.selector, STOCK));
        stockFeed.getPriceUnsafe(STOCK);
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenOraclePaused.selector, STOCK));
        stockFeed.getPriceForClosedSessionExit(STOCK);
        assertFalse(stockFeed.isProtectionOpeningAllowed(STOCK));
        (bool stale, uint256 timestamp) = stockFeed.isPriceStale(STOCK);
        assertTrue(stale);
        assertEq(timestamp, 0);
    }

    function test_tokenTransferPauseDoesNotSubstituteForRegistryState() public {
        vm.mockCall(STOCK, abi.encodeWithSignature("paused()"), abi.encode(true));
        assertEq(stockFeed.getPrice(STOCK), 200e8);
    }

    function test_unconfiguredRegistryRouteFailsClosed() public {
        stockFeed.setTokenConfigured(STOCK, false);
        vm.expectRevert(
            abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenPauseProbeNotConfigured.selector, STOCK)
        );
        stockFeed.getPrice(STOCK);
        assertFalse(stockFeed.isProtectionOpeningAllowed(STOCK));
    }

    function test_registryRevertFailsClosed() public {
        registry.setReverts(true);
        _assertRegistryUnreadable();
    }

    function test_registryRejectsZeroMultiplier() public {
        registry.setResponse(abi.encode(uint128(0), false));
        _assertRegistryUnreadable();
    }

    function test_registryRejectsNonCanonicalUint128() public {
        registry.setResponse(abi.encode(uint256(type(uint128).max) + 1, false));
        _assertRegistryUnreadable();
    }

    function test_registryRejectsNonCanonicalBoolean() public {
        registry.setResponse(abi.encode(uint128(1e18), uint256(2)));
        _assertRegistryUnreadable();
    }

    function test_registryRejectsShortOrTrailingData() public {
        registry.setResponse(abi.encode(uint128(1e18)));
        _assertRegistryUnreadable();
        registry.setResponse(abi.encode(uint128(1e18), false, uint256(0)));
        _assertRegistryUnreadable();
    }

    function test_oneHourOpeningFreshnessRemainsStricterThanDailyFeedHeartbeat() public {
        vm.warp(block.timestamp + 1 hours + 1);
        assertEq(stockFeed.getPrice(STOCK), 200e8);
        assertFalse(stockFeed.isProtectionOpeningAllowed(STOCK));
    }

    function test_closedSessionLastCloseStillChecksRegistryAndEmergencyPause() public {
        vm.warp(block.timestamp + 2 days);
        assertEq(stockFeed.getPriceForClosedSessionExit(STOCK), 200e8);
        gate.emergencyPause();
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.MarketSessionEmergencyPaused.selector, STOCK));
        stockFeed.getPriceForClosedSessionExit(STOCK);
    }

    function test_baseCanonicalRouteCannotBypassWrapperBeforeItIsPinned() public {
        vm.chainId(8453);
        CompositeOracle composite = new CompositeOracle();
        vm.expectRevert();
        composite.setTokenOracleFeed(AAPL, address(chainlink));
        vm.expectRevert();
        composite.setTokenOracleFeedWithType(AAPL, address(chainlink), "chainlink");
        vm.expectRevert();
        composite.setTokenOracleFeedDual(AAPL, address(chainlink), address(stockFeed));
    }

    function test_baseCanonicalRouteCannotSnapshotMissingOpeningGate() public {
        vm.chainId(8453);
        CompositeOracle composite = new CompositeOracle();
        composite.setRobinhoodStockOracleFeed(address(stockFeed));
        vm.expectRevert(
            abi.encodeWithSelector(CompositeOracle.CanonicalStockOracleNotConfigured.selector, AAPL, address(stockFeed))
        );
        composite.setTokenOracleFeed(AAPL, address(stockFeed));
        stockFeed.setTokenConfigured(AAPL, true);
        chainlink.setTokenFeed(AAPL, address(priceFeed));
        chainlink.setProtectionOpeningMaxPriceAgeForToken(AAPL, 1 hours);
        composite.setTokenOracleFeed(AAPL, address(stockFeed));
        assertTrue(composite.protectionOpeningEligibilityRequired(AAPL));
        assertEq(composite.getOracleType(AAPL), "chainlink-stock");
    }

    function test_mainnetWrapperRequiresOfficialRegistryAndKnownStock() public {
        vm.chainId(8453);
        vm.expectRevert(
            abi.encodeWithSelector(CoinbaseStockOracleFeed.InvalidOracleRegistry.selector, address(registry))
        );
        new CoinbaseStockOracleFeed(address(chainlink), address(gate), address(registry));
        vm.etch(REGISTRY, address(registry).code);
        CoinbaseStockOracleFeed mainnetFeed = new CoinbaseStockOracleFeed(address(chainlink), address(gate), REGISTRY);
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.InvalidStockToken.selector, STOCK));
        mainnetFeed.setTokenConfigured(STOCK, true);
        mainnetFeed.setTokenConfigured(AAPL, true);
    }

    function test_canonicalB20ScaledDisplayBalanceAcceptedWithoutBytecode() public {
        vm.chainId(8453);
        BaseStaticBalanceHarness harness = new BaseStaticBalanceHarness();
        vm.mockCall(AAPL, abi.encodeWithSignature("scaledBalanceOf(address)", address(harness)), abi.encode(uint256(1)));
        vm.etch(AAPL, hex"");
        assertEq(AAPL.code.length, 0);
        harness.check(AAPL);
    }

    function test_b20ExemptionCannotBeUsedOnSepoliaOrByLookalikeToken() public {
        BaseStaticBalanceHarness harness = new BaseStaticBalanceHarness();
        vm.mockCall(AAPL, abi.encodeWithSignature("scaledBalanceOf(address)", address(harness)), abi.encode(uint256(1)));
        vm.chainId(84532);
        vm.expectRevert(abi.encodeWithSelector(ErrorsLib.BalanceMutatingTokenUnsupported.selector, AAPL));
        harness.check(AAPL);
        vm.chainId(8453);
        address lookalike = address(uint160(AAPL) + 1);
        vm.mockCall(
            lookalike, abi.encodeWithSignature("scaledBalanceOf(address)", address(harness)), abi.encode(uint256(1))
        );
        vm.expectRevert(abi.encodeWithSelector(ErrorsLib.BalanceMutatingTokenUnsupported.selector, lookalike));
        harness.check(lookalike);
    }

    function test_canonicalB20ExemptionRetainsEveryOtherRebaseCheck() public {
        vm.chainId(8453);
        BaseStaticBalanceHarness harness = new BaseStaticBalanceHarness();
        vm.mockCall(AAPL, abi.encodeWithSignature("sharesOf(address)", address(harness)), abi.encode(uint256(1)));
        vm.expectRevert(abi.encodeWithSelector(ErrorsLib.BalanceMutatingTokenUnsupported.selector, AAPL));
        harness.check(AAPL);
    }

    function _assertRegistryUnreadable() private {
        vm.expectRevert(abi.encodeWithSelector(CoinbaseStockOracleFeed.StockTokenPauseProbeFailed.selector, STOCK));
        stockFeed.getPrice(STOCK);
        assertFalse(stockFeed.isProtectionOpeningAllowed(STOCK));
        (bool stale,) = stockFeed.isPriceStale(STOCK);
        assertTrue(stale);
    }
}
