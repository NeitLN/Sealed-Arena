// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

/// The part of the AgentPolicy precompile (docs/ARCHITECTURE.md 3.2) the recorder reads.
interface IAgentPolicy {
    function isAgent(address agent) external view returns (bool);
    function getSpend(address agent)
        external
        view
        returns (uint256 spentToday, uint64 dayIndex, uint256 totalCharged);
}

/// Sends a survival record off this chain. The Teleporter (ICM) adapter is added in T13.
interface IReputationPublisher {
    function publish(bytes calldata message) external;
}

/// Survival record of agents in the open challenge (docs/ARCHITECTURE.md section 5).
///
/// For an enrolled agent the chain rule must keep
///     balance(agent) >= funded(agent) - chargedSinceEnroll(agent)
/// where `funded` counts only coins sent through `fund`, and `chargedSinceEnroll` is the rule's
/// `totalCharged` minus its value at enrollment. The rule charges every payment at its maximum
/// cost before the coins leave, so valid payments never break this. Coins leaving the agent by
/// any path outside the rule do. Anyone can check it at any time; a break is permanent.
///
/// Score is the time integral of the accounted balance `min(balance, funded - charged)`, sampled at
/// each checkpoint for the time since the previous one.
///
/// Coins sent straight to the agent are not funding and do not raise the score. They do raise
/// `balance`, so a leak no larger than such deposits would not show as a break. The challenge
/// funds agents only through `fund`.
contract ArenaRecorder {
    IAgentPolicy public constant POLICY = IAgentPolicy(0x0300000000000000000000000000000000000001);

    struct Record {
        bool enrolled;
        bool breached;
        uint64 lastCheckpoint;
        uint256 funded;
        uint256 chargedAtEnroll;
        uint256 score;
        address finder;
    }

    address public immutable admin;
    IReputationPublisher public publisher;
    mapping(address => Record) internal records;

    event Enrolled(address indexed agent, uint256 chargedAtEnroll);
    event Funded(address indexed agent, address indexed from, uint256 amount);
    event Checkpoint(address indexed agent, uint256 score, uint256 balance, uint256 required);
    event Breach(address indexed agent, address indexed finder, uint256 balance, uint256 required);
    event Published(address indexed agent, bytes message);
    event PublisherSet(address publisher);

    error NotAdmin();
    error NotAnAgent();
    error AlreadyEnrolled();
    error NotEnrolled();
    error AlreadyBreached();
    error NoPublisher();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ---- admin ------------------------------------------------------------------------

    function enroll(address agent) external onlyAdmin {
        Record storage r = records[agent];
        if (r.enrolled) revert AlreadyEnrolled();
        if (!POLICY.isAgent(agent)) revert NotAnAgent();
        r.enrolled = true;
        r.lastCheckpoint = uint64(block.timestamp);
        r.chargedAtEnroll = _totalCharged(agent);
        emit Enrolled(agent, r.chargedAtEnroll);
    }

    function setPublisher(IReputationPublisher p) external onlyAdmin {
        publisher = p;
        emit PublisherSet(address(p));
    }

    // ---- anyone -----------------------------------------------------------------------

    /// Sends coins to the agent and counts them as funding.
    function fund(address agent) external payable {
        Record storage r = _enrolled(agent);
        _checkpoint(agent, r, msg.sender);
        if (r.breached) revert AlreadyBreached();
        r.funded += msg.value;
        (bool ok,) = agent.call{value: msg.value}("");
        if (!ok) revert TransferFailed();
        emit Funded(agent, msg.sender, msg.value);
    }

    /// Adds `accounted balance × seconds` since the last checkpoint and checks the invariant.
    function checkpoint(address agent) external {
        _checkpoint(agent, _enrolled(agent), msg.sender);
    }

    /// Same as checkpoint; named for people looking for a break. A break found here records the caller.
    function reportBreach(address agent) external {
        _checkpoint(agent, _enrolled(agent), msg.sender);
    }

    /// Checkpoints, then sends (agent, score, breached, lastCheckpoint, chainid) through the publisher.
    function publish(address agent) external {
        if (address(publisher) == address(0)) revert NoPublisher();
        Record storage r = _enrolled(agent);
        _checkpoint(agent, r, msg.sender);
        bytes memory message =
            abi.encode(agent, r.score, r.breached, uint256(r.lastCheckpoint), block.chainid);
        publisher.publish(message);
        emit Published(agent, message);
    }

    // ---- views ------------------------------------------------------------------------

    function enrolled(address agent) external view returns (bool) {
        return records[agent].enrolled;
    }

    function breached(address agent) external view returns (bool) {
        return records[agent].breached;
    }

    function funded(address agent) external view returns (uint256) {
        return records[agent].funded;
    }

    function score(address agent) external view returns (uint256) {
        return records[agent].score;
    }

    function finder(address agent) external view returns (address) {
        return records[agent].finder;
    }

    function lastCheckpoint(address agent) external view returns (uint64) {
        return records[agent].lastCheckpoint;
    }

    /// funded - charged since enrollment: what the agent must hold at least (0 if charges exceed funding).
    function requiredBalance(address agent) public view returns (uint256) {
        Record storage r = records[agent];
        uint256 charged = _totalCharged(agent) - r.chargedAtEnroll;
        return r.funded > charged ? r.funded - charged : 0;
    }

    /// The balance the score counts: min(balance, requiredBalance).
    function accountedBalance(address agent) public view returns (uint256) {
        uint256 required = requiredBalance(agent);
        return agent.balance < required ? agent.balance : required;
    }

    // ---- internal ---------------------------------------------------------------------

    function _enrolled(address agent) internal view returns (Record storage r) {
        r = records[agent];
        if (!r.enrolled) revert NotEnrolled();
    }

    function _totalCharged(address agent) internal view returns (uint256 total) {
        (,, total) = POLICY.getSpend(agent);
    }

    function _checkpoint(address agent, Record storage r, address caller) internal {
        if (r.breached) return;
        uint256 required = requiredBalance(agent);
        uint256 balance = agent.balance;
        if (balance < required) {
            r.breached = true;
            r.score = 0;
            r.finder = caller;
            r.lastCheckpoint = uint64(block.timestamp);
            emit Breach(agent, caller, balance, required);
            return;
        }
        // balance >= required here, so the accounted balance is `required`.
        r.score += required * (block.timestamp - r.lastCheckpoint);
        r.lastCheckpoint = uint64(block.timestamp);
        emit Checkpoint(agent, r.score, balance, required);
    }
}
