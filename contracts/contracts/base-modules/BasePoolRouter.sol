// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
/// @notice Immutable dispatch preserving the original YieldShield ABI and storage.
/// @dev No routing changes, arbitrary delegate targets, or upgrades are available.
contract BasePoolRouter is Initializable {
    error UnknownSelector(bytes4 selector);
    error InvalidModule();
    error DelegatedUUID();
    error UpgradeDisabled();
    address private immutable SELF = address(this);
    address public immutable adminModule;
    address public immutable depositsModule;
    address public immutable feesModule;
    address public immutable initializeModule;
    address public immutable partialexitModule;
    address public immutable protectorModule;
    address public immutable shieldexitModule;
    address public immutable viewsModule;
    constructor(address admin_, address deposits_, address fees_, address initialize_, address partialexit_, address protector_, address shieldexit_, address views_) {
        if (admin_.code.length == 0) revert InvalidModule();
        adminModule = admin_;
        if (deposits_.code.length == 0) revert InvalidModule();
        depositsModule = deposits_;
        if (fees_.code.length == 0) revert InvalidModule();
        feesModule = fees_;
        if (initialize_.code.length == 0) revert InvalidModule();
        initializeModule = initialize_;
        if (partialexit_.code.length == 0) revert InvalidModule();
        partialexitModule = partialexit_;
        if (protector_.code.length == 0) revert InvalidModule();
        protectorModule = protector_;
        if (shieldexit_.code.length == 0) revert InvalidModule();
        shieldexitModule = shieldexit_;
        if (views_.code.length == 0) revert InvalidModule();
        viewsModule = views_;
        _disableInitializers();
    }
    function proxiableUUID() external view returns (bytes32) {
        if (address(this) != SELF) revert DelegatedUUID();
        return 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    }
    function upgradeToAndCall(address, bytes calldata) external payable { revert UpgradeDisabled(); }
    function moduleForSelector(bytes4 selector) public view returns (address) {
        if (selector == 0x314268cd /* acceptGovernanceTimelock() */ ||
            selector == 0x39a740c8 /* acceptGovernanceTimelockFromFactory(address) */ ||
            selector == 0x934b3aa0 /* cancelGovernanceTimelockFromFactory(address) */ ||
            selector == 0xf3d107ea /* cancelGovernanceTimelockTransfer() */ ||
            selector == 0x8456cb59 /* pause() */ ||
            selector == 0x1ba3be39 /* pauseFromFactory() */ ||
            selector == 0x77dfeccb /* refreshStrictProtectedBackingPriceFlag() */ ||
            selector == 0x715018a6 /* renounceOwnership() */ ||
            selector == 0x82069735 /* resetShieldedTokenTransferIntegrity(uint256) */ ||
            selector == 0x19129e5a /* setAccessControl(address) */ ||
            selector == 0xc0615607 /* setGovernanceTimelock(address) */ ||
            selector == 0x15da151f /* setGovernanceTimelockFromFactory(address) */ ||
            selector == 0x19c5da60 /* setPoolFeeRecipient(address) */ ||
            selector == 0xb5b64c1f /* setProtectorTransferLockPeriod(uint256) */ ||
            selector == 0x30b77938 /* setShieldTransferLockPeriod(uint256) */ ||
            selector == 0xbebbf88f /* sweepInactiveProtectorBackingDustFromFactory() */ ||
            selector == 0xcf5e5ef8 /* sweepUnaccountedSurplusFromFactory() */ ||
            selector == 0xf2fde38b /* transferOwnership(address) */ ||
            selector == 0x3f4ba83a /* unpause() */ ||
            selector == 0x7e28f55f /* updatePoolConfig(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,address,address) */) return adminModule;
        if (selector == 0xde641404 /* depositBackingAsset(address,uint256,uint256) */ ||
            selector == 0x693b593f /* depositShieldedAsset(address,uint256,uint256) */) return depositsModule;
        if (selector == 0x8eca493a /* claimCommission(uint256) */ ||
            selector == 0xdefb5f40 /* claimExpiredProtectorBacking(uint256,uint256) */ ||
            selector == 0xba0a2291 /* escrowExpiredProtectorCommission(uint256) */ ||
            selector == 0x1c559b15 /* forfeitCommission(uint256) */ ||
            selector == 0x45cee6fd /* payPoolFee() */ ||
            selector == 0xd5c20fa2 /* payProtocolFee() */ ||
            selector == 0x7dabe8c7 /* settleExpiredProtectorBacking(uint256,uint256) */ ||
            selector == 0xb5a54433 /* settleExpiredProtectorPosition(uint256) */) return feesModule;
        if (selector == 0xc08ab485 /* initialize((string,string,address,address,address,uint256),(string,string,address,address,address,uint256),uint256,uint256,address,uint256,address,address,address,address,address,address) */ ||
            selector == 0xf0101d6b /* initializeWithAccessControl((string,string,address,address,address,uint256),(string,string,address,address,address,uint256),uint256,uint256,address,uint256,address,address,address,address,address,address,address) */) return initializeModule;
        if (selector == 0x0962ef79 /* claimRewards(uint256) */ ||
            selector == 0xb8298574 /* partialWithdrawShielded(uint256,uint256,address,uint256) */) return partialexitModule;
        if (selector == 0x045d653c /* cancelUnlockProcess(uint256) */ ||
            selector == 0x37b840ef /* protectorWithdraw(uint256,uint256,address,uint256) */ ||
            selector == 0x9ae78abc /* startUnlockProcess(uint256) */) return protectorModule;
        if (selector == 0xa533039e /* shieldedWithdraw(uint256,address,uint256) */) return shieldexitModule;
        if (selector == 0xc127ffd1 /* BACKING_TOKEN() */ ||
            selector == 0xd9e69a05 /* COLLATERAL_RATIO() */ ||
            selector == 0x1a454ea6 /* COMMISSION_RATE() */ ||
            selector == 0x0ba2a91e /* POOL_CREATOR() */ ||
            selector == 0xd8e31608 /* POOL_FACTORY() */ ||
            selector == 0xdd1b9c4a /* POOL_FEE() */ ||
            selector == 0x374b9af2 /* SHIELDED_TOKEN() */ ||
            selector == 0xad3cb1cc /* UPGRADE_INTERFACE_VERSION() */ ||
            selector == 0x13007d55 /* accessControl() */ ||
            selector == 0x72ee6f74 /* accessControlCanGateWithdrawals() */ ||
            selector == 0xd26c8b6a /* accumulatedCommissions() */ ||
            selector == 0xeec21569 /* accumulatedPoolFee() */ ||
            selector == 0xa544a62c /* accumulatedProtocolFee() */ ||
            selector == 0x4d3a27bb /* backingTokenDecimals() */ ||
            selector == 0x854b58ac /* backingTokenScale() */ ||
            selector == 0x999e7f0e /* commissionsClaimed(uint256) */ ||
            selector == 0xa4778e88 /* currentEpochCommissionReserve() */ ||
            selector == 0x43d064e3 /* feeValueBaselineUsd(uint256) */ ||
            selector == 0x0bb8d29b /* getAccessControlStatus() */ ||
            selector == 0x0112ddc3 /* getAvailableForWithdrawal(uint256) */ ||
            selector == 0x3fd47997 /* getClaimableCommission(uint256) */ ||
            selector == 0xf593b3fe /* getExpiredProtectorBackingClaim(uint256) */ ||
            selector == 0xfcb40fd4 /* getLockedAmount(uint256) */ ||
            selector == 0x9c84cd10 /* getOracleInfo() */ ||
            selector == 0x52375bb1 /* getPoolBalances() */ ||
            selector == 0xb517dcf1 /* getProtectorDepositInfo(uint256) */ ||
            selector == 0x4d7848f4 /* getProtectorPositionAmount(uint256) */ ||
            selector == 0x9fb68992 /* getReservedFees() */ ||
            selector == 0xc11a7233 /* getShieldDepositInfo(uint256) */ ||
            selector == 0x155bb24a /* getUserNFTCounts(address) */ ||
            selector == 0x23a216c1 /* getUtilizationRatio() */ ||
            selector == 0x3087c141 /* getUtilizationRatioUsd() */ ||
            selector == 0xbe788e70 /* getWithdrawableBalance() */ ||
            selector == 0x9d8439f2 /* governanceAccessControlInstalled() */ ||
            selector == 0x9a1fdd79 /* governanceTimelock() */ ||
            selector == 0xa089e9fe /* hasEverLaunched() */ ||
            selector == 0xb10fe7ee /* historicalCommissionReserve() */ ||
            selector == 0x464b4158 /* isAssetSupported(address) */ ||
            selector == 0x56a28880 /* lastClaimRewardsTime(uint256) */ ||
            selector == 0x8da5cb5b /* owner() */ ||
            selector == 0x5c975abb /* paused() */ ||
            selector == 0x286062b1 /* pendingGovernanceTimelock() */ ||
            selector == 0x65a61885 /* pendingProtectorRewardDust() */ ||
            selector == 0x9695e195 /* poolConfig() */ ||
            selector == 0x75f678a0 /* poolFeeRecipient() */ ||
            selector == 0x641ad8a9 /* poolState() */ ||
            selector == 0x5fabc466 /* protectorEpochBackingPositionSettled(uint256) */ ||
            selector == 0x3efdebef /* protectorEpochBackingRemainingReserve(uint256) */ ||
            selector == 0xbc2b6abc /* protectorEpochBackingRemainingShares(uint256) */ ||
            selector == 0x3683960f /* protectorEpochFinalRewardPerShare(uint256) */ ||
            selector == 0x5229b221 /* protectorEpochPositionSettled(uint256) */ ||
            selector == 0x322bede5 /* protectorEpochRemainingReserve(uint256) */ ||
            selector == 0x1675b9d9 /* protectorEpochRemainingShares(uint256) */ ||
            selector == 0x57eb4917 /* protectorReceiptNFT() */ ||
            selector == 0x48e4c845 /* protectorShareEpoch() */ ||
            selector == 0x359fe59c /* protectorShareEpochs(uint256) */ ||
            selector == 0x61b1bedb /* protectorShares(uint256) */ ||
            selector == 0x5a7ecfc4 /* requiresStrictProtectedBackingPrice() */ ||
            selector == 0xf3371e9a /* rewardDebt(uint256) */ ||
            selector == 0x33590f0b /* rewardPerShareAccumulated() */ ||
            selector == 0x06a4f15f /* shieldReceiptNFT() */ ||
            selector == 0x36fbd23d /* shieldedTokenDecimals() */ ||
            selector == 0x2d6b6a53 /* shieldedTokenScale() */ ||
            selector == 0x87012bdf /* shieldedTokenTransferIntegrityBroken() */ ||
            selector == 0xfb7862fb /* shieldedTransferIntegrityProbe() */ ||
            selector == 0x5f5d2f87 /* totalCommissionsEverAccumulated() */ ||
            selector == 0xf288576f /* totalProtectorShares() */ ||
            selector == 0x239507e5 /* totalProtectorTokens() */ ||
            selector == 0xa05be747 /* totalShieldCollateralAmount() */ ||
            selector == 0x6e16d467 /* totalShieldedTokens() */ ||
            selector == 0x9dc25ce0 /* totalValueAtDeposit() */) return viewsModule;
        revert UnknownSelector(selector);
    }
    fallback() external payable {
        address target = moduleForSelector(msg.sig);
        assembly ("memory-safe") {
            calldatacopy(0, 0, calldatasize())
            let success := delegatecall(gas(), target, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch success case 0 { revert(0, returndatasize()) } default { return(0, returndatasize()) }
        }
    }
}
