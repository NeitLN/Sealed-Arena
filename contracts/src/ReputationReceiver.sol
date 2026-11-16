// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// The write function of the ERC-8004 ReputationRegistry (github.com/erc-8004/erc-8004-contracts,
/// abis/ReputationRegistry.json). It refuses feedback from the agent's owner or operators, so the
/// agent's identity is registered by another wallet and this contract only gives feedback.
interface IERC8004Reputation {
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata endpoint,
        string calldata feedbackURI,
        bytes32 feedbackHash
    ) external;
}

/// Receives survival records of the Sealed L1's ArenaRecorder over ICM (Teleporter) and writes them
/// to the ERC-8004 reputation registry. Anyone can give feedback in ERC-8004, so these records are
/// worth exactly as much as this contract's address: read feedback whose client is this contract.
contract ReputationReceiver {
    address public immutable messenger;
    bytes32 public immutable sourceBlockchainID;
    address public immutable originSender;
    IERC8004Reputation public immutable reputation;
    address public immutable owner;

    /// Agent address on the L1 → agentId in the ERC-8004 identity registry.
    mapping(address => uint256) public agentId;
    /// Checkpoint time of the last record accepted per agent: older or repeated records are refused.
    mapping(address => uint256) public lastCheckpoint;

    event AgentMapped(address indexed agent, uint256 agentId);
    event Recorded(
        address indexed agent, uint256 agentId, uint256 score, bool breached, uint256 checkpoint
    );

    error NotMessenger();
    error WrongSource();
    error Stale();
    error UnknownAgent();
    error NotOwner();

    constructor(
        address messenger_,
        bytes32 sourceBlockchainID_,
        address originSender_,
        address reputation_
    ) {
        messenger = messenger_;
        sourceBlockchainID = sourceBlockchainID_;
        originSender = originSender_;
        reputation = IERC8004Reputation(reputation_);
        owner = msg.sender;
    }

    function setAgentId(address agent, uint256 id) external {
        if (msg.sender != owner) revert NotOwner();
        agentId[agent] = id;
        emit AgentMapped(agent, id);
    }

    /// ITeleporterReceiver. Message: abi.encode(agent, score, breached, lastCheckpoint, sourceChainId).
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID_,
        address originSender_,
        bytes calldata message
    ) external {
        if (msg.sender != messenger) revert NotMessenger();
        if (sourceBlockchainID_ != sourceBlockchainID || originSender_ != originSender) {
            revert WrongSource();
        }
        (address agent, uint256 score, bool breached, uint256 checkpoint,) =
            abi.decode(message, (address, uint256, bool, uint256, uint256));
        if (checkpoint <= lastCheckpoint[agent]) revert Stale();
        uint256 id = agentId[agent];
        if (id == 0) revert UnknownAgent();
        lastCheckpoint[agent] = checkpoint;

        // Value: survival in coin·hours (score is coin·seconds in wei); a breach is -1.
        int128 value = breached ? int128(-1) : _toInt128(score / 1 ether / 3600);
        reputation.giveFeedback(
            id,
            value,
            0,
            "sealed-arena",
            breached ? "breached" : "survival",
            "",
            "",
            keccak256(message)
        );
        emit Recorded(agent, id, score, breached, checkpoint);
    }

    function _toInt128(uint256 v) private pure returns (int128) {
        // ERC-8004 caps |value|; a survival score this large is far beyond the challenge's scale.
        uint256 cap = 1e30;
        return int128(int256(v > cap ? cap : v));
    }
}
