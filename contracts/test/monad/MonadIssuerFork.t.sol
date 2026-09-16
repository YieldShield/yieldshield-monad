// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import {Test} from "forge-std/Test.sol";
import {SplitRiskPoolFactory} from "../../contracts/SplitRiskPoolFactory.sol";
import {SplitRiskPool} from "../../contracts/SplitRiskPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
interface IFaucet {function requestFunds(address) external;function maxDripFrequency() external view returns(uint256);function lastDripTimestamp() external view returns(uint256);}
interface IWrapped {function deposit() external payable;function withdraw(uint256) external;}
/// @dev Explicit opt-in fork check; no broadcast, no invented issuer balances.
contract MonadIssuerForkTest is Test {
 function testIssuerTransfersAndWrappedMonRoundtrip() public {
  string memory url=vm.envOr("MONAD_FORK_RPC",string(""));if(bytes(url).length==0){vm.skip(true);return;}
  vm.createSelectFork(url);
  IERC20 a=IERC20(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC);
  IFaucet faucet=IFaucet(0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C);
  vm.warp(block.timestamp+faucet.maxDripFrequency()+1);
  uint256 before=a.balanceOf(address(this));faucet.requestFunds(address(this));uint256 acquired=a.balanceOf(address(this))-before;assertGt(acquired,500e6);
  a.approve(address(123),500e6);vm.prank(address(123));a.transferFrom(address(this),address(456),500e6);assertEq(a.balanceOf(address(this)),before+acquired-500e6);
  vm.prank(address(456));a.transfer(address(this),500e6);assertEq(a.balanceOf(address(this)),before+acquired);
  address w=0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541;vm.deal(address(this),1 ether);IWrapped(w).deposit{value:0.01 ether}();assertEq(IERC20(w).balanceOf(address(this)),0.01 ether);
  IWrapped(w).withdraw(0.01 ether);assertEq(IERC20(w).balanceOf(address(this)),0);assertEq(address(this).balance,1 ether);
 }
 function testExpandedFactoryCreatesAndFundsAnAusdPool() public {
  string memory url=vm.envOr("MONAD_FORK_RPC",string(""));if(bytes(url).length==0){vm.skip(true);return;}
  vm.createSelectFork(url);
  address actor=0xA437345Be29EC6802024A8e090E34b621b92E5E2;
  address ausd=0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC;
  address wrapped=0x23EA8b07fda821d2096dee02a3a662a5374B69Cb;
  SplitRiskPoolFactory factory=SplitRiskPoolFactory(payable(0xFd2Bd5adF1776c6da4eF6accCc49C1621aCE1410));
  vm.startPrank(actor);
  IERC20(ausd).approve(address(factory),500e6);
  SplitRiskPool pool=SplitRiskPool(payable(factory.createPool(wrapped,"WMON",ausd,"AUSD",1000,100,15000,500e6)));
  assertEq(pool.POOL_FACTORY(),address(factory));assertTrue(pool.requiresStrictProtectedBackingPrice());
  IERC20(ausd).approve(address(pool),2000e6);pool.depositBackingAsset(ausd,2000e6,2000e6);
  assertEq(IERC20(ausd).balanceOf(address(pool)),2000e6);
  IWrapped(wrapped).deposit{value:0.02 ether}();IERC20(wrapped).approve(address(pool),0.02 ether);
  uint256 receipt=pool.depositShieldedAsset(wrapped,0.01 ether,0.01 ether);
  uint256 before=IERC20(wrapped).balanceOf(actor);pool.shieldedWithdraw(receipt,wrapped,1);
  assertGt(IERC20(wrapped).balanceOf(actor),before);
  vm.stopPrank();
 }
 receive() external payable {}
}
