// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { BaseModuleTestDeploy } from "./BaseModuleTestDeploy.sol";
import { TestTimelockHelper } from "../helpers/TestTimelockHelper.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { BasePoolRouter } from "../../contracts/base-modules/BasePoolRouter.sol";
import { BaseFactoryRouter } from "../../contracts/base-modules/BaseFactoryRouter.sol";
import { SplitRiskPool } from "../../contracts/SplitRiskPool.sol";
import { TokenWhitelistLib } from "../../contracts/libraries/TokenWhitelistLib.sol";
import { SplitRiskPoolFactory } from "../../contracts/SplitRiskPoolFactory.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract BaseModuleSecurityTest is Test, TestTimelockHelper {
    BasePoolRouter poolRouter;
    BaseFactoryRouter factoryRouter;
    SplitRiskPoolFactory factory;
    bytes32 constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    function setUp() public {
        poolRouter=BasePoolRouter(payable(BaseModuleTestDeploy.pool(vm)));
        factoryRouter=BaseFactoryRouter(payable(BaseModuleTestDeploy.factory(vm)));
        address governance=address(_deployTestTimelock(address(this)));
        factory=SplitRiskPoolFactory(payable(address(new ERC1967Proxy(address(factoryRouter), abi.encodeCall(SplitRiskPoolFactory.initialize,(address(this),governance,address(poolRouter)))))));
    }
    function testRoutersAcceptDirectUUIDAndRejectDelegatedUUID() public {
        assertEq(poolRouter.proxiableUUID(),IMPLEMENTATION_SLOT);
        assertEq(factoryRouter.proxiableUUID(),IMPLEMENTATION_SLOT);
        vm.expectRevert(BaseFactoryRouter.DelegatedUUID.selector);
        factory.proxiableUUID();
        ERC1967Proxy proxy=new ERC1967Proxy(address(poolRouter),abi.encodeWithSignature("UPGRADE_INTERFACE_VERSION()"));
        vm.expectRevert(BasePoolRouter.DelegatedUUID.selector);
        BasePoolRouter(payable(address(proxy))).proxiableUUID();
    }
    function testUpgradePermanentlyDisabledForOwnerAndStranger() public {
        bytes32 oldImplementation=vm.load(address(factory),IMPLEMENTATION_SLOT);
        vm.expectRevert(BaseFactoryRouter.UpgradeDisabled.selector);
        factory.upgradeToAndCall(address(poolRouter),"");
        vm.prank(address(0xBEEF));
        vm.expectRevert(BaseFactoryRouter.UpgradeDisabled.selector);
        factory.upgradeToAndCall(address(poolRouter),"");
        assertEq(vm.load(address(factory),IMPLEMENTATION_SLOT),oldImplementation);
        ERC1967Proxy poolProxy=new ERC1967Proxy(address(poolRouter),abi.encodeWithSignature("UPGRADE_INTERFACE_VERSION()"));
        vm.expectRevert(BasePoolRouter.UpgradeDisabled.selector);
        BasePoolRouter(payable(address(poolProxy))).upgradeToAndCall(address(factoryRouter),"");
    }
    function testFactoryRouterAndInitializationModuleAreLocked() public {
        bytes memory initialization=abi.encodeCall(SplitRiskPoolFactory.initialize,(address(this),factory.governanceTimelock(),address(poolRouter)));
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (bool ok,)=address(factoryRouter).call(initialization); ok;
        address adminModule=factoryRouter.adminModule();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (ok,)=adminModule.call(initialization);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (ok,)=address(factory).call(initialization);
    }
    function testPoolRouterAndInitializationModuleAreLocked() public {
        TokenWhitelistLib.TokenInfo memory blank;
        bytes memory initialization=abi.encodeCall(SplitRiskPool.initialize,(blank,blank,0,0,address(0),0,address(0),address(0),address(0),address(0),address(0),address(0)));
        address initializerModule=poolRouter.initializeModule();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (bool ok,)=address(poolRouter).call(initialization); ok;
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        (ok,)=initializerModule.call(initialization);
    }
    function testRouterRejectsEmptyModuleAddresses() public {
        vm.expectRevert(BasePoolRouter.InvalidModule.selector);
        new BasePoolRouter(address(0),address(0),address(0),address(0),address(0),address(0),address(0),address(0));
        vm.expectRevert(BaseFactoryRouter.InvalidModule.selector);
        new BaseFactoryRouter(address(0),address(0),address(0),address(0),address(0));
    }
    function testUnselectedExplicitModuleMutatorsRevert() public {
        address admin=poolRouter.adminModule();
        vm.expectRevert(bytes4(keccak256("BaseModuleSelectorUnavailable()")));
        (bool ok,)=admin.call(abi.encodeCall(SplitRiskPool.depositBackingAsset,(address(0),0,0))); ok;
    }
    function testUnknownAndEmptyCallsFailClosed() public {
        vm.expectRevert(abi.encodeWithSelector(BaseFactoryRouter.UnknownSelector.selector,bytes4(0xdeadbeef)));
        (bool ok,)=address(factory).call(hex"deadbeef"); ok;
        vm.expectRevert(abi.encodeWithSelector(BasePoolRouter.UnknownSelector.selector,bytes4(0xdeadbeef)));
        (ok,)=address(poolRouter).call(hex"deadbeef");
        vm.deal(address(this),1 ether);
        vm.expectRevert(abi.encodeWithSelector(BaseFactoryRouter.UnknownSelector.selector,bytes4(0)));
        (ok,)=address(factory).call{value:1}("");
        assertEq(address(factory).balance,0);
    }
    function testRouterStorageUsesOnlyOriginalProxyState() public {
        assertEq(factory.owner(),address(this));
        assertEq(factory.splitRiskPoolImplementation(),address(poolRouter));
        assertEq(factory.poolImplementationCodehash(),address(poolRouter).codehash);
        assertEq(factory.minimumCreationBondUsd(),500e8);
        assertEq(factory.maxActivePools(),100);
        assertTrue(factory.bootstrapModeEnabled());
    }
    function testSplitRiskPoolExhaustiveOriginalSelectorCoverage() public view {
        assertEq(poolRouter.moduleForSelector(0xc127ffd1), poolRouter.viewsModule()); // BACKING_TOKEN()
        assertEq(poolRouter.moduleForSelector(0xd9e69a05), poolRouter.viewsModule()); // COLLATERAL_RATIO()
        assertEq(poolRouter.moduleForSelector(0x1a454ea6), poolRouter.viewsModule()); // COMMISSION_RATE()
        assertEq(poolRouter.moduleForSelector(0x0ba2a91e), poolRouter.viewsModule()); // POOL_CREATOR()
        assertEq(poolRouter.moduleForSelector(0xd8e31608), poolRouter.viewsModule()); // POOL_FACTORY()
        assertEq(poolRouter.moduleForSelector(0xdd1b9c4a), poolRouter.viewsModule()); // POOL_FEE()
        assertEq(poolRouter.moduleForSelector(0x374b9af2), poolRouter.viewsModule()); // SHIELDED_TOKEN()
        assertEq(poolRouter.moduleForSelector(0xad3cb1cc), poolRouter.viewsModule()); // UPGRADE_INTERFACE_VERSION()
        assertEq(poolRouter.moduleForSelector(0x314268cd), poolRouter.adminModule()); // acceptGovernanceTimelock()
        assertEq(poolRouter.moduleForSelector(0x39a740c8), poolRouter.adminModule()); // acceptGovernanceTimelockFromFactory(address)
        assertEq(poolRouter.moduleForSelector(0x13007d55), poolRouter.viewsModule()); // accessControl()
        assertEq(poolRouter.moduleForSelector(0x72ee6f74), poolRouter.viewsModule()); // accessControlCanGateWithdrawals()
        assertEq(poolRouter.moduleForSelector(0xd26c8b6a), poolRouter.viewsModule()); // accumulatedCommissions()
        assertEq(poolRouter.moduleForSelector(0xeec21569), poolRouter.viewsModule()); // accumulatedPoolFee()
        assertEq(poolRouter.moduleForSelector(0xa544a62c), poolRouter.viewsModule()); // accumulatedProtocolFee()
        assertEq(poolRouter.moduleForSelector(0x4d3a27bb), poolRouter.viewsModule()); // backingTokenDecimals()
        assertEq(poolRouter.moduleForSelector(0x854b58ac), poolRouter.viewsModule()); // backingTokenScale()
        assertEq(poolRouter.moduleForSelector(0x934b3aa0), poolRouter.adminModule()); // cancelGovernanceTimelockFromFactory(address)
        assertEq(poolRouter.moduleForSelector(0xf3d107ea), poolRouter.adminModule()); // cancelGovernanceTimelockTransfer()
        assertEq(poolRouter.moduleForSelector(0x045d653c), poolRouter.protectorModule()); // cancelUnlockProcess(uint256)
        assertEq(poolRouter.moduleForSelector(0x8eca493a), poolRouter.feesModule()); // claimCommission(uint256)
        assertEq(poolRouter.moduleForSelector(0xdefb5f40), poolRouter.feesModule()); // claimExpiredProtectorBacking(uint256,uint256)
        assertEq(poolRouter.moduleForSelector(0x0962ef79), poolRouter.partialexitModule()); // claimRewards(uint256)
        assertEq(poolRouter.moduleForSelector(0x999e7f0e), poolRouter.viewsModule()); // commissionsClaimed(uint256)
        assertEq(poolRouter.moduleForSelector(0xa4778e88), poolRouter.viewsModule()); // currentEpochCommissionReserve()
        assertEq(poolRouter.moduleForSelector(0xde641404), poolRouter.depositsModule()); // depositBackingAsset(address,uint256,uint256)
        assertEq(poolRouter.moduleForSelector(0x693b593f), poolRouter.depositsModule()); // depositShieldedAsset(address,uint256,uint256)
        assertEq(poolRouter.moduleForSelector(0xba0a2291), poolRouter.feesModule()); // escrowExpiredProtectorCommission(uint256)
        assertEq(poolRouter.moduleForSelector(0x43d064e3), poolRouter.viewsModule()); // feeValueBaselineUsd(uint256)
        assertEq(poolRouter.moduleForSelector(0x1c559b15), poolRouter.feesModule()); // forfeitCommission(uint256)
        assertEq(poolRouter.moduleForSelector(0x0bb8d29b), poolRouter.viewsModule()); // getAccessControlStatus()
        assertEq(poolRouter.moduleForSelector(0x0112ddc3), poolRouter.viewsModule()); // getAvailableForWithdrawal(uint256)
        assertEq(poolRouter.moduleForSelector(0x3fd47997), poolRouter.viewsModule()); // getClaimableCommission(uint256)
        assertEq(poolRouter.moduleForSelector(0xf593b3fe), poolRouter.viewsModule()); // getExpiredProtectorBackingClaim(uint256)
        assertEq(poolRouter.moduleForSelector(0xfcb40fd4), poolRouter.viewsModule()); // getLockedAmount(uint256)
        assertEq(poolRouter.moduleForSelector(0x9c84cd10), poolRouter.viewsModule()); // getOracleInfo()
        assertEq(poolRouter.moduleForSelector(0x52375bb1), poolRouter.viewsModule()); // getPoolBalances()
        assertEq(poolRouter.moduleForSelector(0xb517dcf1), poolRouter.viewsModule()); // getProtectorDepositInfo(uint256)
        assertEq(poolRouter.moduleForSelector(0x4d7848f4), poolRouter.viewsModule()); // getProtectorPositionAmount(uint256)
        assertEq(poolRouter.moduleForSelector(0x9fb68992), poolRouter.viewsModule()); // getReservedFees()
        assertEq(poolRouter.moduleForSelector(0xc11a7233), poolRouter.viewsModule()); // getShieldDepositInfo(uint256)
        assertEq(poolRouter.moduleForSelector(0x155bb24a), poolRouter.viewsModule()); // getUserNFTCounts(address)
        assertEq(poolRouter.moduleForSelector(0x23a216c1), poolRouter.viewsModule()); // getUtilizationRatio()
        assertEq(poolRouter.moduleForSelector(0x3087c141), poolRouter.viewsModule()); // getUtilizationRatioUsd()
        assertEq(poolRouter.moduleForSelector(0xbe788e70), poolRouter.viewsModule()); // getWithdrawableBalance()
        assertEq(poolRouter.moduleForSelector(0x9d8439f2), poolRouter.viewsModule()); // governanceAccessControlInstalled()
        assertEq(poolRouter.moduleForSelector(0x9a1fdd79), poolRouter.viewsModule()); // governanceTimelock()
        assertEq(poolRouter.moduleForSelector(0xa089e9fe), poolRouter.viewsModule()); // hasEverLaunched()
        assertEq(poolRouter.moduleForSelector(0xb10fe7ee), poolRouter.viewsModule()); // historicalCommissionReserve()
        assertEq(poolRouter.moduleForSelector(0xc08ab485), poolRouter.initializeModule()); // initialize((string,string,address,address,address,uint256),(string,string,address,address,address,uint256),uint256,uint256,address,uint256,address,address,address,address,address,address)
        assertEq(poolRouter.moduleForSelector(0xf0101d6b), poolRouter.initializeModule()); // initializeWithAccessControl((string,string,address,address,address,uint256),(string,string,address,address,address,uint256),uint256,uint256,address,uint256,address,address,address,address,address,address,address)
        assertEq(poolRouter.moduleForSelector(0x464b4158), poolRouter.viewsModule()); // isAssetSupported(address)
        assertEq(poolRouter.moduleForSelector(0x56a28880), poolRouter.viewsModule()); // lastClaimRewardsTime(uint256)
        assertEq(poolRouter.moduleForSelector(0x8da5cb5b), poolRouter.viewsModule()); // owner()
        assertEq(poolRouter.moduleForSelector(0xb8298574), poolRouter.partialexitModule()); // partialWithdrawShielded(uint256,uint256,address,uint256)
        assertEq(poolRouter.moduleForSelector(0x8456cb59), poolRouter.adminModule()); // pause()
        assertEq(poolRouter.moduleForSelector(0x1ba3be39), poolRouter.adminModule()); // pauseFromFactory()
        assertEq(poolRouter.moduleForSelector(0x5c975abb), poolRouter.viewsModule()); // paused()
        assertEq(poolRouter.moduleForSelector(0x45cee6fd), poolRouter.feesModule()); // payPoolFee()
        assertEq(poolRouter.moduleForSelector(0xd5c20fa2), poolRouter.feesModule()); // payProtocolFee()
        assertEq(poolRouter.moduleForSelector(0x286062b1), poolRouter.viewsModule()); // pendingGovernanceTimelock()
        assertEq(poolRouter.moduleForSelector(0x65a61885), poolRouter.viewsModule()); // pendingProtectorRewardDust()
        assertEq(poolRouter.moduleForSelector(0x9695e195), poolRouter.viewsModule()); // poolConfig()
        assertEq(poolRouter.moduleForSelector(0x75f678a0), poolRouter.viewsModule()); // poolFeeRecipient()
        assertEq(poolRouter.moduleForSelector(0x641ad8a9), poolRouter.viewsModule()); // poolState()
        assertEq(poolRouter.moduleForSelector(0x5fabc466), poolRouter.viewsModule()); // protectorEpochBackingPositionSettled(uint256)
        assertEq(poolRouter.moduleForSelector(0x3efdebef), poolRouter.viewsModule()); // protectorEpochBackingRemainingReserve(uint256)
        assertEq(poolRouter.moduleForSelector(0xbc2b6abc), poolRouter.viewsModule()); // protectorEpochBackingRemainingShares(uint256)
        assertEq(poolRouter.moduleForSelector(0x3683960f), poolRouter.viewsModule()); // protectorEpochFinalRewardPerShare(uint256)
        assertEq(poolRouter.moduleForSelector(0x5229b221), poolRouter.viewsModule()); // protectorEpochPositionSettled(uint256)
        assertEq(poolRouter.moduleForSelector(0x322bede5), poolRouter.viewsModule()); // protectorEpochRemainingReserve(uint256)
        assertEq(poolRouter.moduleForSelector(0x1675b9d9), poolRouter.viewsModule()); // protectorEpochRemainingShares(uint256)
        assertEq(poolRouter.moduleForSelector(0x57eb4917), poolRouter.viewsModule()); // protectorReceiptNFT()
        assertEq(poolRouter.moduleForSelector(0x48e4c845), poolRouter.viewsModule()); // protectorShareEpoch()
        assertEq(poolRouter.moduleForSelector(0x359fe59c), poolRouter.viewsModule()); // protectorShareEpochs(uint256)
        assertEq(poolRouter.moduleForSelector(0x61b1bedb), poolRouter.viewsModule()); // protectorShares(uint256)
        assertEq(poolRouter.moduleForSelector(0x37b840ef), poolRouter.protectorModule()); // protectorWithdraw(uint256,uint256,address,uint256)
        assertEq(poolRouter.moduleForSelector(0x77dfeccb), poolRouter.adminModule()); // refreshStrictProtectedBackingPriceFlag()
        assertEq(poolRouter.moduleForSelector(0x715018a6), poolRouter.adminModule()); // renounceOwnership()
        assertEq(poolRouter.moduleForSelector(0x5a7ecfc4), poolRouter.viewsModule()); // requiresStrictProtectedBackingPrice()
        assertEq(poolRouter.moduleForSelector(0x82069735), poolRouter.adminModule()); // resetShieldedTokenTransferIntegrity(uint256)
        assertEq(poolRouter.moduleForSelector(0xf3371e9a), poolRouter.viewsModule()); // rewardDebt(uint256)
        assertEq(poolRouter.moduleForSelector(0x33590f0b), poolRouter.viewsModule()); // rewardPerShareAccumulated()
        assertEq(poolRouter.moduleForSelector(0x19129e5a), poolRouter.adminModule()); // setAccessControl(address)
        assertEq(poolRouter.moduleForSelector(0xc0615607), poolRouter.adminModule()); // setGovernanceTimelock(address)
        assertEq(poolRouter.moduleForSelector(0x15da151f), poolRouter.adminModule()); // setGovernanceTimelockFromFactory(address)
        assertEq(poolRouter.moduleForSelector(0x19c5da60), poolRouter.adminModule()); // setPoolFeeRecipient(address)
        assertEq(poolRouter.moduleForSelector(0xb5b64c1f), poolRouter.adminModule()); // setProtectorTransferLockPeriod(uint256)
        assertEq(poolRouter.moduleForSelector(0x30b77938), poolRouter.adminModule()); // setShieldTransferLockPeriod(uint256)
        assertEq(poolRouter.moduleForSelector(0x7dabe8c7), poolRouter.feesModule()); // settleExpiredProtectorBacking(uint256,uint256)
        assertEq(poolRouter.moduleForSelector(0xb5a54433), poolRouter.feesModule()); // settleExpiredProtectorPosition(uint256)
        assertEq(poolRouter.moduleForSelector(0x06a4f15f), poolRouter.viewsModule()); // shieldReceiptNFT()
        assertEq(poolRouter.moduleForSelector(0x36fbd23d), poolRouter.viewsModule()); // shieldedTokenDecimals()
        assertEq(poolRouter.moduleForSelector(0x2d6b6a53), poolRouter.viewsModule()); // shieldedTokenScale()
        assertEq(poolRouter.moduleForSelector(0x87012bdf), poolRouter.viewsModule()); // shieldedTokenTransferIntegrityBroken()
        assertEq(poolRouter.moduleForSelector(0xfb7862fb), poolRouter.viewsModule()); // shieldedTransferIntegrityProbe()
        assertEq(poolRouter.moduleForSelector(0xa533039e), poolRouter.shieldexitModule()); // shieldedWithdraw(uint256,address,uint256)
        assertEq(poolRouter.moduleForSelector(0x9ae78abc), poolRouter.protectorModule()); // startUnlockProcess(uint256)
        assertEq(poolRouter.moduleForSelector(0xbebbf88f), poolRouter.adminModule()); // sweepInactiveProtectorBackingDustFromFactory()
        assertEq(poolRouter.moduleForSelector(0xcf5e5ef8), poolRouter.adminModule()); // sweepUnaccountedSurplusFromFactory()
        assertEq(poolRouter.moduleForSelector(0x5f5d2f87), poolRouter.viewsModule()); // totalCommissionsEverAccumulated()
        assertEq(poolRouter.moduleForSelector(0xf288576f), poolRouter.viewsModule()); // totalProtectorShares()
        assertEq(poolRouter.moduleForSelector(0x239507e5), poolRouter.viewsModule()); // totalProtectorTokens()
        assertEq(poolRouter.moduleForSelector(0xa05be747), poolRouter.viewsModule()); // totalShieldCollateralAmount()
        assertEq(poolRouter.moduleForSelector(0x6e16d467), poolRouter.viewsModule()); // totalShieldedTokens()
        assertEq(poolRouter.moduleForSelector(0x9dc25ce0), poolRouter.viewsModule()); // totalValueAtDeposit()
        assertEq(poolRouter.moduleForSelector(0xf2fde38b), poolRouter.adminModule()); // transferOwnership(address)
        assertEq(poolRouter.moduleForSelector(0x3f4ba83a), poolRouter.adminModule()); // unpause()
        assertEq(poolRouter.moduleForSelector(0x7e28f55f), poolRouter.adminModule()); // updatePoolConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address)
    }
    function testSplitRiskPoolFactoryExhaustiveOriginalSelectorCoverage() public view {
        assertEq(factoryRouter.moduleForSelector(0xd6dd35ed), factoryRouter.viewsModule()); // DEFAULT_MINIMUM_CREATION_BOND_USD()
        assertEq(factoryRouter.moduleForSelector(0x2d01c134), factoryRouter.viewsModule()); // ERC4626_ORACLE_FEED_ROLE()
        assertEq(factoryRouter.moduleForSelector(0x81358498), factoryRouter.viewsModule()); // MAX_POOLS()
        assertEq(factoryRouter.moduleForSelector(0xa78aee25), factoryRouter.viewsModule()); // PROTECTOR_ONLY_POOL_DEACTIVATION_DELAY()
        assertEq(factoryRouter.moduleForSelector(0x51c6d4db), factoryRouter.viewsModule()); // PYTH_ORACLE_ROLE()
        assertEq(factoryRouter.moduleForSelector(0xad3cb1cc), factoryRouter.viewsModule()); // UPGRADE_INTERFACE_VERSION()
        assertEq(factoryRouter.moduleForSelector(0x314268cd), factoryRouter.adminModule()); // acceptGovernanceTimelock()
        assertEq(factoryRouter.moduleForSelector(0xad88ca99), factoryRouter.adminModule()); // acceptPoolGovernanceTimelockTransfers(uint256,uint256)
        assertEq(factoryRouter.moduleForSelector(0x8348bce3), factoryRouter.viewsModule()); // activePoolCount()
        assertEq(factoryRouter.moduleForSelector(0xf87793ad), factoryRouter.viewsModule()); // activePools(uint256)
        assertEq(factoryRouter.moduleForSelector(0x90cdd88e), factoryRouter.adminModule()); // addToken(address,string,string,address,address,uint256,bool)
        assertEq(factoryRouter.moduleForSelector(0x3afef156), factoryRouter.adminModule()); // addTokenInitial(address,string,string,address,address,uint256,bool)
        assertEq(factoryRouter.moduleForSelector(0x2811062d), factoryRouter.adminModule()); // assertPinnedPoolImplementation(address)
        assertEq(factoryRouter.moduleForSelector(0x7bd51090), factoryRouter.viewsModule()); // bootstrapModeEnabled()
        assertEq(factoryRouter.moduleForSelector(0xba682cff), factoryRouter.oracleModule()); // cancelCompositeOracleScheduledOverride(address,bytes32)
        assertEq(factoryRouter.moduleForSelector(0xf3d107ea), factoryRouter.adminModule()); // cancelGovernanceTimelockTransfer()
        assertEq(factoryRouter.moduleForSelector(0x4f4781d7), factoryRouter.adminModule()); // cancelPoolGovernanceTimelockTransfers(uint256,uint256,address)
        assertEq(factoryRouter.moduleForSelector(0x2ac90adb), factoryRouter.oracleModule()); // cancelScheduledCompositeOracleTokenFeedRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0x5cd78327), factoryRouter.oracleModule()); // cancelScheduledERC4626VaultRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0x9844dfed), factoryRouter.oracleModule()); // cancelScheduledERC4626VaultSharePriceReferenceRefresh(address)
        assertEq(factoryRouter.moduleForSelector(0x038758c9), factoryRouter.oracleModule()); // cancelScheduledPythTokenRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0x29d0cdf4), factoryRouter.lifecycleModule()); // closePool(address)
        assertEq(factoryRouter.moduleForSelector(0x86a16f51), factoryRouter.lifecycleModule()); // closePoolTo(address,address)
        assertEq(factoryRouter.moduleForSelector(0x1783dd59), factoryRouter.viewsModule()); // compositeOracle()
        assertEq(factoryRouter.moduleForSelector(0x5f3eb49f), factoryRouter.createModule()); // createPool(address,string,address,string,uint256,uint256,uint256,uint256)
        assertEq(factoryRouter.moduleForSelector(0xa5da154f), factoryRouter.createModule()); // createPoolWithAccessControl(address,string,address,string,uint256,uint256,uint256,uint256,address)
        assertEq(factoryRouter.moduleForSelector(0xf7970cdc), factoryRouter.viewsModule()); // creationBonds(address)
        assertEq(factoryRouter.moduleForSelector(0xdf0992af), factoryRouter.lifecycleModule()); // deactivateDustPool(address)
        assertEq(factoryRouter.moduleForSelector(0x65c05106), factoryRouter.lifecycleModule()); // deactivatePool(address)
        assertEq(factoryRouter.moduleForSelector(0xe95dd336), factoryRouter.lifecycleModule()); // deactivateProtectorOnlyPool(address)
        assertEq(factoryRouter.moduleForSelector(0x07fd7503), factoryRouter.viewsModule()); // defaultProtocolFeeRecipient()
        assertEq(factoryRouter.moduleForSelector(0x79abeb7c), factoryRouter.viewsModule()); // erc4626OracleFeed()
        assertEq(factoryRouter.moduleForSelector(0x4ae0d01a), factoryRouter.oracleModule()); // executeCompositeOracleEmergencyCancelChallenge(address)
        assertEq(factoryRouter.moduleForSelector(0x23c2063c), factoryRouter.oracleModule()); // executeCompositeOracleForceResetToPrimary(address)
        assertEq(factoryRouter.moduleForSelector(0x06c7e131), factoryRouter.adminModule()); // finalizeBootstrap()
        assertEq(factoryRouter.moduleForSelector(0x8ec08354), factoryRouter.viewsModule()); // getActivePools()
        assertEq(factoryRouter.moduleForSelector(0x2a9abc14), factoryRouter.viewsModule()); // getActivePoolsInfo()
        assertEq(factoryRouter.moduleForSelector(0x06bfa938), factoryRouter.viewsModule()); // getPoolInfo(address)
        assertEq(factoryRouter.moduleForSelector(0xbbe95837), factoryRouter.viewsModule()); // getPools(uint256,uint256)
        assertEq(factoryRouter.moduleForSelector(0x3f42ba51), factoryRouter.viewsModule()); // getPoolsInfo(uint256,uint256)
        assertEq(factoryRouter.moduleForSelector(0xe26f7900), factoryRouter.viewsModule()); // getWhitelistedTokens()
        assertEq(factoryRouter.moduleForSelector(0x9a1fdd79), factoryRouter.viewsModule()); // governanceTimelock()
        assertEq(factoryRouter.moduleForSelector(0xc0c53b8b), factoryRouter.adminModule()); // initialize(address,address,address)
        assertEq(factoryRouter.moduleForSelector(0xa711e6a1), factoryRouter.viewsModule()); // isPoolActive(address)
        assertEq(factoryRouter.moduleForSelector(0x3af32abf), factoryRouter.viewsModule()); // isWhitelisted(address)
        assertEq(factoryRouter.moduleForSelector(0x84953517), factoryRouter.viewsModule()); // maxActivePools()
        assertEq(factoryRouter.moduleForSelector(0x7a14ace1), factoryRouter.viewsModule()); // minimumCreationBondUsd()
        assertEq(factoryRouter.moduleForSelector(0x8da5cb5b), factoryRouter.viewsModule()); // owner()
        assertEq(factoryRouter.moduleForSelector(0x8456cb59), factoryRouter.adminModule()); // pause()
        assertEq(factoryRouter.moduleForSelector(0x5c975abb), factoryRouter.viewsModule()); // paused()
        assertEq(factoryRouter.moduleForSelector(0x286062b1), factoryRouter.viewsModule()); // pendingGovernanceTimelock()
        assertEq(factoryRouter.moduleForSelector(0xf525cb68), factoryRouter.viewsModule()); // poolCount()
        assertEq(factoryRouter.moduleForSelector(0xea2b31bc), factoryRouter.viewsModule()); // poolImplementationCodehash()
        assertEq(factoryRouter.moduleForSelector(0xac4afa38), factoryRouter.viewsModule()); // pools(uint256)
        assertEq(factoryRouter.moduleForSelector(0xf5d6ac90), factoryRouter.viewsModule()); // pythOracle()
        assertEq(factoryRouter.moduleForSelector(0x3bc536ad), factoryRouter.oracleModule()); // refreshERC4626VaultSharePriceReference(address)
        assertEq(factoryRouter.moduleForSelector(0xf904caaa), factoryRouter.oracleModule()); // registerERC4626Vault(address,address)
        assertEq(factoryRouter.moduleForSelector(0x8a90370a), factoryRouter.oracleModule()); // removeCompositeOracleTokenFeed(address)
        assertEq(factoryRouter.moduleForSelector(0x5c3e8dc2), factoryRouter.oracleModule()); // removeERC4626Vault(address)
        assertEq(factoryRouter.moduleForSelector(0x38c9e4b1), factoryRouter.oracleModule()); // removePythToken(address)
        assertEq(factoryRouter.moduleForSelector(0x5fa7b584), factoryRouter.lifecycleModule()); // removeToken(address)
        assertEq(factoryRouter.moduleForSelector(0x715018a6), factoryRouter.adminModule()); // renounceOwnership()
        assertEq(factoryRouter.moduleForSelector(0xd1036453), factoryRouter.oracleModule()); // scheduleCompositeOracleEmergencyCancelChallenge(address)
        assertEq(factoryRouter.moduleForSelector(0xd1df8c6d), factoryRouter.oracleModule()); // scheduleCompositeOracleForceResetToPrimary(address)
        assertEq(factoryRouter.moduleForSelector(0x37a5dbb8), factoryRouter.oracleModule()); // scheduleCompositeOracleTokenFeedRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0x0e6d9a37), factoryRouter.oracleModule()); // scheduleERC4626VaultRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0x73db04c3), factoryRouter.oracleModule()); // scheduleERC4626VaultSharePriceReferenceRefresh(address)
        assertEq(factoryRouter.moduleForSelector(0xb8f67ed5), factoryRouter.oracleModule()); // schedulePythTokenRemoval(address)
        assertEq(factoryRouter.moduleForSelector(0xdd98a885), factoryRouter.oracleModule()); // setCompositeOracle(address)
        assertEq(factoryRouter.moduleForSelector(0xfd268bc5), factoryRouter.oracleModule()); // setCompositeOracleAuthorizedCaller(address,bool)
        assertEq(factoryRouter.moduleForSelector(0x773e3cc3), factoryRouter.oracleModule()); // setCompositeOracleChallengeDuration(uint256)
        assertEq(factoryRouter.moduleForSelector(0xa11d3a00), factoryRouter.oracleModule()); // setCompositeOracleDeviationThreshold(uint256)
        assertEq(factoryRouter.moduleForSelector(0x775e7dac), factoryRouter.oracleModule()); // setCompositeOracleTokenFeed(address,address)
        assertEq(factoryRouter.moduleForSelector(0xe674d360), factoryRouter.oracleModule()); // setCompositeOracleTokenFeedDual(address,address,address)
        assertEq(factoryRouter.moduleForSelector(0x7f70999e), factoryRouter.adminModule()); // setDefaultProtocolFeeRecipient(address)
        assertEq(factoryRouter.moduleForSelector(0x1523f5c9), factoryRouter.oracleModule()); // setERC4626UnderlyingPriceOracle(address)
        assertEq(factoryRouter.moduleForSelector(0xf909f0e7), factoryRouter.oracleModule()); // setERC4626VaultSharePriceDeviation(address,uint256)
        assertEq(factoryRouter.moduleForSelector(0xc0615607), factoryRouter.adminModule()); // setGovernanceTimelock(address)
        assertEq(factoryRouter.moduleForSelector(0x305cdb8f), factoryRouter.oracleModule()); // setManagedERC4626OracleFeed(address)
        assertEq(factoryRouter.moduleForSelector(0x1ca89d48), factoryRouter.oracleModule()); // setManagedPythOracle(address)
        assertEq(factoryRouter.moduleForSelector(0x06c384e7), factoryRouter.adminModule()); // setMaxActivePools(uint256)
        assertEq(factoryRouter.moduleForSelector(0xa0cf5a28), factoryRouter.adminModule()); // setMinimumCreationBondUsd(uint256)
        assertEq(factoryRouter.moduleForSelector(0xd6f74898), factoryRouter.adminModule()); // setPoolImplementation(address)
        assertEq(factoryRouter.moduleForSelector(0xe208b51b), factoryRouter.oracleModule()); // setPythMaxCompositePublishTimeSkew(uint256)
        assertEq(factoryRouter.moduleForSelector(0x89384fde), factoryRouter.oracleModule()); // setPythMaxConfidenceBps(uint256)
        assertEq(factoryRouter.moduleForSelector(0x14e888c5), factoryRouter.oracleModule()); // setPythMaxEmaConfidenceBps(uint256)
        assertEq(factoryRouter.moduleForSelector(0xd2b3e87e), factoryRouter.oracleModule()); // setPythMaxPriceAge(uint256)
        assertEq(factoryRouter.moduleForSelector(0x23d2da04), factoryRouter.oracleModule()); // setPythMaxPriceAgeForFeedId(bytes32,uint256)
        assertEq(factoryRouter.moduleForSelector(0xf1b05627), factoryRouter.oracleModule()); // setPythMaxPriceAgeForToken(address,uint256)
        assertEq(factoryRouter.moduleForSelector(0x04039800), factoryRouter.oracleModule()); // setPythMaxPriceDeviation(uint256)
        assertEq(factoryRouter.moduleForSelector(0xa3ada9f0), factoryRouter.oracleModule()); // setPythTokenCompositePriceFeed(address,bytes32,bytes32)
        assertEq(factoryRouter.moduleForSelector(0xc1cbb6ee), factoryRouter.oracleModule()); // setPythTokenPriceFeed(address,bytes32)
        assertEq(factoryRouter.moduleForSelector(0xa6ee3e88), factoryRouter.adminModule()); // setTokenRequiresStrictProtectedPrice(address,bool)
        assertEq(factoryRouter.moduleForSelector(0xd287ccfa), factoryRouter.viewsModule()); // splitRiskPoolImplementation()
        assertEq(factoryRouter.moduleForSelector(0x5d61edf4), factoryRouter.adminModule()); // startPoolGovernanceTimelockTransfers(uint256,uint256)
        assertEq(factoryRouter.moduleForSelector(0xf5dab711), factoryRouter.viewsModule()); // tokenInfo(address)
        assertEq(factoryRouter.moduleForSelector(0x98a5bb55), factoryRouter.viewsModule()); // tokenRequiresStrictProtectedPrice(address)
        assertEq(factoryRouter.moduleForSelector(0x23394f0c), factoryRouter.oracleModule()); // transferManagedOracleOwnership(address,address)
        assertEq(factoryRouter.moduleForSelector(0xf2fde38b), factoryRouter.adminModule()); // transferOwnership(address)
        assertEq(factoryRouter.moduleForSelector(0x3f4ba83a), factoryRouter.adminModule()); // unpause()
        assertEq(factoryRouter.moduleForSelector(0xa23a6a54), factoryRouter.adminModule()); // updateMinimumCollateral(address,uint256)
        assertEq(factoryRouter.moduleForSelector(0x2154bc44), factoryRouter.viewsModule()); // whitelistedTokens(uint256)
    }
}
