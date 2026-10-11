// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

import { BaseProtectorRewardConservationTest } from "./BaseProtectorRewardConservation.t.sol";
import { stdStorage, StdStorage } from "forge-std/StdStorage.sol";
import { ConstantsLib } from "../../contracts/libraries/ConstantsLib.sol";

contract BaseCommissionReserveBoundsTest is BaseProtectorRewardConservationTest {
    using stdStorage for StdStorage;

    function _seedOverallocatedCurrentIndex() internal returns (uint256 historical) {
        oracle.setPrice(address(shielded), 2e8);
        _accrueFees(0, 4);
        historical = pool.accumulatedCommissions() - 10;
        stdstore.target(address(pool)).sig("currentEpochCommissionReserve()").checked_write(uint256(10));
        stdstore.target(address(pool)).sig("historicalCommissionReserve()").checked_write(historical);
        // Model a historical overallocated index independently of the fixed rounding path.
        stdstore.target(address(pool)).sig("rewardPerShareAccumulated()")
            .checked_write(ConstantsLib.REWARD_PRECISION);
    }

    function test_CurrentClaimCannotSpendAnotherEpochReserveEvenWithOverallocatedIndex() public {
        uint256 historical = _seedOverallocatedCurrentIndex();
        assertEq(pool.getClaimableCommission(protectorIds[0]), 10);
        uint256 beforeBalance = shielded.balanceOf(protectors[0]);
        vm.prank(protectors[0]);
        pool.claimCommission(protectorIds[0]);
        assertEq(shielded.balanceOf(protectors[0]) - beforeBalance, 10);
        assertEq(pool.currentEpochCommissionReserve(), 0);
        assertEq(pool.historicalCommissionReserve(), historical);
        assertEq(pool.accumulatedCommissions(), historical);
    }

    function test_CurrentForfeitureCannotReleaseAnotherEpochReserveEvenWithOverallocatedIndex() public {
        uint256 historical = _seedOverallocatedCurrentIndex();
        vm.prank(protectors[0]);
        pool.forfeitCommission(protectorIds[0]);
        assertEq(pool.currentEpochCommissionReserve(), 0);
        assertEq(pool.historicalCommissionReserve(), historical);
        assertEq(pool.accumulatedCommissions(), historical);
    }
}
