// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {Test} from "forge-std/Test.sol";
import {ReputationReceiver} from "../src/ReputationReceiver.sol";
import {
    TeleporterPublisher,
    TeleporterMessageInput,
    TeleporterFeeInfo
} from "../src/TeleporterPublisher.sol";

/// Records what the publisher asked Teleporter to send.
contract MockMessenger {
    TeleporterMessageInput public last;
    uint256 public sent;

    function sendCrossChainMessage(TeleporterMessageInput calldata input)
        external
        returns (bytes32)
    {
        last = input;
        sent++;
        return keccak256(abi.encode(sent));
    }

    function lastMessage() external view returns (bytes memory) {
        return last.message;
    }
}

/// Records giveFeedback calls the way the ERC-8004 ReputationRegistry receives them.
contract MockReputation {
    struct Call {
        address from;
        uint256 agentId;
        int128 value;
        string tag1;
        string tag2;
        bytes32 hash;
    }

    Call[] public calls;

    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8,
        string calldata tag1,
        string calldata tag2,
        string calldata,
        string calldata,
        bytes32 feedbackHash
    ) external {
        calls.push(Call(msg.sender, agentId, value, tag1, tag2, feedbackHash));
    }

    function count() external view returns (uint256) {
        return calls.length;
    }
}

contract ReputationTest is Test {
    bytes32 internal constant SEALED = keccak256("sealed-l1");
    bytes32 internal constant C_CHAIN = keccak256("c-chain");
    address internal agent = makeAddr("agent");
    address internal owner = makeAddr("owner");
    address internal recorder = makeAddr("recorder");
    address internal origin = makeAddr("publisher on the L1");

    MockMessenger internal messenger;
    MockReputation internal reputation;
    ReputationReceiver internal receiver;

    function setUp() public {
        messenger = new MockMessenger();
        reputation = new MockReputation();
        vm.prank(owner);
        receiver = new ReputationReceiver(address(messenger), SEALED, origin, address(reputation));
        vm.prank(owner);
        receiver.setAgentId(agent, 7);
    }

    function _msg(uint256 score, bool breached, uint256 checkpoint)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(agent, score, breached, checkpoint, uint256(261126));
    }

    function _deliver(bytes32 source, address from, bytes memory m) internal {
        vm.prank(address(messenger));
        receiver.receiveTeleporterMessage(source, from, m);
    }

    // ---- receiver ---------------------------------------------------------------------

    function test_RecordsSurvivalAsFeedback() public {
        bytes memory m = _msg(36_000 ether, false, 100);
        _deliver(SEALED, origin, m);
        (
            address from,
            uint256 id,
            int128 value,
            string memory tag1,
            string memory tag2,
            bytes32 h
        ) = reputation.calls(0);
        assertEq(from, address(receiver));
        assertEq(id, 7);
        assertEq(value, 10); // 36000 coin·seconds = 10 coin·hours
        assertEq(tag1, "sealed-arena");
        assertEq(tag2, "survival");
        assertEq(h, keccak256(m));
        assertEq(receiver.lastCheckpoint(agent), 100);
    }

    function test_RecordsABreachAsNegative() public {
        _deliver(SEALED, origin, _msg(0, true, 200));
        (,, int128 value,, string memory tag2,) = reputation.calls(0);
        assertEq(value, -1);
        assertEq(tag2, "breached");
    }

    function test_RefusesCallsNotFromTheMessenger() public {
        vm.expectRevert(ReputationReceiver.NotMessenger.selector);
        receiver.receiveTeleporterMessage(SEALED, origin, _msg(1, false, 1));
    }

    function test_RefusesAnotherSourceChain() public {
        vm.expectRevert(ReputationReceiver.WrongSource.selector);
        _deliver(C_CHAIN, origin, _msg(1, false, 1));
    }

    function test_RefusesAnotherSender() public {
        vm.expectRevert(ReputationReceiver.WrongSource.selector);
        _deliver(SEALED, makeAddr("someone else"), _msg(1, false, 1));
    }

    function test_RefusesAnOldOrRepeatedMessage() public {
        _deliver(SEALED, origin, _msg(1 ether, false, 100));
        vm.expectRevert(ReputationReceiver.Stale.selector);
        _deliver(SEALED, origin, _msg(2 ether, false, 100));
        vm.expectRevert(ReputationReceiver.Stale.selector);
        _deliver(SEALED, origin, _msg(2 ether, false, 99));
        _deliver(SEALED, origin, _msg(2 ether, false, 101));
        assertEq(reputation.count(), 2);
    }

    function test_RefusesAnUnknownAgent() public {
        bytes memory m =
            abi.encode(makeAddr("stranger"), uint256(1), false, uint256(1), uint256(261126));
        vm.expectRevert(ReputationReceiver.UnknownAgent.selector);
        _deliver(SEALED, origin, m);
    }

    function test_OnlyOwnerMapsAgents() public {
        vm.expectRevert(ReputationReceiver.NotOwner.selector);
        receiver.setAgentId(agent, 8);
    }

    // ---- publisher (on the L1) ------------------------------------------------------------

    function test_PublisherSendsOnlyForTheRecorderToTheConfiguredReceiver() public {
        TeleporterPublisher pub = new TeleporterPublisher(address(messenger), recorder, C_CHAIN);
        pub.setReceiver(address(receiver));
        bytes memory m = _msg(1, false, 1);

        vm.expectRevert(TeleporterPublisher.NotRecorder.selector);
        pub.publish(m);

        vm.prank(recorder);
        pub.publish(m);
        (bytes32 dest, address to, TeleporterFeeInfo memory fee, uint256 gasLimit) =
            (_dest(), _to(), _fee(), _gas());
        assertEq(dest, C_CHAIN);
        assertEq(to, address(receiver));
        assertEq(fee.amount, 0);
        assertGe(gasLimit, 300_000);
        assertEq(messenger.lastMessage(), m);
    }

    function test_ReceiverIsSetOnceByTheAdmin() public {
        TeleporterPublisher pub = new TeleporterPublisher(address(messenger), recorder, C_CHAIN);
        vm.prank(makeAddr("not admin"));
        vm.expectRevert(TeleporterPublisher.NotAdmin.selector);
        pub.setReceiver(address(receiver));
        pub.setReceiver(address(receiver));
        vm.expectRevert(TeleporterPublisher.ReceiverAlreadySet.selector);
        pub.setReceiver(address(1));
    }

    function test_PublishNeedsAReceiver() public {
        TeleporterPublisher pub = new TeleporterPublisher(address(messenger), recorder, C_CHAIN);
        vm.prank(recorder);
        vm.expectRevert(TeleporterPublisher.NoReceiver.selector);
        pub.publish(_msg(1, false, 1));
    }

    function _dest() internal view returns (bytes32 d) {
        (d,,,,) = messenger.last();
    }

    function _to() internal view returns (address a) {
        (, a,,,) = messenger.last();
    }

    function _fee() internal view returns (TeleporterFeeInfo memory f) {
        (,, f,,) = messenger.last();
    }

    function _gas() internal view returns (uint256 g) {
        (,,, g,) = messenger.last();
    }
}
