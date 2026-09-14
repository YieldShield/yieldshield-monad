// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;
import { Test } from "forge-std/Test.sol";
import { MonadRedstoneReferenceFeed } from "../../contracts/monad/MonadRedstoneReferenceFeed.sol";
import { ShMonadFixture } from "./MonadReferenceFeed.t.sol";
import { MonadWrappedNative } from "../../contracts/monad/MonadWrappedNative.sol";
import { MonadTestToken } from "../../contracts/monad/MonadTestToken.sol";

contract RedstoneFixture {
    uint8 public decimals = 8;
    string public description = "RedStone Price Feed for MON";
    uint80 public round = 1;
    int256 public answer = 2500000;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound = 1;

    constructor() {
        startedAt = block.timestamp;
        updatedAt = block.timestamp;
    }

    function set(uint80 r, int256 a, uint256 s, uint256 u, uint80 ar) external {
        round = r;
        answer = a;
        startedAt = s;
        updatedAt = u;
        answeredInRound = ar;
    }

    function identity(uint8 d, string memory s) external {
        decimals = d;
        description = s;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (round, answer, startedAt, updatedAt, answeredInRound);
    }
}

contract MonadRedstoneReferenceFeedTest is Test {
    RedstoneFixture r;
    ShMonadFixture s;
    MonadWrappedNative w;
    MonadTestToken u;
    MonadRedstoneReferenceFeed feed;

    function setUp() public {
        vm.chainId(10143);
        vm.warp(1789380000);
        r = new RedstoneFixture();
        s = new ShMonadFixture();
        w = new MonadWrappedNative();
        u = new MonadTestToken("Test USD", "TestUSDC", 6, 1e12, address(this));
        feed = new MonadRedstoneReferenceFeed(address(r), address(w), address(s), address(u));
    }

    function testPriceUnitsAndConservativeNav() public view {
        assertEq(feed.getPrice(address(w)), 2500000);
        assertEq(feed.getPrice(address(s)), 29750000);
        assertEq(feed.getPrice(address(u)), 1e8);
    }

    function testAllReadPathsRejectStaleRounds() public {
        vm.warp(block.timestamp + 121);
        vm.expectRevert();
        feed.getPrice(address(w));
        vm.expectRevert();
        feed.getPriceUnsafe(address(w));
        vm.expectRevert();
        feed.getPriceForFeeAccrual(address(s));
        vm.expectRevert();
        feed.getPriceWithStrictCircuitBreaker(address(w));
        (bool stale,) = feed.isPriceStale(address(s));
        assertTrue(stale);
        assertEq(feed.getPrice(address(u)), 1e8);
    }

    function testBoundaryAndPublishedTime() public {
        uint256 t = r.updatedAt();
        vm.warp(t + 120);
        assertEq(feed.getPrice(address(w)), 2500000);
        (bool stale, uint64 published) = feed.isPriceStale(address(w));
        assertFalse(stale);
        assertEq(published, t);
    }

    function testInvalidAndIncompleteRounds() public {
        uint256 t = block.timestamp;
        r.set(0, 1, t, t, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(2, 1, t, t, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(1, 0, t, t, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(1, -1, t, t, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(1, 1, t + 1, t + 1, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(1, 1, t + 1, t, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
        r.set(1, 1, 0, 0, 1);
        vm.expectRevert();
        feed.getPrice(address(w));
    }

    function testNavCapAndSlashing() public {
        s.set(24e18, 24e18);
        vm.expectRevert();
        feed.getPrice(address(s));
        s.set(6e18, 59e17);
        assertEq(feed.getPrice(address(s)), 14750000);
    }

    function testRejectWrongIdentityAndNetwork() public {
        r.identity(18, "RedStone Price Feed for MON");
        vm.expectRevert();
        new MonadRedstoneReferenceFeed(address(r), address(w), address(s), address(u));
        r.identity(8, "RedStone Price Feed for ETH");
        vm.expectRevert();
        new MonadRedstoneReferenceFeed(address(r), address(w), address(s), address(u));
        vm.expectRevert();
        feed.getPrice(address(1));
        vm.chainId(143);
        vm.expectRevert();
        feed.getPrice(address(u));
        assertFalse(feed.supportsStrictProtectedPrice(address(w)));
    }

    function testFuzzPositivePrice(uint64 price) public {
        price = uint64(bound(price, 1, type(uint64).max));
        r.set(1, int256(uint256(price)), block.timestamp, block.timestamp, 1);
        assertEq(feed.getPrice(address(w)), price);
    }
}
