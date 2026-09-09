// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { BaseSepoliaAlphaToken } from "../contracts/alpha/BaseSepoliaAlphaToken.sol";
import { AlphaScenarioOracle } from "../contracts/alpha/AlphaScenarioOracle.sol";
import { AlphaStockExchange } from "../contracts/alpha/AlphaStockExchange.sol";
import { MockERC20Decimals } from "../contracts/mocks/MockERC20Decimals.sol";
import { CompositeOracle } from "../contracts/oracles/CompositeOracle.sol";

/// @dev Only vm.etch installs this adversary locally; real alpha token code cannot be changed.
contract AlphaReentrantStockFixture is ERC20 {
    AlphaStockExchange private immutable _exchange;

    constructor(AlphaStockExchange exchange_) ERC20("Fixture", "Fixture") {
        _exchange = exchange_;
    }

    function transfer(address, uint256) public override returns (bool) {
        _exchange.swap(address(this), false, 1e8, 1, block.timestamp + 60);
        return true;
    }
}

contract AlphaScenarioExchangeTest is Test {
    BaseSepoliaAlphaToken internal usd;
    BaseSepoliaAlphaToken internal stock;
    AlphaScenarioOracle internal oracle;
    AlphaStockExchange internal exchange;
    address internal constant USER = address(0xA11CE);
    address[] internal stocks;
    uint256[] internal prices;

    function setUp() public {
        vm.chainId(84532);
        usd = new BaseSepoliaAlphaToken("Demo USD - no value", "dUSD", 6, 10_000_000e6, address(this));
        stock = new BaseSepoliaAlphaToken("Demo stock - no value", "dSTOCK", 8, 1_000_000e8, address(this));
        stocks.push(address(stock));
        prices.push(100e8);
        oracle = new AlphaScenarioOracle(address(usd), stocks, prices, 7200);
        exchange = new AlphaStockExchange(address(oracle));
        usd.transfer(address(exchange), 1_000_000e6);
        stock.transfer(address(exchange), 100_000e8);
        usd.transfer(USER, 100_000e6);
        stock.transfer(USER, 100e8);
        vm.startPrank(USER);
        usd.approve(address(exchange), type(uint256).max);
        stock.approve(address(exchange), type(uint256).max);
        vm.stopPrank();
    }

    function testDemoIdentityRuntimeAuthenticationAndFixedSupply() public {
        assertTrue(stock.isSyntheticDemo());
        assertTrue(oracle.isDemo());
        assertEq(address(usd).codehash, address(stock).codehash);
        assertEq(address(oracle).codehash, keccak256(type(AlphaScenarioOracle).runtimeCode));
        assertEq(stock.totalSupply(), 1_000_000e8);
        (bool minted,) = address(stock).call(abi.encodeWithSignature("mint(address,uint256)", USER, 1));
        assertFalse(minted);
        (bool changed,) = address(oracle).call(abi.encodeWithSignature("setPrice(address,uint256)", address(stock), 1));
        assertFalse(changed);
        MockERC20Decimals ordinary = new MockERC20Decimals("Stock", "STOCK", 8);
        stocks[0] = address(ordinary);
        vm.expectRevert(AlphaScenarioOracle.InvalidConfiguration.selector);
        new AlphaScenarioOracle(address(usd), stocks, prices, 7200);
        vm.expectRevert(AlphaStockExchange.InvalidOracle.selector);
        new AlphaStockExchange(address(ordinary));
    }

    function testDeterministicCycleAndNoWeekendOrExpiryClosure() public {
        uint256 start = oracle.epoch();
        assertEq(oracle.priceAt(address(stock), start), 100e8);
        assertEq(oracle.priceAt(address(stock), start + 1800), 125e8);
        assertEq(oracle.priceAt(address(stock), start + 3600), 100e8);
        assertEq(oracle.priceAt(address(stock), start + 5400), 75e8);
        assertEq(oracle.priceAt(address(stock), start + 7200), 100e8);
        vm.warp(start + 3650 days);
        assertTrue(oracle.isProtectionOpeningAllowed(address(stock)));
        (bool stale, uint64 evaluatedAt) = oracle.isPriceStale(address(stock));
        assertFalse(stale);
        assertEq(evaluatedAt, block.timestamp);
        assertEq(oracle.getPrice(address(usd)), 1e8);
        vm.expectRevert(AlphaScenarioOracle.BeforeDemoEpoch.selector);
        oracle.priceAt(address(stock), start - 1);
    }

    function testFuzzPriceBoundsContinuityAndPeriodicity(uint64 elapsed) public view {
        uint256 timestamp = uint256(oracle.epoch()) + elapsed;
        uint256 price = oracle.priceAt(address(stock), timestamp);
        assertGe(price, 75e8);
        assertLe(price, 125e8);
        assertEq(oracle.priceAt(address(stock), timestamp + 7200), price);
        uint256 next = oracle.priceAt(address(stock), timestamp + 1);
        assertLe(next > price ? next - price : price - next, uint256(100e8) / 7200 + 1);
    }

    function testConstructorBoundsAndUnknownAssets() public {
        vm.expectRevert(AlphaScenarioOracle.InvalidConfiguration.selector);
        new AlphaScenarioOracle(address(usd), stocks, prices, 1);
        stocks.push(address(stock));
        prices.push(100e8);
        vm.expectRevert(AlphaScenarioOracle.InvalidConfiguration.selector);
        new AlphaScenarioOracle(address(usd), stocks, prices, 7200);
        assertFalse(oracle.isProtectionOpeningAllowed(USER));
        vm.expectRevert(abi.encodeWithSelector(AlphaScenarioOracle.UnsupportedToken.selector, USER));
        oracle.getPrice(USER);
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.quote(USER, true, 1e8);
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.quote(address(usd), true, 1e8);
    }

    function testMixedDecimalsAndCompositeProtectedCapabilities() public {
        assertEq(oracle.getValue(address(stock), 1e8), 100e8);
        assertEq(oracle.getEquivalentAmount(address(stock), 1e8, address(usd)), 100e6);
        assertEq(oracle.getEquivalentAmount(address(usd), 1e6, address(stock)), 1e6);
        assertEq(oracle.getEquivalentAmount(address(stock), 123, address(stock)), 123);
        bytes memory code = vm.getCode("CompositeOracle.sol:CompositeOracle");
        address deployed;
        assembly ("memory-safe") { deployed := create(0, add(code, 32), mload(code)) }
        CompositeOracle composite = CompositeOracle(deployed);
        composite.setTokenOracleFeed(address(stock), address(oracle));
        composite.setTokenOracleFeed(address(usd), address(oracle));
        assertEq(composite.getPrice(address(stock)), 100e8);
        assertEq(composite.getPriceUnsafe(address(stock)), 100e8);
        assertEq(composite.getPriceWithStrictCircuitBreaker(address(usd)), 1e8);
        assertTrue(composite.isProtectionOpeningAllowed(address(stock)));
        (bool stale,) = composite.isPriceStale(address(stock));
        assertFalse(stale);
    }

    function testExactBuySellFeesAndInventory() public {
        (uint256 cost, uint256 buyFee, uint256 price) = exchange.quote(address(stock), true, 1e8);
        assertEq(cost, 100_300000);
        assertEq(buyFee, 300000);
        assertEq(price, 100e8);
        uint256 usdBefore = usd.balanceOf(USER);
        uint256 stockBefore = stock.balanceOf(USER);
        uint256 reserveBefore = usd.balanceOf(address(exchange));
        vm.prank(USER);
        assertEq(exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 60), cost);
        assertEq(stock.balanceOf(USER), stockBefore + 1e8);
        assertEq(usd.balanceOf(USER), usdBefore - cost);
        (uint256 output, uint256 sellFee,) = exchange.quote(address(stock), false, 1e8);
        assertEq(output, 99_700000);
        assertEq(sellFee, 300000);
        vm.prank(USER);
        exchange.swap(address(stock), false, 1e8, output, block.timestamp + 60);
        assertEq(stock.balanceOf(USER), stockBefore);
        assertEq(usd.balanceOf(USER), usdBefore - buyFee - sellFee);
        assertEq(usd.balanceOf(address(exchange)), reserveBefore + buyFee + sellFee);
    }

    function testFuzzRoundingCannotCreateRoundTripProfit(uint96 rawAmount, uint32 elapsed) public {
        uint256 amount = bound(rawAmount, 2, 25e8);
        vm.warp(uint256(oracle.epoch()) + elapsed);
        uint256 notional = Math.mulDiv(amount, oracle.getPrice(address(stock)), 1e10);
        if (notional <= Math.mulDiv(notional, 30, 10000, Math.Rounding.Ceil)) return;
        (uint256 cost,,) = exchange.quote(address(stock), true, amount);
        (uint256 output,,) = exchange.quote(address(stock), false, amount);
        assertGt(cost, output);
        uint256 balance = usd.balanceOf(USER);
        vm.startPrank(USER);
        exchange.swap(address(stock), true, amount, cost, block.timestamp + 60);
        exchange.swap(address(stock), false, amount, output, block.timestamp + 60);
        vm.stopPrank();
        assertEq(usd.balanceOf(USER), balance - cost + output);
    }

    function testSlippageDeadlineAndAmountRevertsPreserveBalances() public {
        (uint256 cost,,) = exchange.quote(address(stock), true, 1e8);
        uint256 balance = usd.balanceOf(USER);
        vm.startPrank(USER);
        vm.expectRevert(AlphaStockExchange.SlippageExceeded.selector);
        exchange.swap(address(stock), true, 1e8, cost - 1, block.timestamp + 60);
        vm.expectRevert(AlphaStockExchange.SlippageExceeded.selector);
        exchange.swap(address(stock), false, 1e8, cost, block.timestamp + 60);
        vm.expectRevert(AlphaStockExchange.QuoteExpired.selector);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp - 1);
        vm.expectRevert(AlphaStockExchange.QuoteExpired.selector);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 601);
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.swap(address(stock), true, 1e8, 0, block.timestamp + 60);
        vm.stopPrank();
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.quote(address(stock), true, 25e8 + 1);
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.quote(address(stock), false, 0);
        assertEq(usd.balanceOf(USER), balance);
    }

    function testEmptyInventoryBothDirections() public {
        uint256 stockReserve = stock.balanceOf(address(exchange));
        vm.prank(address(exchange));
        stock.transfer(address(this), stockReserve);
        vm.expectRevert(AlphaStockExchange.InsufficientInventory.selector);
        exchange.quote(address(stock), true, 1e8);
        uint256 usdReserve = usd.balanceOf(address(exchange));
        vm.prank(address(exchange));
        usd.transfer(address(this), usdReserve);
        vm.expectRevert(AlphaStockExchange.InsufficientInventory.selector);
        exchange.quote(address(stock), false, 1e8);
    }

    function testMovingPriceRequotesInsteadOfUsingStaleCost() public {
        (uint256 cost,,) = exchange.quote(address(stock), true, 1e8);
        vm.warp(block.timestamp + 60);
        vm.prank(USER);
        vm.expectRevert(AlphaStockExchange.SlippageExceeded.selector);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 60);
    }

    function testOutgoingTransferFailureRollsBackIncomingPayment() public {
        (uint256 cost,,) = exchange.quote(address(stock), true, 1e8);
        uint256 balance = usd.balanceOf(USER);
        // Local adversarial fixture: transfer claims success without delivering output.
        vm.mockCall(address(stock), abi.encodeWithSignature("transfer(address,uint256)", USER, 1e8), abi.encode(true));
        vm.prank(USER);
        vm.expectRevert(AlphaStockExchange.InexactTransfer.selector);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 60);
        assertEq(usd.balanceOf(USER), balance);
    }

    function testCallbackReentrancyRollsBackPayment() public {
        (uint256 cost,,) = exchange.quote(address(stock), true, 1e8);
        uint256 beforeBalance = usd.balanceOf(USER);
        AlphaReentrantStockFixture fixture = new AlphaReentrantStockFixture(exchange);
        vm.etch(address(stock), address(fixture).code);
        vm.prank(USER);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 60);
        assertEq(usd.balanceOf(USER), beforeBalance);
    }

    function testDustAndNoNativeValueOrArbitraryRecipient() public {
        vm.expectRevert(AlphaStockExchange.InvalidTrade.selector);
        exchange.quote(address(stock), false, 1);
        (uint256 cost, uint256 fee,) = exchange.quote(address(stock), true, 1);
        assertEq(cost, 2);
        assertEq(fee, 1);
        (bool ok,) = address(exchange)
            .call(
                abi.encodeWithSignature(
                    "swap(address,bool,uint256,uint256,uint256,address)",
                    address(stock),
                    true,
                    1e8,
                    200e6,
                    block.timestamp + 60,
                    USER
                )
            );
        assertFalse(ok);
        vm.deal(address(this), 1);
        (ok,) = address(exchange).call{ value: 1 }("");
        assertFalse(ok);
    }

    function testRejectOtherChainDeploymentsAndTrading() public {
        vm.chainId(8453);
        vm.expectRevert(BaseSepoliaAlphaToken.DemoChainOnly.selector);
        new BaseSepoliaAlphaToken("Demo", "Demo", 6, 1e6, address(this));
        vm.expectRevert(AlphaScenarioOracle.DemoChainOnly.selector);
        new AlphaScenarioOracle(address(usd), stocks, prices, 7200);
        vm.expectRevert(AlphaStockExchange.DemoChainOnly.selector);
        new AlphaStockExchange(address(oracle));
        vm.expectRevert(AlphaScenarioOracle.DemoChainOnly.selector);
        oracle.getPrice(address(stock));
        vm.expectRevert(AlphaStockExchange.DemoChainOnly.selector);
        exchange.quote(address(stock), true, 1e8);
        vm.expectRevert(AlphaStockExchange.DemoChainOnly.selector);
        exchange.swap(address(stock), true, 1e8, 200e6, block.timestamp + 60);
        assertFalse(oracle.isProtectionOpeningAllowed(address(stock)));
    }
}
