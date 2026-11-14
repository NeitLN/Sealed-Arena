import { type Address, encodeAbiParameters, type Hex, hexToBytes, keccak256 } from "viem";

export { agentPolicyAbi } from "./agentPolicyAbi.js";

/** AgentPolicy precompile address (docs/ARCHITECTURE.md 3.2, decision D4). */
export const AGENT_POLICY_ADDRESS: Address = "0x0300000000000000000000000000000000000001";

export const MAX_PAYEES = 16;

export type Mandate = {
  payees: readonly Address[];
  perTxCap: bigint; // wei of the native coin
  dailyCap: bigint;
  expiry: bigint; // unix seconds (uint64)
};

const mandateTuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

/** keccak256(abi.encode("SealedArena:register", chainId, agent, ownerX, ownerY)), signed by the agent key. */
export function registerDigest(chainId: bigint, agent: Address, ownerX: Hex, ownerY: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      ["SealedArena:register", chainId, agent, ownerX, ownerY],
    ),
  );
}

/** keccak256(abi.encode(m)). */
export function mandateHash(m: Mandate): Hex {
  return keccak256(encodeAbiParameters([mandateTuple], [m]));
}

/** keccak256(abi.encode("SealedArena:setMandate", chainId, agent, keccak256(abi.encode(m)), nonce)). */
export function setMandateChallenge(
  chainId: bigint,
  agent: Address,
  m: Mandate,
  nonce: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      ["SealedArena:setMandate", chainId, agent, mandateHash(m), nonce],
    ),
  );
}

function toggleChallenge(tag: string, chainId: bigint, agent: Address, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }],
      [tag, chainId, agent, nonce],
    ),
  );
}

/** keccak256(abi.encode("SealedArena:freeze", chainId, agent, nonce)). */
export function freezeChallenge(chainId: bigint, agent: Address, nonce: bigint): Hex {
  return toggleChallenge("SealedArena:freeze", chainId, agent, nonce);
}

/** keccak256(abi.encode("SealedArena:unfreeze", chainId, agent, nonce)). */
export function unfreezeChallenge(chainId: bigint, agent: Address, nonce: bigint): Hex {
  return toggleChallenge("SealedArena:unfreeze", chainId, agent, nonce);
}

/** The challenge as it appears in clientDataJSON.challenge: base64url without padding. */
export function challengeToBase64Url(challenge: Hex): string {
  const binary = String.fromCharCode(...hexToBytes(challenge));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export type WebAuthnAssertion = {
  authenticatorData: Hex;
  clientDataJSON: Hex; // UTF-8 bytes of the JSON, hex encoded
  r: Hex; // 32 bytes
  s: Hex; // 32 bytes, lower half of the P-256 order
};

/** auth = abi.encode(bytes authenticatorData, bytes clientDataJSON, bytes32 r, bytes32 s). */
export function encodeAuth(a: WebAuthnAssertion): Hex {
  return encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes" }, { type: "bytes32" }, { type: "bytes32" }],
    [a.authenticatorData, a.clientDataJSON, a.r, a.s],
  );
}

/** Order n of the P-256 curve. */
export const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;

/** Returns s in the lower half of the curve order, as the precompile requires. */
export function normalizeLowS(s: bigint): bigint {
  return s > P256_N / 2n ? P256_N - s : s;
}
