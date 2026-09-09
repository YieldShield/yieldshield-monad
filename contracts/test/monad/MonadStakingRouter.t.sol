// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MonadStakingRouter} from "../../contracts/monad/MonadStakingRouter.sol";
contract NativeStakingFixture is ERC20 {
 constructor() ERC20("Staking fixture","s"){}
 function deposit(uint256 assets,address receiver) external payable returns(uint256 shares){require(msg.value==assets);shares=assets/12;_mint(receiver,shares);}
}
contract MonadStakingRouterTest is Test {
 NativeStakingFixture lst;MonadStakingRouter router;
 function setUp() public {vm.chainId(10143);lst=new NativeStakingFixture();router=new MonadStakingRouter(address(lst));vm.deal(address(this),12e18);}
 function testNativeInputAndMinimumShares() public {router.stake{value:12e18}(1e18,block.timestamp+60);assertEq(lst.balanceOf(address(this)),1e18);assertEq(lst.balanceOf(address(router)),0);assertEq(address(router).balance,0);}
 function testSlippageRevertsAtomically() public {vm.expectRevert();router.stake{value:12e18}(1e18+1,block.timestamp+60);assertEq(lst.totalSupply(),0);assertEq(address(this).balance,12e18);}
 function testDeadlineAndWrongChain() public {vm.expectRevert();router.stake{value:1e18}(1,block.timestamp+601);vm.chainId(143);vm.expectRevert();router.stake{value:1e18}(1,block.timestamp+60);}
}
