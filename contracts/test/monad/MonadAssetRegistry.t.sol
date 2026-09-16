// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import {Test} from "forge-std/Test.sol";
import {MonadAssetRegistry} from "../../contracts/monad/MonadAssetRegistry.sol";
import {MonadTestToken} from "../../contracts/monad/MonadTestToken.sol";
contract PriceFixture {
    bool public stale; uint256 public price=2500000;
    function set(bool s,uint256 p) external {stale=s;price=p;}
    function getPriceWithStrictCircuitBreaker(address) external view returns(uint256){require(!stale);return price;}
    function isPriceStale(address) external view returns(bool,uint64){return(stale,uint64(block.timestamp));}
}
contract MonadAssetRegistryTest is Test {
    MonadAssetRegistry r; MonadTestToken protectedToken; MonadTestToken backing; PriceFixture source;
    function setUp() public {
        vm.chainId(10143);source=new PriceFixture();
        protectedToken=new MonadTestToken("Wrapped","W",18,1e21,address(this));backing=new MonadTestToken("Test dollar","T",6,1e12,address(this));
        MonadAssetRegistry.AssetConfig[] memory a=new MonadAssetRegistry.AssetConfig[](2);
        a[0]=MonadAssetRegistry.AssetConfig(address(protectedToken),address(source),address(protectedToken),1);
        a[1]=MonadAssetRegistry.AssetConfig(address(backing),address(0),address(0),2);r=new MonadAssetRegistry(a);
    }
    function testRolesAndPrices() public view {assertTrue(r.canProtect(address(protectedToken)));assertFalse(r.canBack(address(protectedToken)));assertTrue(r.canBack(address(backing)));assertEq(r.getPrice(address(protectedToken)),2500000);assertEq(r.getPrice(address(backing)),1e8);}
    function testRejectsUnavailableAcrossEveryPricePath() public {source.set(true,2500000);vm.expectRevert();r.getPrice(address(protectedToken));vm.expectRevert();r.getPriceUnsafe(address(protectedToken));vm.expectRevert();r.getPriceForFeeAccrual(address(protectedToken));vm.expectRevert();r.getPriceWithStrictCircuitBreaker(address(protectedToken));(bool stale,)=r.isPriceStale(address(protectedToken));assertTrue(stale);source.set(false,0);vm.expectRevert();r.getPrice(address(protectedToken));}
    function testWrongChainAndChangedCode() public {vm.chainId(143);vm.expectRevert();r.getPrice(address(backing));vm.chainId(10143);vm.etch(address(protectedToken),hex"60006000f3");vm.expectRevert();r.canProtect(address(protectedToken));}
    function testRejectUnregisteredAndDuplicateAssets() public {vm.expectRevert();r.getPrice(address(123));MonadAssetRegistry.AssetConfig[] memory a=new MonadAssetRegistry.AssetConfig[](2);a[0]=MonadAssetRegistry.AssetConfig(address(backing),address(0),address(0),2);a[1]=a[0];vm.expectRevert();new MonadAssetRegistry(a);}
}
