// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import {Test} from "forge-std/Test.sol";
import {SplitRiskPoolFactory} from "../../contracts/SplitRiskPoolFactory.sol";
contract MonadExpansionForkDebug is Test {
 function testCanonicalWrapperIsRejectedByExistingStaticProbes() public {
  string memory url=vm.envOr("MONAD_FORK_RPC",string(""));if(bytes(url).length==0){vm.skip(true);return;}
  vm.createSelectFork(url, 62958251);
  vm.expectRevert(bytes(""));
  vm.prank(0xA437345Be29EC6802024A8e090E34b621b92E5E2);
  SplitRiskPoolFactory(payable(0xFd2Bd5adF1776c6da4eF6accCc49C1621aCE1410)).addTokenInitial{gas: 16000000}(0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541,"Monad wrapped MON","WMON",0x49535Db43F42C29691Bdc2CFA813B163d0DA01c7,address(0),10000,true);
 }
}
