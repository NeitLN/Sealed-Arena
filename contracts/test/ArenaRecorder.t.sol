// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {ArenaRecorder, IReputationPublisher} from "../src/ArenaRecorder.sol";

/// Stand-in for the AgentPolicy precompile, etched at its address in tests.
contract MockAgentPolicy {
    mapping(address => bool) public registered;
    mapping(address => uint256) public charged;

    function setAgent(address agent, bool on) external {
        registered[agent] = on;
    }

    /// Records a charge the way the chain rule does: before the coins leave.
    function charge(address agent, uint256 amount) external {
        charged[agent] += amount;
    }

    function isAgent(address agent) external view returns (bool) {
        return registered[agent];
    }

    function getSpend(address agent)
        external
        view
        returns (uint256 spentToday, uint64 dayIndex, uint256 totalCharged)
    {
        return (0, 0, charged[agent]);
    }
}

contract RecordingPublisher is IReputationPublisher {
    bytes public last;
    uint256 public count;

    function publish(bytes calldata message) external {
        last = message;
        count++;
    }
}

contract ArenaRecorderTest is Test {
    address internal constant POLICY = 0x0300000000000000000000000000000000000001;

    ArenaRecorder internal recorder;
    MockAgentPolicy internal policy;
    address internal admin = makeAddr("admin");
    address internal agent = makeAddr("agent");
    address internal stranger = makeAddr("stranger");
    address internal payee = makeAddr("payee");

    function setUp() public {
        vm.etch(POLICY, address(new MockAgentPolicy()).code);
        policy = MockAgentPolicy(POLICY);
        policy.setAgent(agent, true);
        vm.prank(admin);
        recorder = new ArenaRecorder();
        vm.warp(1_000_000);
    }

    function _enrollAndFund(uint256 amount) internal {
        vm.prank(admin);
        recorder.enroll(agent);
        vm.deal(admin, amount);
        vm.prank(admin);
        recorder.fund{value: amount}(agent);
    }

    /// A payment inside the mandate: the rule charges first, then the coins leave.
    function _pay(uint256 value, uint256 gasCharge) internal {
        policy.charge(agent, value + gasCharge);
        vm.prank(agent);
        (bool ok,) = payee.call{value: value}("");
        require(ok, "pay");
        // Gas actually burned is at most what was charged.
        vm.deal(agent, agent.balance - gasCharge / 2);
    }

    // ---- enrollment and funding ----------------------------------------------------

    function test_OnlyAdminEnrolls() public {
        vm.prank(stranger);
        vm.expectRevert(ArenaRecorder.NotAdmin.selector);
        recorder.enroll(agent);
    }

    function test_EnrollNeedsARegisteredAgent() public {
        vm.prank(admin);
        vm.expectRevert(ArenaRecorder.NotAnAgent.selector);
        recorder.enroll(stranger);
    }

    function test_EnrollTwiceReverts() public {
        vm.startPrank(admin);
        recorder.enroll(agent);
        vm.expectRevert(ArenaRecorder.AlreadyEnrolled.selector);
        recorder.enroll(agent);
        vm.stopPrank();
    }

    function test_FundSendsCoinsToTheAgentAndCountsThem() public {
        _enrollAndFund(10 ether);
        assertEq(agent.balance, 10 ether);
        assertEq(recorder.funded(agent), 10 ether);
    }

    function test_AnyoneCanFund() public {
        vm.prank(admin);
        recorder.enroll(agent);
        vm.deal(stranger, 1 ether);
        vm.prank(stranger);
        recorder.fund{value: 1 ether}(agent);
        assertEq(recorder.funded(agent), 1 ether);
    }

    function test_FundRevertsForAnAgentNotEnrolled() public {
        vm.deal(admin, 1 ether);
        vm.prank(admin);
        vm.expectRevert(ArenaRecorder.NotEnrolled.selector);
        recorder.fund{value: 1 ether}(agent);
    }

    function test_BalanceHeldAtEnrollmentCountsAsFunding() public {
        vm.deal(agent, 5 ether);
        _enrollAndFund(10 ether);
        assertEq(recorder.funded(agent), 15 ether);
        // So it cannot hide a leak: one wei leaving without a charge is a breach.
        vm.deal(agent, agent.balance - 1);
        recorder.checkpoint(agent);
        assertTrue(recorder.breached(agent));
    }

    function test_BalanceExactlyAtTheRequiredAmountIsNotABreach() public {
        _enrollAndFund(10 ether);
        policy.charge(agent, 1 ether);
        vm.deal(agent, 9 ether); // exactly funded - charged
        recorder.checkpoint(agent);
        assertFalse(recorder.breached(agent));
    }

    function test_OneWeiBelowTheRequiredAmountIsABreach() public {
        _enrollAndFund(10 ether);
        policy.charge(agent, 1 ether);
        vm.deal(agent, 9 ether - 1);
        recorder.checkpoint(agent);
        assertTrue(recorder.breached(agent));
    }

    function test_ChargesBeforeEnrollmentDoNotCount() public {
        policy.charge(agent, 5 ether);
        _enrollAndFund(10 ether);
        assertEq(recorder.accountedBalance(agent), 10 ether);
    }

    // ---- score ----------------------------------------------------------------------

    function test_ScoreIsBalanceTimesSecondsOverCheckpoints() public {
        _enrollAndFund(10 ether);
        vm.warp(block.timestamp + 100);
        recorder.checkpoint(agent);
        assertEq(recorder.score(agent), 10 ether * 100);

        _pay(1 ether, 0.01 ether); // accounted balance now 10 - 1.01
        vm.warp(block.timestamp + 50);
        recorder.checkpoint(agent);
        assertEq(recorder.score(agent), 10 ether * 100 + (10 ether - 1.01 ether) * 50);
    }

    function test_FundCheckpointsFirstSoEarlierTimeUsesTheEarlierBalance() public {
        _enrollAndFund(1 ether);
        vm.warp(block.timestamp + 10);
        vm.deal(admin, 9 ether);
        vm.prank(admin);
        recorder.fund{value: 9 ether}(agent);
        assertEq(recorder.score(agent), 1 ether * 10);
        vm.warp(block.timestamp + 10);
        recorder.checkpoint(agent);
        assertEq(recorder.score(agent), 1 ether * 10 + 10 ether * 10);
    }

    function test_DirectDepositsAreNotFundedAndDoNotRaiseTheScore() public {
        _enrollAndFund(1 ether);
        vm.deal(agent, agent.balance + 100 ether); // sent straight to the agent
        vm.warp(block.timestamp + 10);
        recorder.checkpoint(agent);
        assertEq(recorder.funded(agent), 1 ether);
        assertEq(recorder.score(agent), 1 ether * 10);
        assertFalse(recorder.breached(agent));
    }

    // ---- invariant ------------------------------------------------------------------

    function test_ValidPaymentsKeepTheInvariant() public {
        _enrollAndFund(10 ether);
        for (uint256 i; i < 5; i++) {
            _pay(0.5 ether, 0.01 ether);
            vm.warp(block.timestamp + 1);
            recorder.checkpoint(agent);
        }
        assertFalse(recorder.breached(agent));
        assertGt(recorder.score(agent), 0);
    }

    /// Any sequence of payments the rule charged for (charge >= coins that left) keeps the invariant.
    function testFuzz_ChargedPaymentsNeverBreak(uint64[8] memory values, uint32[8] memory gaps)
        public
    {
        _enrollAndFund(100 ether);
        for (uint256 i; i < values.length; i++) {
            uint256 value = uint256(values[i]) % 10 ether;
            if (value + 0.01 ether > agent.balance) break;
            _pay(value, 0.01 ether);
            vm.warp(block.timestamp + gaps[i]);
            recorder.checkpoint(agent);
            assertFalse(recorder.breached(agent));
        }
    }

    function test_CoinsLeavingWithoutAChargeBreakTheInvariant() public {
        _enrollAndFund(10 ether);
        vm.warp(block.timestamp + 10);
        recorder.checkpoint(agent);
        assertGt(recorder.score(agent), 0);

        // 1 coin leaves with no charge recorded by the rule.
        vm.prank(agent);
        (bool ok,) = payee.call{value: 1 ether}("");
        require(ok);

        vm.expectEmit(true, true, false, true, address(recorder));
        emit ArenaRecorder.Breach(agent, stranger, 9 ether, 10 ether);
        vm.prank(stranger);
        recorder.reportBreach(agent);

        assertTrue(recorder.breached(agent));
        assertEq(recorder.score(agent), 0);
        assertEq(recorder.finder(agent), stranger);
    }

    function test_CheckpointAloneRecordsTheBreachWithTheCaller() public {
        _enrollAndFund(10 ether);
        vm.deal(agent, 9 ether);
        vm.prank(stranger);
        recorder.checkpoint(agent);
        assertTrue(recorder.breached(agent));
        assertEq(recorder.finder(agent), stranger);
    }

    function test_ReportBreachWithoutABreachChangesNothingButTheScore() public {
        _enrollAndFund(10 ether);
        vm.warp(block.timestamp + 10);
        vm.prank(stranger);
        recorder.reportBreach(agent);
        assertFalse(recorder.breached(agent));
        assertEq(recorder.finder(agent), address(0));
        assertEq(recorder.score(agent), 10 ether * 10);
    }

    function test_ABreachIsFinal() public {
        _enrollAndFund(10 ether);
        vm.deal(agent, 1 ether);
        recorder.checkpoint(agent);
        assertTrue(recorder.breached(agent));

        // Coins come back: still breached, score stays zero, finder unchanged.
        vm.deal(agent, 100 ether);
        vm.warp(block.timestamp + 1000);
        vm.prank(stranger);
        recorder.reportBreach(agent);
        assertTrue(recorder.breached(agent));
        assertEq(recorder.score(agent), 0);
        assertEq(recorder.finder(agent), address(this));

        vm.deal(admin, 1 ether);
        vm.prank(admin);
        vm.expectRevert(ArenaRecorder.AlreadyBreached.selector);
        recorder.fund{value: 1 ether}(agent);
    }

    function test_CheckpointRevertsForAnAgentNotEnrolled() public {
        vm.expectRevert(ArenaRecorder.NotEnrolled.selector);
        recorder.checkpoint(agent);
    }

    // ---- publish --------------------------------------------------------------------

    function test_PublishSendsTheRecordThroughThePublisher() public {
        RecordingPublisher pub = new RecordingPublisher();
        vm.prank(admin);
        recorder.setPublisher(pub);
        _enrollAndFund(10 ether);
        vm.warp(block.timestamp + 10);

        recorder.publish(agent);
        assertEq(pub.count(), 1);
        assertEq(
            pub.last(), abi.encode(agent, 10 ether * 10, false, block.timestamp, block.chainid)
        );
    }

    function test_PublishWithoutAPublisherReverts() public {
        _enrollAndFund(1 ether);
        vm.expectRevert(ArenaRecorder.NoPublisher.selector);
        recorder.publish(agent);
    }

    function test_OnlyAdminSetsThePublisher() public {
        vm.prank(stranger);
        vm.expectRevert(ArenaRecorder.NotAdmin.selector);
        recorder.setPublisher(IReputationPublisher(address(1)));
    }
}
