// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { Test } from "forge-std/Test.sol";
import { BaseModuleTestDeploy } from "./BaseModuleTestDeploy.sol";
import { SplitRiskPool } from "../../contracts/SplitRiskPool.sol";
import { SplitRiskPoolFactory } from "../../contracts/SplitRiskPoolFactory.sol";
import { YSToken } from "../../contracts/YSToken.sol";
import { YSGovernor } from "../../contracts/YSGovernor.sol";
import { YSTimelockController } from "../../contracts/governance/YSTimelockController.sol";
import { BaseStockTokenLib } from "../../contracts/libraries/BaseStockTokenLib.sol";
import { ErrorsLib } from "../../contracts/libraries/ErrorsLib.sol";
import { MockERC20Decimals } from "../../contracts/mocks/MockERC20Decimals.sol";
import { ConfigurableTokenFaucet } from "../../contracts/mocks/ConfigurableTokenFaucet.sol";
import { BaseSepoliaStockRegistry } from "../../contracts/oracles/BaseSepoliaStockRegistry.sol";
import { BaseSepoliaStockAggregator } from "../../contracts/oracles/BaseSepoliaStockAggregator.sol";
import { ChainlinkOracleFeed } from "../../contracts/oracles/ChainlinkOracleFeed.sol";
import { CoinbaseStockOracleFeed } from "../../contracts/oracles/CoinbaseStockOracleFeed.sol";
import { USMarketSessionGate } from "../../contracts/oracles/USMarketSessionGate.sol";
import { CompositeOracle } from "../../contracts/oracles/CompositeOracle.sol";
import { ERC4626OracleFeed } from "../../contracts/oracles/ERC4626OracleFeed.sol";
import { IShieldReceiptNFT } from "../../contracts/interfaces/IShieldReceiptNFT.sol";
import { IProtectorReceiptNFT } from "../../contracts/interfaces/IProtectorReceiptNFT.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Entire deployment bootstrap rehearsed inside the local Foundry VM only.
/// @dev Synthetic observations below are TEST FIXTURES, never mainnet attestations. No RPC,
///      environment file, private key, broadcast, public manifest or service is accessed.
contract BaseSepoliaDeploymentRehearsalTest is Test {
    uint256 private constant INITIAL_TIME = 1788879600; // 2026-09-08 15:00 UTC, inside reviewed regular session.
    address private constant DEPLOYER = address(0xDE0101);
    address private constant USER = address(0xABCD01);
    address private constant STRANGER = address(0xBAD01);
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    YSTimelockController private timelock;
    YSToken private governanceToken;
    YSGovernor private governor;
    SplitRiskPoolFactory private factory;
    address private poolRouter;
    address private factoryRouter;
    BaseSepoliaStockRegistry private relay;
    USMarketSessionGate private gate;
    ChainlinkOracleFeed private inner;
    CoinbaseStockOracleFeed private wrapper;
    CompositeOracle private composite;
    ERC4626OracleFeed private erc4626;
    ConfigurableTokenFaucet private faucet;
    MockERC20Decimals[5] private tokens;
    BaseSepoliaStockAggregator[5] private aggregators;
    SplitRiskPool[4] private pools;
    address[5] private sourceTokens;
    string[5] private symbols;
    string[5] private tokenNames;
    uint256[4] private shieldSeedIds;
    uint256[4] private backingSeedIds;
    uint256 private observationBlock = 51_000_000;
    uint256 private equityPriceBps = 10000;

    function setUp() public {
        vm.chainId(84532);
        vm.warp(INITIAL_TIME);
        sourceTokens = [
            0xb200000000000000000000C2e324d24d7eEcd1fb,
            0xb20000000000000000000078ee7ce2fE4908108C,
            0xb2000000000000000000008bC8786B856E61707C,
            0xb2000000000000000000002D0BA3164cc74f58B7,
            0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
        ];
        symbols = ["tAAPLc", "tNVDAc", "tMETAc", "tGOOGLc", "TestUSDC"];
        tokenNames = ["Test Apple (Base Sepolia)", "Test NVIDIA (Base Sepolia)", "Test Meta (Base Sepolia)", "Test Alphabet (Base Sepolia)", "Test USD Coin (Base Sepolia)"];
        vm.startPrank(DEPLOYER);
        // Same role/bootstrap ordering and original governance delays as the JS deployment recipe.
        timelock = new YSTimelockController(2 days, new address[](0), new address[](0), DEPLOYER);
        governanceToken = new YSToken(DEPLOYER);
        governor = new YSGovernor(governanceToken, TimelockController(payable(address(timelock))), DEPLOYER);
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));
        timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(), DEPLOYER);

        poolRouter = BaseModuleTestDeploy.pool(vm);
        factoryRouter = BaseModuleTestDeploy.factory(vm);
        factory = SplitRiskPoolFactory(payable(address(new ERC1967Proxy(factoryRouter,
            abi.encodeCall(SplitRiskPoolFactory.initialize, (DEPLOYER, address(timelock), poolRouter))))));
        relay = new BaseSepoliaStockRegistry(DEPLOYER, DEPLOYER);
        gate = new USMarketSessionGate(DEPLOYER, DEPLOYER);
        // Explicit fixture sessions match the reviewed regular hours for these three dates.
        uint64[] memory days_ = new uint64[](3);
        uint32[] memory opens = new uint32[](3);
        uint32[] memory closes = new uint32[](3);
        days_[0] = uint64(INITIAL_TIME / 1 days);
        days_[1] = days_[0] + 1;
        days_[2] = days_[0] + 28;
        for (uint256 i; i < 3; ++i) { opens[i] = 13 hours + 30 minutes; closes[i] = 20 hours; }
        gate.setDailySessions(days_, opens, closes);
        inner = new ChainlinkOracleFeed(1 days);
        wrapper = new CoinbaseStockOracleFeed(address(inner), address(gate), address(relay));
        composite = new CompositeOracle();
        erc4626 = new ERC4626OracleFeed(address(inner));
        faucet = new ConfigurableTokenFaucet(DEPLOYER);
        for (uint256 i; i < 5; ++i) {
            tokens[i] = new MockERC20Decimals(tokenNames[i], symbols[i], i < 4 ? 8 : 6);
            address feed = i < 4 ? BaseStockTokenLib.sourceFeed(sourceTokens[i]) : relay.SOURCE_USDC_FEED();
            relay.registerToken(address(tokens[i]), sourceTokens[i], feed);
            aggregators[i] = new BaseSepoliaStockAggregator(address(relay), address(tokens[i]));
        }
        vm.stopPrank();
        _submitFixtureReports(INITIAL_TIME - 60, 1, false);
        vm.startPrank(DEPLOYER);
        inner.setSequencerUptimeFeed(address(relay));
        inner.setSequencerUptimeFeedRequired(true);
        erc4626.setSequencerUptimeFeed(address(relay));
        erc4626.setSequencerUptimeFeedRequired(true);
        for (uint256 i; i < 5; ++i) {
            inner.setTokenFeed(address(tokens[i]), address(aggregators[i]));
            if (i < 4) {
                inner.setProtectionOpeningMaxPriceAgeForToken(address(tokens[i]), 1 hours);
                wrapper.setTokenConfigured(address(tokens[i]), true);
            }
        }
        composite.setRobinhoodStockOracleFeed(address(wrapper));
        composite.transferOwnership(address(factory));
        factory.setCompositeOracle(address(composite));
        factory.setDefaultProtocolFeeRecipient(address(timelock));
        erc4626.transferOwnership(address(factory));
        factory.setManagedERC4626OracleFeed(address(erc4626));
        for (uint256 i; i < 5; ++i) {
            factory.addTokenInitial(address(tokens[i]), tokenNames[i],
                symbols[i], i < 4 ? address(wrapper) : address(inner), address(0), 10000, true);
        }
        factory.setTokenRequiresStrictProtectedPrice(address(tokens[4]), true);
        factory.finalizeBootstrap();
        factory.transferOwnership(address(timelock));
        inner.transferOwnership(address(timelock));
        wrapper.transferOwnership(address(timelock));
        gate.transferOwnership(address(timelock));
        relay.transferOwnership(address(timelock));
        for (uint256 i; i < 5; ++i) tokens[i].transferOwnership(address(timelock));

        for (uint256 i; i < 4; ++i) {
            require(wrapper.isProtectionOpeningAllowed(address(tokens[i])), "fixture opening unexpectedly blocked");
            tokens[4].approve(address(factory), 1000e6);
            pools[i] = SplitRiskPool(payable(factory.createPool(address(tokens[i]), symbols[i], address(tokens[4]), symbols[4],
                1000, 100, 15000, 1000e6)));
            tokens[4].approve(address(pools[i]), 50000e6);
            backingSeedIds[i] = pools[i].depositBackingAsset(address(tokens[4]), 50000e6, 50000e6);
            tokens[i].approve(address(pools[i]), 10e8);
            shieldSeedIds[i] = pools[i].depositShieldedAsset(address(tokens[i]), 10e8, 10e8);
        }
        address[] memory faucetTokens = new address[](5);
        uint256[] memory dripAmounts = new uint256[](5);
        for (uint256 i; i < 5; ++i) {
            faucetTokens[i] = address(tokens[i]);
            dripAmounts[i] = i < 4 ? 25e8 : 10000e6;
            tokens[i].transfer(address(faucet), i < 4 ? 100000e8 : 500000e6);
        }
        faucet.setTokens(faucetTokens, dripAmounts);
        faucet.transferOwnership(address(timelock));
        vm.stopPrank();
    }

    function _submitFixtureReports(uint256 priceTimestamp, uint80 roundId, bool stockPaused) private {
        ++observationBlock;
        vm.startPrank(DEPLOYER);
        for (uint256 i; i < 5; ++i) {
            relay.submitObservation(address(tokens[i]), BaseSepoliaStockRegistry.Observation({
                roundId: roundId,
                answer: i < 4 ? int256((200e8 + i * 100e8) * equityPriceBps / 10000) : int256(1e8),
                startedAt: priceTimestamp,
                updatedAt: priceTimestamp,
                answeredInRound: roundId,
                multiplier: i < 4 ? uint128(2e18) : uint128(1e18),
                oraclePaused: i < 4 && stockPaused,
                sequencerAnswer: 0,
                sequencerStartedAt: INITIAL_TIME - 1 days,
                sourceBlockNumber: observationBlock,
                sourceBlockTimestamp: block.timestamp
            }));
        }
        vm.stopPrank();
    }

    function _dripUser() private {
        vm.prank(STRANGER); // Faucet is permissionless; recipient need not be the transaction sender.
        faucet.dripAll(USER);
        for (uint256 i; i < 5; ++i) assertEq(tokens[i].balanceOf(USER), i < 4 ? 25e8 : 10000e6);
    }

    function testFullBootstrapGovernanceAndFourPoolWiring() public view {
        assertEq(block.chainid, 84532);
        assertEq(timelock.getMinDelay(), 2 days);
        bytes32[4] memory roles = [timelock.DEFAULT_ADMIN_ROLE(), timelock.PROPOSER_ROLE(), timelock.EXECUTOR_ROLE(), timelock.CANCELLER_ROLE()];
        for (uint256 i; i < 4; ++i) {
            assertEq(timelock.getRoleMemberCount(roles[i]), 1);
            assertEq(timelock.getRoleMember(roles[i], 0), i == 0 ? address(timelock) : address(governor));
        }
        assertFalse(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), DEPLOYER));
        assertEq(governanceToken.balanceOf(DEPLOYER), 1_000_000e18);
        assertEq(factory.owner(), address(timelock));
        assertEq(factory.governanceTimelock(), address(timelock));
        assertFalse(factory.bootstrapModeEnabled());
        assertEq(factory.minimumCreationBondUsd(), 500e8);
        assertEq(factory.poolCount(), 4);
        assertEq(factory.activePoolCount(), 4);
        assertEq(factory.splitRiskPoolImplementation(), poolRouter);
        assertEq(vm.load(address(factory), IMPLEMENTATION_SLOT), bytes32(uint256(uint160(factoryRouter))));
        assertEq(composite.owner(), address(factory));
        assertEq(composite.authorizedCallerCount(), 0);
        assertEq(composite.robinhoodStockOracleFeed(), address(wrapper));
        assertEq(factory.defaultProtocolFeeRecipient(), address(timelock));
        assertEq(factory.erc4626OracleFeed(), address(erc4626));
        assertEq(address(erc4626.underlyingPriceOracle()), address(inner));
        assertEq(inner.owner(), address(timelock));
        assertEq(wrapper.owner(), address(timelock));
        assertEq(gate.owner(), address(timelock));
        assertEq(relay.owner(), address(timelock));
        assertEq(relay.operator(), DEPLOYER);
        assertEq(faucet.owner(), address(timelock));
        assertTrue(inner.sequencerUptimeFeedRequired());
        assertTrue(erc4626.sequencerUptimeFeedRequired());
        assertEq(address(erc4626.sequencerUptimeFeed()), address(relay));
        (bool navSequencerUp, bool navGracePassed,) = erc4626.getSequencerStatus();
        assertTrue(navSequencerUp && navGracePassed);
        for (uint256 i; i < 5; ++i) {
            assertEq(tokens[i].decimals(), i < 4 ? 8 : 6);
            assertEq(tokens[i].symbol(), symbols[i]);
            assertEq(tokens[i].name(), tokenNames[i]);
            assertEq(tokens[i].owner(), address(timelock));
            assertEq(aggregators[i].sourceToken(), sourceTokens[i]);
            assertEq(composite.getTokenOracleFeed(address(tokens[i])), i < 4 ? address(wrapper) : address(inner));
            assertTrue(faucet.enabledTokens(address(tokens[i])));
            assertEq(tokens[i].balanceOf(address(faucet)), i < 4 ? 100000e8 : 500000e6);
        }
        for (uint256 i; i < 4; ++i) {
            assertEq(vm.load(address(pools[i]), IMPLEMENTATION_SLOT), bytes32(uint256(uint160(poolRouter))));
            assertEq(pools[i].owner(), address(factory));
            assertEq(pools[i].POOL_FACTORY(), address(factory));
            assertEq(pools[i].governanceTimelock(), address(timelock));
            assertTrue(pools[i].requiresStrictProtectedBackingPrice());
            assertEq(pools[i].totalProtectorTokens(), 50000e6);
            assertEq(pools[i].totalShieldedTokens(), 10e8);
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).ownerOf(shieldSeedIds[i]), DEPLOYER);
            assertEq(IProtectorReceiptNFT(pools[i].protectorReceiptNFT()).ownerOf(backingSeedIds[i]), DEPLOYER);
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).pool(), address(pools[i]));
            assertEq(IProtectorReceiptNFT(pools[i].protectorReceiptNFT()).pool(), address(pools[i]));
            // Source TRV already incorporates corporate-action multiplier; never multiply by 2 again.
            assertEq(composite.getPrice(address(tokens[i])), 200e8 + i * 100e8);
            (address creator, address bondToken, uint256 amount) = factory.creationBonds(address(pools[i]));
            assertEq(creator, DEPLOYER); assertEq(bondToken, address(tokens[4])); assertEq(amount, 1000e6);
        }
    }

    function testFaucetDepositSameAssetExitAndFullProtectorUnlockLifecycle() public {
        _dripUser();
        uint256[4] memory userProtectorIds;
        vm.startPrank(USER);
        for (uint256 i; i < 4; ++i) {
            tokens[4].approve(address(pools[i]), 1000e6);
            userProtectorIds[i] = pools[i].depositBackingAsset(address(tokens[4]), 1000e6, 1000e6);
            tokens[i].approve(address(pools[i]), 1e8);
            uint256 shieldId = pools[i].depositShieldedAsset(address(tokens[i]), 1e8, 1e8);
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).ownerOf(shieldId), USER);
            assertEq(IProtectorReceiptNFT(pools[i].protectorReceiptNFT()).ownerOf(userProtectorIds[i]), USER);
            pools[i].shieldedWithdraw(shieldId, address(tokens[i]), 1e8);
            assertEq(tokens[i].balanceOf(USER), 25e8);
            pools[i].startUnlockProcess(userProtectorIds[i]);
            vm.expectRevert(ErrorsLib.InsufficientUnlockedTokens.selector);
            pools[i].protectorWithdraw(userProtectorIds[i], 1000e6, address(tokens[4]), 1000e6);
        }
        vm.stopPrank();
        vm.warp(INITIAL_TIME + 28 days + 1);
        _submitFixtureReports(block.timestamp - 60, 2, false);
        vm.startPrank(USER);
        for (uint256 i; i < 4; ++i) {
            pools[i].protectorWithdraw(userProtectorIds[i], 1000e6, address(tokens[4]), 1000e6);
            assertEq(pools[i].totalProtectorTokens(), 50000e6);
            assertEq(pools[i].totalShieldedTokens(), 10e8);
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).balanceOf(USER), 0);
            assertEq(IProtectorReceiptNFT(pools[i].protectorReceiptNFT()).balanceOf(USER), 0);
        }
        vm.stopPrank();
        assertEq(tokens[4].balanceOf(USER), 10000e6);
    }

    function testSourcePriceDrawdownPaysLockedUSDCValueAndSettlesProtectorRewards() public {
        _dripUser();
        uint256[4] memory userShieldIds;
        vm.startPrank(USER);
        for (uint256 i; i < 4; ++i) {
            tokens[i].approve(address(pools[i]), 1e8);
            userShieldIds[i] = pools[i].depositShieldedAsset(address(tokens[i]), 1e8, 1e8);
            vm.expectRevert();
            pools[i].shieldedWithdraw(userShieldIds[i], address(tokens[4]), 0); // unchanged one-day protection delay.
        }
        vm.stopPrank();
        vm.warp(INITIAL_TIME + 1 days + 1);
        equityPriceBps = 5000; // TEST-ONLY new source round reports a 50% drawdown; multiplier remains 2x.
        _submitFixtureReports(block.timestamp - 60, 2, false);
        vm.startPrank(USER);
        for (uint256 i; i < 4; ++i) {
            uint256 protectedValue = (200 + i * 100) * 1e6;
            pools[i].shieldedWithdraw(userShieldIds[i], address(tokens[4]), protectedValue);
            assertEq(pools[i].totalProtectorTokens(), 50000e6 - protectedValue);
            assertEq(pools[i].totalShieldedTokens(), 10e8);
            assertEq(pools[i].accumulatedCommissions(), 1e8);
            assertEq(IShieldReceiptNFT(pools[i].shieldReceiptNFT()).balanceOf(USER), 0);
            assertEq(tokens[i].balanceOf(USER), 24e8);
        }
        vm.stopPrank();
        assertEq(tokens[4].balanceOf(USER), 11400e6);
        vm.startPrank(DEPLOYER);
        for (uint256 i; i < 4; ++i) {
            uint256 beforeBalance = tokens[i].balanceOf(DEPLOYER);
            pools[i].claimCommission(backingSeedIds[i]);
            assertEq(tokens[i].balanceOf(DEPLOYER), beforeBalance + 1e8);
            assertEq(pools[i].accumulatedCommissions(), 0);
        }
        vm.stopPrank();
    }

    function testClosedSessionStillRejectsOpeningWithFreshReports() public {
        _dripUser();
        vm.warp(INITIAL_TIME / 1 days * 1 days + 21 hours);
        _submitFixtureReports(block.timestamp - 60, 2, false);
        assertFalse(gate.isMarketOpen());
        assertFalse(wrapper.isProtectionOpeningAllowed(address(tokens[0])));
        vm.startPrank(USER);
        tokens[0].approve(address(pools[0]), 1e8);
        vm.expectRevert();
        pools[0].depositShieldedAsset(address(tokens[0]), 1e8, 1e8);
        vm.stopPrank();
        assertEq(tokens[0].balanceOf(USER), 25e8);
        assertEq(pools[0].totalShieldedTokens(), 10e8);
    }

    function testRefreshingRelayReceiptCannotMakeOldEquityRoundFresh() public {
        _dripUser();
        vm.warp(INITIAL_TIME + 2 hours);
        _submitFixtureReports(INITIAL_TIME - 60, 1, false);
        assertTrue(gate.isMarketOpen());
        assertFalse(wrapper.isProtectionOpeningAllowed(address(tokens[0])));
        (BaseSepoliaStockRegistry.Observation memory observed, uint256 received) = relay.lastObservation(address(tokens[0]));
        assertEq(observed.updatedAt, INITIAL_TIME - 60);
        assertEq(received, block.timestamp);
        assertEq(composite.getPrice(address(tokens[0])), 200e8); // ordinary 24h path works; tighter opening path still blocks.
        vm.startPrank(USER);
        tokens[0].approve(address(pools[0]), 1e8);
        vm.expectRevert();
        pools[0].depositShieldedAsset(address(tokens[0]), 1e8, 1e8);
        vm.stopPrank();
        assertEq(pools[0].totalShieldedTokens(), 10e8);
    }

    function testExpiredRelayObservationsFailClosedBeforeSpendingTokens() public {
        _dripUser();
        vm.warp(INITIAL_TIME + 11 minutes);
        assertFalse(wrapper.isProtectionOpeningAllowed(address(tokens[0])));
        vm.startPrank(USER);
        tokens[0].approve(address(pools[0]), 1e8);
        vm.expectRevert();
        pools[0].depositShieldedAsset(address(tokens[0]), 1e8, 1e8);
        tokens[4].approve(address(factory), 1000e6);
        vm.expectRevert();
        factory.createPool(address(tokens[0]), symbols[0], address(tokens[4]), symbols[4], 1000, 100, 15000, 1000e6);
        vm.stopPrank();
        assertEq(tokens[0].balanceOf(USER), 25e8);
        assertEq(tokens[4].balanceOf(USER), 10000e6);
        assertEq(factory.poolCount(), 4);
    }

    function testFinalizedOwnershipBlocksDeployerConfigurationBypasses() public {
        vm.startPrank(DEPLOYER);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, DEPLOYER));
        inner.setMaxPriceAge(2 days);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, DEPLOYER));
        gate.setDailySession(uint64(block.timestamp / 1 days), 0, uint32(1 days));
        vm.expectRevert();
        factory.addTokenInitial(address(tokens[0]), "duplicate", "duplicate", address(inner), address(0), 10000, true);
        vm.expectRevert();
        factory.upgradeToAndCall(poolRouter, "");
        vm.stopPrank();
        // Even legitimate governance cannot route the configured stock through the raw inner oracle.
        vm.prank(address(timelock));
        vm.expectRevert();
        factory.setCompositeOracleTokenFeed(address(tokens[0]), address(inner));
        assertEq(composite.getTokenOracleFeed(address(tokens[0])), address(wrapper));
    }

    function testCorporateActionPauseRemainsEffectiveAfterFullBootstrap() public {
        _submitFixtureReports(INITIAL_TIME - 60, 1, true);
        assertFalse(wrapper.isProtectionOpeningAllowed(address(tokens[0])));
        vm.expectRevert();
        composite.getPrice(address(tokens[0]));
        assertEq(composite.getPriceWithStrictCircuitBreaker(address(tokens[4])), 1e8);
    }
}
