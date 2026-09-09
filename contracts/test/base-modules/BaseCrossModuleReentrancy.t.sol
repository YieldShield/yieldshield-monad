// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { BaseSplitRiskPoolAccountingTest } from "./BaseSplitRiskPoolAccounting.t.sol";
import { SplitRiskPool } from "../../contracts/SplitRiskPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CrossModuleReentrantDepositor is IERC721Receiver {
    SplitRiskPool immutable pool;
    IERC20 immutable backing;
    bytes4 public revertSelector;
    bool public callbackAttempted;
    bool public reentrySucceeded;
    constructor(SplitRiskPool pool_, IERC20 backing_) {pool=pool_;backing=backing_;}
    function deposit(uint256 amount) external returns(uint256) {
        backing.approve(address(pool),amount);
        return pool.depositBackingAsset(address(backing),amount,0);
    }
    function onERC721Received(address,address,uint256,bytes calldata) external returns(bytes4) {
        callbackAttempted=true;
        // Deposit executes in DepositsModule; fee payout dispatches to FeesModule.
        bytes memory result;
        (reentrySucceeded,result)=address(pool).call(abi.encodeCall(SplitRiskPool.payPoolFee,()));
        if(result.length>=4) {
            bytes4 selector;
            assembly("memory-safe") { selector := mload(add(result,32)) }
            revertSelector=selector;
        }
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract BaseCrossModuleReentrancyTest is BaseSplitRiskPoolAccountingTest {
    function testSharedReentrancyGuardBlocksEntryThroughDifferentModule() public {
        CrossModuleReentrantDepositor receiver=new CrossModuleReentrantDepositor(pool,IERC20(address(backingToken)));
        vm.prank(protector);
        backingToken.transfer(address(receiver),1000e18);
        uint256 initialBacking=pool.totalProtectorTokens();
        receiver.deposit(1000e18);
        assertTrue(receiver.callbackAttempted());
        assertFalse(receiver.reentrySucceeded());
        assertEq(receiver.revertSelector(),ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        assertEq(pool.totalProtectorTokens(),initialBacking+1000e18);
    }
}
