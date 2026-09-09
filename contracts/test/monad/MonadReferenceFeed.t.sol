// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { MonadReferenceFeed, IMonadPyth } from "../../contracts/monad/MonadReferenceFeed.sol";
import { MonadWrappedNative } from "../../contracts/monad/MonadWrappedNative.sol";
import { MonadTestToken } from "../../contracts/monad/MonadTestToken.sol";
contract PythFixture is IMonadPyth {
 Price public spot; Price public ema;
 function set(Price memory s,Price memory e) external {spot=s;ema=e;}
 function getPriceUnsafe(bytes32) external view returns(Price memory){return spot;}
 function getEmaPriceUnsafe(bytes32) external view returns(Price memory){return ema;}
}
contract ShMonadFixture {
 uint256 public rate=12e18; uint256 public unstake=119e17;
 function set(uint256 r,uint256 u) external {rate=r;unstake=u;}
 function convertToAssets(uint256 shares) external view returns(uint256){return shares*rate/1e18;}
 function previewUnstake(uint256 shares) external view returns(uint256){return shares*unstake/1e18;}
}
contract MonadReferenceFeedTest is Test {
 PythFixture p;ShMonadFixture s;MonadWrappedNative w;MonadTestToken u;MonadReferenceFeed feed;
 function setUp() public {
  vm.chainId(10143);vm.warp(1788950000);p=new PythFixture();s=new ShMonadFixture();w=new MonadWrappedNative();u=new MonadTestToken("Test USD","TestUSDC",6,1000000e6,address(this));
  _price(2500000,100,-8,block.timestamp);feed=new MonadReferenceFeed(address(p),bytes32(uint256(1)),address(w),address(s),address(u));
 }
 function _price(int64 price,uint64 conf,int32 expo,uint256 time) internal {IMonadPyth.Price memory a=IMonadPyth.Price(price,conf,expo,time);p.set(a,a);}
 function testReferenceAndDelayedNavAreDifferentUnits() public view {assertEq(feed.getPrice(address(w)),2500000);assertEq(feed.getPrice(address(s)),29750000);assertEq(feed.getPrice(address(u)),1e8);}
 function testStaleAndFutureRejectWithoutSyntheticFallback() public {
  vm.warp(block.timestamp+121);vm.expectRevert(MonadReferenceFeed.UnavailablePrice.selector);feed.getPrice(address(w));
  (bool stale,)=feed.isPriceStale(address(s));assertTrue(stale);assertEq(feed.getPrice(address(u)),1e8);
  _price(2500000,100,-8,block.timestamp+1);vm.expectRevert(MonadReferenceFeed.UnavailablePrice.selector);feed.getPrice(address(w));
 }
 function testNonPositiveConfidenceAndExponentReject() public {
  _price(0,0,-8,block.timestamp);vm.expectRevert();feed.getPrice(address(w));
  _price(-1,0,-8,block.timestamp);vm.expectRevert();feed.getPrice(address(w));
  _price(2500000,30000,-8,block.timestamp);vm.expectRevert();feed.getPrice(address(w));
  _price(2500000,1,-19,block.timestamp);vm.expectRevert();feed.getPrice(address(w));
 }
 function testEmaDeviationRejectsAndUnsafeStillProtected() public {
  p.set(IMonadPyth.Price(2500000,10,-8,block.timestamp),IMonadPyth.Price(1000000,10,-8,block.timestamp));
  vm.expectRevert(MonadReferenceFeed.UnavailablePrice.selector);feed.getPriceUnsafe(address(w));
 }
 function testNavCapsUpwardManipulationAndReflectsSlashing() public {
  s.set(24e18,24e18);vm.expectRevert();feed.getPrice(address(s));
  s.set(6e18,59e17);assertEq(feed.getPrice(address(s)),14750000);
 }
 function testWrongChainAndUnsupportedToken() public {
  vm.expectRevert(MonadReferenceFeed.UnsupportedToken.selector);feed.getPrice(address(1));
  vm.chainId(143);vm.expectRevert(MonadReferenceFeed.InvalidConfiguration.selector);feed.getPrice(address(u));
  vm.expectRevert(MonadWrappedNative.TestnetOnly.selector);new MonadWrappedNative();
 }
 function testFuzzPriceNormalization(uint64 input) public {
  uint64 n=uint64(bound(input,1,1e15));_price(int64(n),0,-6,block.timestamp);assertEq(feed.getPrice(address(w)),uint256(n)*100);
 }
 function testWrapUnwrapBackedAndNoAuthorityMint() public {
  vm.deal(address(this),1e18);w.deposit{value:1e18}();assertEq(w.totalSupply(),address(w).balance);w.withdraw(4e17);assertEq(w.balanceOf(address(this)),6e17);assertEq(address(w).balance,6e17);
 }
 receive() external payable {}
}
