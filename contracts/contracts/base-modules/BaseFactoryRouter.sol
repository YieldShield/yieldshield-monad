// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
/// @notice Immutable dispatch preserving the original YieldShield ABI and storage.
/// @dev No routing changes, arbitrary delegate targets, or upgrades are available.
contract BaseFactoryRouter is Initializable {
    error UnknownSelector(bytes4 selector);
    error InvalidModule();
    error DelegatedUUID();
    error UpgradeDisabled();
    address private immutable SELF = address(this);
    address public immutable adminModule;
    address public immutable createModule;
    address public immutable lifecycleModule;
    address public immutable oracleModule;
    address public immutable viewsModule;
    constructor(address admin_, address create_, address lifecycle_, address oracle_, address views_) {
        if (admin_.code.length == 0) revert InvalidModule();
        adminModule = admin_;
        if (create_.code.length == 0) revert InvalidModule();
        createModule = create_;
        if (lifecycle_.code.length == 0) revert InvalidModule();
        lifecycleModule = lifecycle_;
        if (oracle_.code.length == 0) revert InvalidModule();
        oracleModule = oracle_;
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
            selector == 0xad88ca99 /* acceptPoolGovernanceTimelockTransfers(uint256,uint256) */ ||
            selector == 0x90cdd88e /* addToken(address,string,string,address,address,uint256,bool) */ ||
            selector == 0x3afef156 /* addTokenInitial(address,string,string,address,address,uint256,bool) */ ||
            selector == 0x2811062d /* assertPinnedPoolImplementation(address) */ ||
            selector == 0xf3d107ea /* cancelGovernanceTimelockTransfer() */ ||
            selector == 0x4f4781d7 /* cancelPoolGovernanceTimelockTransfers(uint256,uint256,address) */ ||
            selector == 0x06c7e131 /* finalizeBootstrap() */ ||
            selector == 0xc0c53b8b /* initialize(address,address,address) */ ||
            selector == 0x8456cb59 /* pause() */ ||
            selector == 0x715018a6 /* renounceOwnership() */ ||
            selector == 0x7f70999e /* setDefaultProtocolFeeRecipient(address) */ ||
            selector == 0xc0615607 /* setGovernanceTimelock(address) */ ||
            selector == 0x06c384e7 /* setMaxActivePools(uint256) */ ||
            selector == 0xa0cf5a28 /* setMinimumCreationBondUsd(uint256) */ ||
            selector == 0xd6f74898 /* setPoolImplementation(address) */ ||
            selector == 0xa6ee3e88 /* setTokenRequiresStrictProtectedPrice(address,bool) */ ||
            selector == 0x5d61edf4 /* startPoolGovernanceTimelockTransfers(uint256,uint256) */ ||
            selector == 0xf2fde38b /* transferOwnership(address) */ ||
            selector == 0x3f4ba83a /* unpause() */ ||
            selector == 0xa23a6a54 /* updateMinimumCollateral(address,uint256) */) return adminModule;
        if (selector == 0x5f3eb49f /* createPool(address,string,address,string,uint256,uint256,uint256,uint256) */ ||
            selector == 0xa5da154f /* createPoolWithAccessControl(address,string,address,string,uint256,uint256,uint256,uint256,address) */) return createModule;
        if (selector == 0x29d0cdf4 /* closePool(address) */ ||
            selector == 0x86a16f51 /* closePoolTo(address,address) */ ||
            selector == 0xdf0992af /* deactivateDustPool(address) */ ||
            selector == 0x65c05106 /* deactivatePool(address) */ ||
            selector == 0xe95dd336 /* deactivateProtectorOnlyPool(address) */ ||
            selector == 0x5fa7b584 /* removeToken(address) */) return lifecycleModule;
        if (selector == 0xba682cff /* cancelCompositeOracleScheduledOverride(address,bytes32) */ ||
            selector == 0x2ac90adb /* cancelScheduledCompositeOracleTokenFeedRemoval(address) */ ||
            selector == 0x5cd78327 /* cancelScheduledERC4626VaultRemoval(address) */ ||
            selector == 0x9844dfed /* cancelScheduledERC4626VaultSharePriceReferenceRefresh(address) */ ||
            selector == 0x038758c9 /* cancelScheduledPythTokenRemoval(address) */ ||
            selector == 0x4ae0d01a /* executeCompositeOracleEmergencyCancelChallenge(address) */ ||
            selector == 0x23c2063c /* executeCompositeOracleForceResetToPrimary(address) */ ||
            selector == 0x3bc536ad /* refreshERC4626VaultSharePriceReference(address) */ ||
            selector == 0xf904caaa /* registerERC4626Vault(address,address) */ ||
            selector == 0x8a90370a /* removeCompositeOracleTokenFeed(address) */ ||
            selector == 0x5c3e8dc2 /* removeERC4626Vault(address) */ ||
            selector == 0x38c9e4b1 /* removePythToken(address) */ ||
            selector == 0xd1036453 /* scheduleCompositeOracleEmergencyCancelChallenge(address) */ ||
            selector == 0xd1df8c6d /* scheduleCompositeOracleForceResetToPrimary(address) */ ||
            selector == 0x37a5dbb8 /* scheduleCompositeOracleTokenFeedRemoval(address) */ ||
            selector == 0x0e6d9a37 /* scheduleERC4626VaultRemoval(address) */ ||
            selector == 0x73db04c3 /* scheduleERC4626VaultSharePriceReferenceRefresh(address) */ ||
            selector == 0xb8f67ed5 /* schedulePythTokenRemoval(address) */ ||
            selector == 0xdd98a885 /* setCompositeOracle(address) */ ||
            selector == 0xfd268bc5 /* setCompositeOracleAuthorizedCaller(address,bool) */ ||
            selector == 0x773e3cc3 /* setCompositeOracleChallengeDuration(uint256) */ ||
            selector == 0xa11d3a00 /* setCompositeOracleDeviationThreshold(uint256) */ ||
            selector == 0x775e7dac /* setCompositeOracleTokenFeed(address,address) */ ||
            selector == 0xe674d360 /* setCompositeOracleTokenFeedDual(address,address,address) */ ||
            selector == 0x1523f5c9 /* setERC4626UnderlyingPriceOracle(address) */ ||
            selector == 0xf909f0e7 /* setERC4626VaultSharePriceDeviation(address,uint256) */ ||
            selector == 0x305cdb8f /* setManagedERC4626OracleFeed(address) */ ||
            selector == 0x1ca89d48 /* setManagedPythOracle(address) */ ||
            selector == 0xe208b51b /* setPythMaxCompositePublishTimeSkew(uint256) */ ||
            selector == 0x89384fde /* setPythMaxConfidenceBps(uint256) */ ||
            selector == 0x14e888c5 /* setPythMaxEmaConfidenceBps(uint256) */ ||
            selector == 0xd2b3e87e /* setPythMaxPriceAge(uint256) */ ||
            selector == 0x23d2da04 /* setPythMaxPriceAgeForFeedId(bytes32,uint256) */ ||
            selector == 0xf1b05627 /* setPythMaxPriceAgeForToken(address,uint256) */ ||
            selector == 0x04039800 /* setPythMaxPriceDeviation(uint256) */ ||
            selector == 0xa3ada9f0 /* setPythTokenCompositePriceFeed(address,bytes32,bytes32) */ ||
            selector == 0xc1cbb6ee /* setPythTokenPriceFeed(address,bytes32) */ ||
            selector == 0x23394f0c /* transferManagedOracleOwnership(address,address) */) return oracleModule;
        if (selector == 0xd6dd35ed /* DEFAULT_MINIMUM_CREATION_BOND_USD() */ ||
            selector == 0x2d01c134 /* ERC4626_ORACLE_FEED_ROLE() */ ||
            selector == 0x81358498 /* MAX_POOLS() */ ||
            selector == 0xa78aee25 /* PROTECTOR_ONLY_POOL_DEACTIVATION_DELAY() */ ||
            selector == 0x51c6d4db /* PYTH_ORACLE_ROLE() */ ||
            selector == 0xad3cb1cc /* UPGRADE_INTERFACE_VERSION() */ ||
            selector == 0x8348bce3 /* activePoolCount() */ ||
            selector == 0xf87793ad /* activePools(uint256) */ ||
            selector == 0x7bd51090 /* bootstrapModeEnabled() */ ||
            selector == 0x1783dd59 /* compositeOracle() */ ||
            selector == 0xf7970cdc /* creationBonds(address) */ ||
            selector == 0x07fd7503 /* defaultProtocolFeeRecipient() */ ||
            selector == 0x79abeb7c /* erc4626OracleFeed() */ ||
            selector == 0x8ec08354 /* getActivePools() */ ||
            selector == 0x2a9abc14 /* getActivePoolsInfo() */ ||
            selector == 0x06bfa938 /* getPoolInfo(address) */ ||
            selector == 0xbbe95837 /* getPools(uint256,uint256) */ ||
            selector == 0x3f42ba51 /* getPoolsInfo(uint256,uint256) */ ||
            selector == 0xe26f7900 /* getWhitelistedTokens() */ ||
            selector == 0x9a1fdd79 /* governanceTimelock() */ ||
            selector == 0xa711e6a1 /* isPoolActive(address) */ ||
            selector == 0x3af32abf /* isWhitelisted(address) */ ||
            selector == 0x84953517 /* maxActivePools() */ ||
            selector == 0x7a14ace1 /* minimumCreationBondUsd() */ ||
            selector == 0x8da5cb5b /* owner() */ ||
            selector == 0x5c975abb /* paused() */ ||
            selector == 0x286062b1 /* pendingGovernanceTimelock() */ ||
            selector == 0xf525cb68 /* poolCount() */ ||
            selector == 0xea2b31bc /* poolImplementationCodehash() */ ||
            selector == 0xac4afa38 /* pools(uint256) */ ||
            selector == 0xf5d6ac90 /* pythOracle() */ ||
            selector == 0xd287ccfa /* splitRiskPoolImplementation() */ ||
            selector == 0xf5dab711 /* tokenInfo(address) */ ||
            selector == 0x98a5bb55 /* tokenRequiresStrictProtectedPrice(address) */ ||
            selector == 0x2154bc44 /* whitelistedTokens(uint256) */) return viewsModule;
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
