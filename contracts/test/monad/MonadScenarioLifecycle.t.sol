// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { BaseModuleTestDeploy } from "../base-modules/BaseModuleTestDeploy.sol";
import { MonadTestToken } from "../../contracts/monad/MonadTestToken.sol";
import { MonadScenarioOracle } from "../../contracts/monad/MonadScenarioOracle.sol";
import { MonadAssetOracle } from "../../contracts/monad/MonadAssetOracle.sol";
import { MonadAssetExchange } from "../../contracts/monad/MonadAssetExchange.sol";
import { MonadVaultBackingFeed } from "../../contracts/monad/MonadVaultBackingFeed.sol";
import { MonadYieldVault } from "../../contracts/monad/MonadYieldVault.sol";
import { ERC4626OracleFeed } from "../../contracts/oracles/ERC4626OracleFeed.sol";
import { CompositeOracle } from "../../contracts/oracles/CompositeOracle.sol";
import { MonadPoolInitializeModule } from "../../contracts/monad/MonadPoolInitializeModule.sol";
import { BasePoolRouter } from "../../contracts/base-modules/BasePoolRouter.sol";
import { SplitRiskPool } from "../../contracts/SplitRiskPool.sol";
import { SplitRiskPoolFactory } from "../../contracts/SplitRiskPoolFactory.sol";
import { YSTimelockController } from "../../contracts/governance/YSTimelockController.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
contract MonadScenarioLifecycleTest is Test {
 MonadTestToken usd; MonadTestToken stock; MonadTestToken weth; MonadTestToken btc;
 MonadYieldVault vu; MonadYieldVault vw; MonadScenarioOracle price; ERC4626OracleFeed nav;
 MonadAssetExchange exchange; SplitRiskPool pool; MonadVaultBackingFeed backingFeed; address constant USER=address(0xA11CE);
 function onERC721Received(address,address,uint256,bytes calldata) external pure returns(bytes4){return this.onERC721Received.selector;}
 function setUp() public {
  vm.chainId(10143);
  usd=new MonadTestToken("Test USD","TestUSDC",6,10000000e6,address(this));
  weth=new MonadTestToken("Test WETH","tWETH",18,1000000e18,address(this));
  btc=new MonadTestToken("Test cbBTC","tcbBTC",8,1000000e8,address(this));
  stock=new MonadTestToken("Test Apple","tAAPLc",8,1000000e8,address(this));
  address[] memory assets=new address[](3);assets[0]=address(weth);assets[1]=address(btc);assets[2]=address(stock);
  uint256[] memory prices=new uint256[](3);prices[0]=3200e8;prices[1]=100000e8;prices[2]=200e8;
  price=new MonadScenarioOracle(address(usd),assets,prices,7200);
  vu=new MonadYieldVault(address(usd),"Test USD Yield Vault","vUSDC");
  vw=new MonadYieldVault(address(weth),"Test WETH Yield Vault","vWETH");
  usd.approve(address(vu),type(uint256).max);weth.approve(address(vw),type(uint256).max);
  vu.deposit(500000e6,address(this));vw.deposit(100000e18,address(this));
  vu.transfer(address(0xdead),2000e6);vw.transfer(address(0xdead),2000e18);
  nav=new ERC4626OracleFeed(address(price));nav.setSequencerUptimeFeedRequired(false);nav.registerVault(address(vu),address(usd));nav.registerVault(address(vw),address(weth));
  address[] memory all=new address[](4);address[] memory feeds=new address[](4);
  all[0]=address(weth);all[1]=address(btc);all[2]=address(vw);all[3]=address(vu);
  feeds[0]=address(price);feeds[1]=address(price);feeds[2]=address(nav);feeds[3]=address(nav);
  exchange=new MonadAssetExchange(address(new MonadAssetOracle(address(usd),all,feeds)));
  usd.transfer(address(exchange),1000000e6);weth.transfer(address(exchange),100e18);btc.transfer(address(exchange),100e8);vw.transfer(address(exchange),100e18);vu.transfer(address(exchange),10000e6);
 }
 function testMixedDecimalQuotesAndNativeUnitLimits() public {
  (uint256 w,,)=exchange.quote(address(weth),true,1e17);assertEq(w,320960000);
  (uint256 b,,)=exchange.quote(address(btc),true,100000);assertEq(b,100300000);
  assertEq(exchange.maxAssetAmount(address(weth)),25e18);assertEq(exchange.maxAssetAmount(address(btc)),25e8);
  usd.approve(address(exchange),w+b);exchange.swap(address(weth),true,1e17,w,block.timestamp+60);exchange.swap(address(btc),true,100000,b,block.timestamp+60);
  weth.approve(address(exchange),1e17);(uint256 out,,)=exchange.quote(address(weth),false,1e17);assertEq(out,319040000);exchange.swap(address(weth),false,1e17,out,block.timestamp+60);
 }
 function testBackedYieldConversionAndNoDonationPriceManipulation() public {
  uint256 shares=vu.deposit(1000e6,USER);uint256 before=vu.convertToAssets(shares);
  vu.fundTestYield(500e6);assertGt(vu.convertToAssets(shares),before);
  assertEq(usd.balanceOf(address(vu)),vu.totalAssets());
  uint256 p=nav.getPriceForFeeAccrual(address(vu));assertGt(p,1e8);assertLt(p,101e6);
  uint256 recorded=vu.totalAssets();usd.transfer(address(vu),100000e6);assertEq(vu.totalAssets(),recorded);assertEq(nav.getPriceForFeeAccrual(address(vu)),p);
  vm.prank(USER);uint256 received=vu.redeem(shares,USER,USER);assertGt(received,1000e6);assertEq(usd.balanceOf(USER),received);
  vw.fundTestYield(100e18);assertGt(nav.getPriceForFeeAccrual(address(vw)),3200e8);
 }
 function testFundedYieldCannotExceedDemoReferenceBudget() public {
  for(uint256 i;i<20;++i)vu.fundTestYield(500e6);
  assertLt(nav.getPrice(address(vu)),105e6);
  vm.expectRevert(MonadYieldVault.InvalidYield.selector);vu.fundTestYield(500e6);
 }
 function buildPool(bool useStock) internal {
  address[] memory controllers=new address[](1);controllers[0]=address(this);
  YSTimelockController timelock=new YSTimelockController(2 days,controllers,controllers,address(this));
  timelock.renounceRole(timelock.DEFAULT_ADMIN_ROLE(),address(this));
  BasePoolRouter original=BasePoolRouter(payable(BaseModuleTestDeploy.pool(vm)));
  BasePoolRouter router=new BasePoolRouter(original.adminModule(),original.depositsModule(),original.feesModule(),address(new MonadPoolInitializeModule(original.initializeModule(),address(weth),address(stock),address(btc),address(usd),address(vu))),original.partialexitModule(),original.protectorModule(),original.shieldexitModule(),original.viewsModule());
  SplitRiskPoolFactory factory=SplitRiskPoolFactory(payable(address(new ERC1967Proxy(BaseModuleTestDeploy.factory(vm),abi.encodeCall(SplitRiskPoolFactory.initialize,(address(this),address(timelock),address(router)))))));
  CompositeOracle composite=new CompositeOracle();composite.transferOwnership(address(factory));factory.setCompositeOracle(address(composite));factory.setDefaultProtocolFeeRecipient(address(timelock));
  factory.addTokenInitial(address(weth),weth.name(),weth.symbol(),address(price),address(0),10000,true);
  factory.addTokenInitial(address(stock),stock.name(),stock.symbol(),address(price),address(0),10000,true);
  backingFeed=new MonadVaultBackingFeed(address(nav),address(vu));
  factory.addTokenInitial(address(vu),vu.name(),vu.symbol(),address(backingFeed),address(0),10000,true);
  factory.setTokenRequiresStrictProtectedPrice(address(vu),true);factory.finalizeBootstrap();factory.transferOwnership(address(timelock));
  vu.approve(address(factory),1000e6);pool=SplitRiskPool(payable(factory.createPool(useStock?address(stock):address(weth),useStock?stock.symbol():weth.symbol(),address(vu),vu.symbol(),1000,100,15000,1000e6)));
  assertEq(uint256(vm.load(address(pool),bytes32(uint256(55)))),60,"minimum time slot");
  assertEq(uint256(vm.load(address(pool),bytes32(uint256(56)))),120,"junior notice slot");
  vu.approve(address(pool),50000e6);pool.depositBackingAsset(address(vu),50000e6,50000e6);
  weth.transfer(USER,1e18);
 }
 function testVaultCollateralBothSeniorExitsAndJuniorLifecycle() public {
  buildPool(false);vm.startPrank(USER);weth.approve(address(pool),1e18);
  uint256 keep=pool.depositShieldedAsset(address(weth),1e17,1e17);uint256 protectedId=pool.depositShieldedAsset(address(weth),1e17,1e17);
  uint256 before=weth.balanceOf(USER);pool.shieldedWithdraw(keep,address(weth),1);assertEq(weth.balanceOf(USER)-before,1e17);vm.stopPrank();
  vu.fundTestYield(500e6);vm.warp(uint256(price.epoch())+5400);
  uint256 expected=320e8*1e6/backingFeed.getPrice(address(vu));
  vm.prank(USER);pool.shieldedWithdraw(protectedId,address(vu),expected);assertEq(vu.balanceOf(USER),expected);assertEq(usd.balanceOf(USER),0);
  // Payout is shares, not automatic USD redemption; redemption is a separate holder action.
  vm.prank(USER);vu.redeem(expected,USER,USER);assertLe(usd.balanceOf(USER),320e6);assertApproxEqAbs(usd.balanceOf(USER),320e6,2);
  vu.transfer(USER,1000e6);vm.startPrank(USER);vu.approve(address(pool),1000e6);uint256 junior=pool.depositBackingAsset(address(vu),1000e6,1000e6);pool.startUnlockProcess(junior);vm.warp(block.timestamp+120);pool.protectorWithdraw(junior,999e6,address(vu),999e6);vm.stopPrank();assertGt(vu.balanceOf(USER),0);
 }
 function testEightDecimalScenarioAcceptsVaultCollateral() public {
  buildPool(true);stock.transfer(USER,2e8);vm.startPrank(USER);stock.approve(address(pool),2e8);
  uint256 keep=pool.depositShieldedAsset(address(stock),1e8,1e8);uint256 exitId=pool.depositShieldedAsset(address(stock),1e8,1e8);
  pool.shieldedWithdraw(keep,address(stock),1e8);assertEq(stock.balanceOf(USER),1e8);vm.stopPrank();
  vu.fundTestYield(500e6);vm.warp(uint256(price.epoch())+5400);
  uint256 expected=200e8*1e6/backingFeed.getPrice(address(vu));
  vm.prank(USER);pool.shieldedWithdraw(exitId,address(vu),expected);assertEq(vu.balanceOf(USER),expected);
 }
}
