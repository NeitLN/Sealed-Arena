// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Interface of the AgentPolicy precompile on the Sealed L1 (docs/ARCHITECTURE.md, 3.2 and 3.3).
/// Address: 0x0300000000000000000000000000000000000001.
interface IAgentPolicy {
    struct Mandate {
        address[] payees; // at most 16
        uint256 perTxCap; // wei of the native coin
        uint256 dailyCap;
        uint64 expiry; // unix seconds
    }

    // One-time registration. agentSig is the agent key's secp256k1 signature over
    // keccak256(abi.encode("SealedArena:register", chainId, agent, ownerX, ownerY)).
    function register(address agent, bytes32 ownerX, bytes32 ownerY, bytes calldata agentSig) external;

    // Only the owner's passkey can change these. auth is a WebAuthn assertion (3.3).
    function setMandate(address agent, Mandate calldata m, uint256 nonce, bytes calldata auth) external;
    function freeze(address agent, uint256 nonce, bytes calldata auth) external;
    function unfreeze(address agent, uint256 nonce, bytes calldata auth) external;

    function isAgent(address agent) external view returns (bool registered);
    function getMandate(address agent) external view returns (Mandate memory m, bool frozen);
    function getSpend(address agent) external view returns (uint256 spentToday, uint64 dayIndex, uint256 totalCharged);
    function ownerNonce(address agent) external view returns (uint256 nonce);
    function ownerKey(address agent) external view returns (bytes32 x, bytes32 y);

    event AgentRegistered(address indexed agent, bytes32 ownerX, bytes32 ownerY);
    event MandateSet(address indexed agent, uint256 perTxCap, uint256 dailyCap, uint64 expiry, uint256 payeeCount);
    event Frozen(address indexed agent);
    event Unfrozen(address indexed agent);
}
