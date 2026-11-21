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

// ---- rule v2 (agentRuleV2Config active) --------------------------------------------------

/** The v2 mandate: a daily cap on fees too (counted at gas limit x max fee per gas). */
export type MandateV2 = {
  payees: readonly Address[];
  perTxCap: bigint;
  dailyCap: bigint;
  dailyFeeCap: bigint;
  expiry: bigint;
};

const mandateV2Tuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "dailyFeeCap", type: "uint256" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

/**
 * The v2 signing domain: keccak256(abi.encode("SealedArena.AgentPolicy.v2", networkId,
 * blockchainId, chainId, AgentPolicy address)). The local network and the Sealed L1 on Fuji share
 * the EVM chain id but not the blockchain id, so a proof for one is refused on the other.
 */
export function domainV2(networkId: number, blockchainId: Hex, chainId: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
      ],
      [
        "SealedArena.AgentPolicy.v2",
        BigInt(networkId),
        blockchainId,
        chainId,
        AGENT_POLICY_ADDRESS,
      ],
    ),
  );
}

export function registerDigestV2(domain: Hex, agent: Address, ownerX: Hex, ownerY: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      ["SealedArena:register", domain, agent, ownerX, ownerY],
    ),
  );
}

export function mandateV2Hash(m: MandateV2): Hex {
  return keccak256(encodeAbiParameters([mandateV2Tuple], [m]));
}

export function setMandateV2Challenge(
  domain: Hex,
  agent: Address,
  m: MandateV2,
  nonce: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      ["SealedArena:setMandate", domain, agent, mandateV2Hash(m), nonce],
    ),
  );
}

/** Signed on the freeze epoch, not the owner nonce: it can be made ahead of time. */
export function freezeChallengeV2(domain: Hex, agent: Address, epoch: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      ["SealedArena:freeze", domain, agent, epoch],
    ),
  );
}

export function unfreezeChallengeV2(
  domain: Hex,
  agent: Address,
  nonce: bigint,
  epoch: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      ["SealedArena:unfreeze", domain, agent, nonce, epoch],
    ),
  );
}

// ---- rule v3 (agentRuleV3Config active) --------------------------------------------------

/** Per-payee cap value meaning "no per-payee cap" (type(uint256).max). */
export const NO_PAYEE_CAP = 2n ** 256n - 1n;
/** maxPaymentsPerDay value meaning "no limit" (type(uint32).max). */
export const UNLIMITED_PAYMENTS = 2 ** 32 - 1;

/**
 * The v3 mandate: a daily value cap per payee (same order as payees; NO_PAYEE_CAP = none) and a
 * limit on payments per UTC day. Tightening applies at once, loosening after loosenDelay().
 */
export type MandateV3 = {
  payees: readonly Address[];
  payeeDailyCaps: readonly bigint[];
  perTxCap: bigint;
  dailyCap: bigint;
  dailyFeeCap: bigint;
  maxPaymentsPerDay: number;
  expiry: bigint;
};

const mandateV3Tuple = {
  type: "tuple",
  components: [
    { name: "payees", type: "address[]" },
    { name: "payeeDailyCaps", type: "uint256[]" },
    { name: "perTxCap", type: "uint256" },
    { name: "dailyCap", type: "uint256" },
    { name: "dailyFeeCap", type: "uint256" },
    { name: "maxPaymentsPerDay", type: "uint32" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

export function mandateV3Hash(m: MandateV3): Hex {
  return keccak256(encodeAbiParameters([mandateV3Tuple], [m]));
}

/** Signed by the owner (with user verification) to set a v3 mandate. */
export function setMandateV3Challenge(
  domain: Hex,
  agent: Address,
  m: MandateV3,
  nonce: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      ["SealedArena:setMandateV3", domain, agent, mandateV3Hash(m), nonce],
    ),
  );
}

/** Signed by the owner to cancel a scheduled mandate and a scheduled sweep. */
export function cancelPendingChallenge(domain: Hex, agent: Address, nonce: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      ["SealedArena:cancelPending", domain, agent, nonce],
    ),
  );
}

/** Signed by the owner to set, rotate or clear (zero address) the guardian. */
export function setGuardianChallenge(
  domain: Hex,
  agent: Address,
  guardian: Address,
  nonce: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
      ],
      ["SealedArena:setGuardian", domain, agent, guardian, nonce],
    ),
  );
}

/** Signed by the owner to schedule a sweep of a frozen agent; bound to the freeze epoch. */
export function sweepChallenge(
  domain: Hex,
  agent: Address,
  to: Address,
  nonce: bigint,
  epoch: bigint,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "string" },
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
      ],
      ["SealedArena:sweep", domain, agent, to, nonce, epoch],
    ),
  );
}

/** Signed by the guardian key (secp256k1, 65 bytes, low s) to freeze during `epoch`. */
export function guardianFreezeDigest(domain: Hex, agent: Address, epoch: bigint): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "string" }, { type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      ["SealedArena:guardianFreeze", domain, agent, epoch],
    ),
  );
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** An Avalanche id in cb58 (base58 with a 4-byte checksum) as 32 bytes of hex. */
export function cb58ToHex(cb58: string): Hex {
  let n = 0n;
  for (const c of cb58) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error("cb58: bad character");
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(72, "0"); // 32 bytes + 4-byte checksum
  if (hex.length !== 72) throw new Error("cb58: not a 32-byte id");
  return `0x${hex.slice(0, 64)}` as Hex;
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
