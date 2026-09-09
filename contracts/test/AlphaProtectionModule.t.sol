// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { BaseModuleTestDeploy } from "./base-modules/BaseModuleTestDeploy.sol";
import { AlphaPoolInitializeModule } from "../contracts/alpha/AlphaPoolInitializeModule.sol";
import { BaseSepoliaAlphaToken } from "../contracts/alpha/BaseSepoliaAlphaToken.sol";
import { AlphaScenarioOracle } from "../contracts/alpha/AlphaScenarioOracle.sol";
import { AlphaStockExchange } from "../contracts/alpha/AlphaStockExchange.sol";
import { BasePoolRouter } from "../contracts/base-modules/BasePoolRouter.sol";
import { BasePoolInitializeModule } from "../contracts/base-modules/BasePoolInitializeModule.sol";
import { SplitRiskPool } from "../contracts/SplitRiskPool.sol";
import { SplitRiskPoolFactory } from "../contracts/SplitRiskPoolFactory.sol";
import { CompositeOracle } from "../contracts/oracles/CompositeOracle.sol";
import { YSTimelockController } from "../contracts/governance/YSTimelockController.sol";
import { ConfigurableTokenFaucet } from "../contracts/mocks/ConfigurableTokenFaucet.sol";
import { ErrorsLib } from "../contracts/libraries/ErrorsLib.sol";
import { TokenWhitelistLib } from "../contracts/libraries/TokenWhitelistLib.sol";
import { IShieldReceiptNFT } from "../contracts/interfaces/IShieldReceiptNFT.sol";
import { IProtectorReceiptNFT } from "../contracts/interfaces/IProtectorReceiptNFT.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/// @dev Entire funded demo is exercised locally. No RPC, secrets, or external transactions.
contract AlphaProtectionModuleTest is Test {
    BaseSepoliaAlphaToken private usd;
    BaseSepoliaAlphaToken private stock;
    AlphaScenarioOracle private oracle;
    AlphaStockExchange private exchange;
    AlphaPoolInitializeModule private initializer;
    BasePoolRouter private originalRouter;
    BasePoolRouter private router;
    SplitRiskPoolFactory private factory;
    SplitRiskPool private pool;
    YSTimelockController private timelock;
    CompositeOracle private composite;
    address private constant USER = address(0xA11CE);
    uint256 private backingId;

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }

    function setUp() public {
        vm.chainId(84532);
        usd = new BaseSepoliaAlphaToken("Demo USD - no value", "dUSD", 6, 10_000_000e6, address(this));
        stock = new BaseSepoliaAlphaToken("Demo stock - no value", "dSTOCK", 8, 1_000_000e8, address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = address(stock);
        uint256[] memory prices = new uint256[](1);
        prices[0] = 100e8;
        oracle = new AlphaScenarioOracle(address(usd), tokens, prices, 7200);
        exchange = new AlphaStockExchange(address(oracle));
        usd.transfer(address(exchange), 1_000_000e6);
        stock.transfer(address(exchange), 100_000e8);
        address[] memory controllers = new address[](1);
        controllers[0] = address(this);
        timelock = new YSTimelockController(2 days, controllers, controllers, address(this));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), address(this));
        originalRouter = BasePoolRouter(payable(BaseModuleTestDeploy.pool(vm)));
        initializer = new AlphaPoolInitializeModule(originalRouter.initializeModule());
        router = new BasePoolRouter(
            originalRouter.adminModule(),
            originalRouter.depositsModule(),
            originalRouter.feesModule(),
            address(initializer),
            originalRouter.partialexitModule(),
            originalRouter.protectorModule(),
            originalRouter.shieldexitModule(),
            originalRouter.viewsModule()
        );
        factory = SplitRiskPoolFactory(
            payable(address(
                    new ERC1967Proxy(
                        BaseModuleTestDeploy.factory(vm),
                        abi.encodeCall(
                            SplitRiskPoolFactory.initialize, (address(this), address(timelock), address(router))
                        )
                    )
                ))
        );
        composite = new CompositeOracle();
        composite.transferOwnership(address(factory));
        factory.setCompositeOracle(address(composite));
        factory.setDefaultProtocolFeeRecipient(address(timelock));
        factory.addTokenInitial(address(stock), stock.name(), stock.symbol(), address(oracle), address(0), 10000, true);
        factory.addTokenInitial(address(usd), usd.name(), usd.symbol(), address(oracle), address(0), 10000, true);
        factory.setTokenRequiresStrictProtectedPrice(address(usd), true);
        factory.finalizeBootstrap();
        factory.transferOwnership(address(timelock));
        usd.approve(address(factory), 1000e6);
        pool = SplitRiskPool(
            payable(factory.createPool(
                    address(stock), stock.symbol(), address(usd), usd.symbol(), 1000, 100, 15000, 1000e6
                ))
        );
        usd.approve(address(pool), 100_000e6);
        backingId = pool.depositBackingAsset(address(usd), 100_000e6, 100_000e6);
        usd.transfer(USER, 10_000e6);
        stock.transfer(USER, 25e8);
        vm.startPrank(USER);
        usd.approve(address(exchange), type(uint256).max);
        stock.approve(address(exchange), type(uint256).max);
        stock.approve(address(pool), type(uint256).max);
        usd.approve(address(pool), type(uint256).max);
        vm.stopPrank();
    }

    function _initData(bool withAccessControl, address shielded) private view returns (bytes memory) {
        TokenWhitelistLib.TokenInfo memory s =
            TokenWhitelistLib.TokenInfo("Demo", "dSTOCK", shielded, address(oracle), address(0), 10000);
        TokenWhitelistLib.TokenInfo memory b =
            TokenWhitelistLib.TokenInfo("Demo", "dUSD", address(usd), address(oracle), address(0), 10000);
        if (withAccessControl) {
            return abi.encodeCall(
                SplitRiskPool.initializeWithAccessControl,
                (
                    s,
                    b,
                    1000,
                    100,
                    address(this),
                    15000,
                    address(timelock),
                    address(composite),
                    address(timelock),
                    pool.shieldReceiptNFT(),
                    pool.protectorReceiptNFT(),
                    address(factory),
                    address(0)
                )
            );
        }
        return abi.encodeCall(
            SplitRiskPool.initialize,
            (
                s,
                b,
                1000,
                100,
                address(this),
                15000,
                address(timelock),
                address(composite),
                address(timelock),
                pool.shieldReceiptNFT(),
                pool.protectorReceiptNFT(),
                address(factory)
            )
        );
    }

    function testBothInitializerSelectorsKeepOriginalLayoutExceptDemoWaits() public {
        for (uint256 i; i < 2; ++i) {
            bytes memory init = _initData(i == 1, address(stock));
            address original = address(new ERC1967Proxy(address(originalRouter), init));
            address alpha = address(new ERC1967Proxy(address(router), init));
            // Access-control base occupies0..49; PoolConfig50..58; timing fields55/56.
            for (uint256 slot; slot <= 58; ++slot) {
                if (slot == 55) {
                    assertEq(uint256(vm.load(alpha, bytes32(slot))), 60);
                    assertEq(uint256(vm.load(original, bytes32(slot))), 1 days);
                } else if (slot == 56) {
                    assertEq(uint256(vm.load(alpha, bytes32(slot))), 120);
                    assertEq(uint256(vm.load(original, bytes32(slot))), 28 days);
                } else {
                    assertEq(vm.load(alpha, bytes32(slot)), vm.load(original, bytes32(slot)));
                }
            }
            SplitRiskPool p = SplitRiskPool(payable(alpha));
            assertEq(p.SHIELDED_TOKEN(), address(stock));
            assertEq(p.BACKING_TOKEN(), address(usd));
            assertEq(p.owner(), address(factory));
            assertEq(p.governanceTimelock(), address(timelock));
            assertEq(p.shieldedTokenScale(), 1e8);
            assertEq(p.backingTokenScale(), 1e6);
            assertTrue(p.requiresStrictProtectedBackingPrice());
            vm.expectRevert(Initializable.InvalidInitialization.selector);
            (bool ok,) = alpha.call(init);
            ok;
        }
    }

    function testModulesRuntimeSizeAndImmutableRouting() public view {
        assertLe(address(initializer).code.length, 24576);
        assertLe(address(oracle).code.length, 24576);
        assertLe(address(exchange).code.length, 24576);
        assertLe(address(stock).code.length, 24576);
        assertEq(router.moduleForSelector(SplitRiskPool.initialize.selector), address(initializer));
        assertEq(router.moduleForSelector(SplitRiskPool.initializeWithAccessControl.selector), address(initializer));
        assertEq(router.moduleForSelector(SplitRiskPool.depositShieldedAsset.selector), originalRouter.depositsModule());
        assertEq(router.moduleForSelector(SplitRiskPool.shieldedWithdraw.selector), originalRouter.shieldexitModule());
        assertEq(initializer.originalModule(), originalRouter.initializeModule());
        assertEq(initializer.originalModuleCodeHash(), originalRouter.initializeModule().codehash);
    }

    function testInitializerLockedGuardsWrongChainTokensAndSelectors() public {
        bytes memory init = _initData(false, address(stock));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (bool ok,) = address(initializer).call(init);
        ok;
        vm.expectRevert(AlphaPoolInitializeModule.UnknownSelector.selector);
        (ok,) = address(initializer).call(hex"deadbeef");
        bytes memory invalid = _initData(false, USER);
        vm.expectRevert(AlphaPoolInitializeModule.InvalidDemoToken.selector);
        new ERC1967Proxy(address(router), invalid);
        address originalModule = originalRouter.initializeModule();
        vm.chainId(8453);
        vm.expectRevert(AlphaPoolInitializeModule.DemoChainOnly.selector);
        new AlphaPoolInitializeModule(originalModule);
        vm.expectRevert(AlphaPoolInitializeModule.DemoChainOnly.selector);
        new ERC1967Proxy(address(router), init);
    }

    function testChangingOriginalModuleCodeIsRejected() public {
        bytes memory init = _initData(false, address(stock));
        vm.etch(initializer.originalModule(), hex"00");
        vm.expectRevert(AlphaPoolInitializeModule.InvalidModule.selector);
        new ERC1967Proxy(address(router), init);
    }

    function testFaucetBuyProtectLossExitAndSellStock() public {
        ConfigurableTokenFaucet faucet = new ConfigurableTokenFaucet(address(this));
        address[] memory tokens = new address[](1);
        tokens[0] = address(usd);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000e6;
        faucet.setTokens(tokens, amounts);
        usd.transfer(address(faucet), 1000e6);
        uint256 initialUsd = usd.balanceOf(USER);
        faucet.dripAll(USER);
        assertEq(usd.balanceOf(USER), initialUsd + 1000e6);
        vm.startPrank(USER);
        (uint256 cost,,) = exchange.quote(address(stock), true, 1e8);
        exchange.swap(address(stock), true, 1e8, cost, block.timestamp + 60);
        uint256 id = pool.depositShieldedAsset(address(stock), 1e8, 1e8);
        assertEq(IShieldReceiptNFT(pool.shieldReceiptNFT()).getPosition(id).valueAtDeposit, 100e8);
        vm.expectRevert(abi.encodeWithSelector(ErrorsLib.InsufficientPoolTimeWithDetails.selector, 60, 0));
        pool.shieldedWithdraw(id, address(usd), 100e6);
        vm.warp(uint256(oracle.epoch()) + 5400);
        assertEq(composite.getPrice(address(stock)), 75e8);
        uint256 beforeUsd = usd.balanceOf(USER);
        uint256 beforeStock = stock.balanceOf(USER);
        pool.shieldedWithdraw(id, address(usd), 100e6);
        assertEq(usd.balanceOf(USER), beforeUsd + 100e6);
        assertEq(stock.balanceOf(USER), beforeStock);
        assertEq(pool.totalShieldedTokens(), 0);
        assertEq(pool.totalProtectorTokens(), 99_900e6);
        // Spot sale remains independent of whether a protected position exists.
        (uint256 output,,) = exchange.quote(address(stock), false, 1e8);
        exchange.swap(address(stock), false, 1e8, output, vm.getBlockTimestamp() + 60);
        assertEq(usd.balanceOf(USER), beforeUsd + 100e6 + output);
        vm.stopPrank();
    }

    function testGainShareSameStockExitAndShortCollateralUnlock() public {
        vm.startPrank(USER);
        uint256 id = pool.depositShieldedAsset(address(stock), 1e8, 1e8);
        vm.warp(uint256(oracle.epoch()) + 1800);
        uint256 beforeStock = stock.balanceOf(USER);
        pool.shieldedWithdraw(id, address(stock), 1);
        uint256 received = stock.balanceOf(USER) - beforeStock;
        assertGt(received, 0);
        assertLt(received, 1e8);
        assertGt(pool.accumulatedCommissions(), 0);
        assertEq(pool.totalShieldedTokens(), 0);
        vm.stopPrank();
        pool.startUnlockProcess(backingId);
        vm.expectRevert(ErrorsLib.InsufficientUnlockedTokens.selector);
        pool.protectorWithdraw(backingId, 100_000e6, address(usd), 100_000e6);
        vm.warp(block.timestamp + 120);
        pool.protectorWithdraw(backingId, 100_000e6, address(usd), 100_000e6);
        assertEq(pool.totalProtectorTokens(), 0);
    }

    function testImmediateStockWithdrawalAndMinimumProtectedExitBoundary() public {
        vm.startPrank(USER);
        uint256 id = pool.depositShieldedAsset(address(stock), 1e8, 1e8);
        uint256 beforeStock = stock.balanceOf(USER);
        pool.shieldedWithdraw(id, address(stock), 1e8);
        assertEq(stock.balanceOf(USER), beforeStock + 1e8);
        // At a falling leg the minimum delay, rather than the availability of calendar data, determines eligibility.
        vm.warp(uint256(oracle.epoch()) + 3600);
        id = pool.depositShieldedAsset(address(stock), 1e8, 1e8);
        vm.warp(block.timestamp + 59);
        vm.expectRevert(abi.encodeWithSelector(ErrorsLib.InsufficientPoolTimeWithDetails.selector, 60, 59));
        pool.shieldedWithdraw(id, address(usd), 100e6);
        vm.warp(block.timestamp + 1);
        pool.shieldedWithdraw(id, address(usd), 100e6);
        assertEq(pool.totalShieldedTokens(), 0);
        vm.stopPrank();
    }
}
