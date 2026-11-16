// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IReputationPublisher} from "./ArenaRecorder.sol";

/// Teleporter v1 message input, as deployed on Fuji and predeployed on the Sealed L1 (with feeInfo;
/// selector of sendCrossChainMessage 0x62448850, checked against both bytecodes).
struct TeleporterFeeInfo {
    address feeTokenAddress;
    uint256 amount;
}

struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

interface ITeleporterMessenger {
    function sendCrossChainMessage(TeleporterMessageInput calldata messageInput)
        external
        returns (bytes32);
}

/// Sends the ArenaRecorder's survival records over ICM to the ReputationReceiver on another chain.
/// Only the recorder may publish, so the receiver can trust this contract as the origin sender.
contract TeleporterPublisher is IReputationPublisher {
    /// Enough for the receiver's checks and one ERC-8004 giveFeedback with short strings.
    uint256 public constant REQUIRED_GAS_LIMIT = 500_000;

    ITeleporterMessenger public immutable messenger;
    address public immutable recorder;
    bytes32 public immutable destinationBlockchainID;
    address public immutable admin;
    address public receiver;

    event ReceiverSet(address receiver);
    event Sent(bytes32 messageID);

    error NotRecorder();
    error NotAdmin();
    error ReceiverAlreadySet();
    error NoReceiver();

    constructor(address messenger_, address recorder_, bytes32 destinationBlockchainID_) {
        messenger = ITeleporterMessenger(messenger_);
        recorder = recorder_;
        destinationBlockchainID = destinationBlockchainID_;
        admin = msg.sender;
    }

    /// Set once: the receiver is deployed after this contract (it checks this address as origin).
    function setReceiver(address receiver_) external {
        if (msg.sender != admin) revert NotAdmin();
        if (receiver != address(0)) revert ReceiverAlreadySet();
        receiver = receiver_;
        emit ReceiverSet(receiver_);
    }

    function publish(bytes calldata message) external {
        if (msg.sender != recorder) revert NotRecorder();
        if (receiver == address(0)) revert NoReceiver();
        bytes32 id = messenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: receiver,
                feeInfo: TeleporterFeeInfo(address(0), 0),
                requiredGasLimit: REQUIRED_GAS_LIMIT,
                allowedRelayerAddresses: new address[](0),
                message: message
            })
        );
        emit Sent(id);
    }
}
