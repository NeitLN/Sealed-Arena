// Owner actions on AgentPolicy for both rule versions. Before agent rule v2 is active the
// precompile takes v1 proofs (bound to the EVM chain id); from its activation it takes only v2
// proofs (bound to the Avalanche network and blockchain ids) and setMandateV2. Callers read the
// version from the chain (readRuleVersion) and build their call with the helpers below, so the
// same code works before and after the switch.
import { type Address, encodeFunctionData, type Hex, hexToBytes, type PublicClient } from "viem";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  cb58ToHex,
  domainV2,
  freezeChallenge,
  freezeChallengeV2,
  type Mandate,
  type MandateV2,
  registerDigest,
  registerDigestV2,
  setMandateChallenge,
  setMandateV2Challenge,
  unfreezeChallenge,
  unfreezeChallengeV2,
} from "./agentPolicy.js";
import { CHAIN_ID } from "./chain.js";

export type RuleVersion = 1 | 2;

/** What a v2 proof is bound to. */
export type PolicyIds = { chainId: bigint; networkId: number; blockchainId: Hex };

/** The Sealed L1 on Fuji (network id 5). */
export const FUJI_BLOCKCHAIN_ID = "UFo3xChM9b9efQkg93qPnswkJi7VR1XW7KQg9wE7gnCULfbYo";
export const FUJI_NETWORK_ID = 5;
export const FUJI_POLICY_IDS: PolicyIds = {
  chainId: BigInt(CHAIN_ID),
  networkId: FUJI_NETWORK_ID,
  blockchainId: cb58ToHex(FUJI_BLOCKCHAIN_ID),
};

/** The blockchain id (cb58) in an RPC URL or path of the form .../ext/bc/<id>/rpc. */
export function blockchainIdFromRpc(rpc: string): string | undefined {
  return /\/ext\/bc\/([1-9A-HJ-NP-Za-km-z]{40,60})\/rpc\b/.exec(rpc)?.[1];
}

/**
 * The node's answer when ruleVersion() is not active yet ("invalid non-activated function
 * selector: 0x…"; "invalid function selector" on a node without the v2 functions).
 */
export const NOT_ACTIVE_SELECTOR = /invalid (non-activated )?function selector/i;

/**
 * The rule version in force at the head. ruleVersion() exists only under v2: before, the node
 * refuses it as a selector that is not active, which means v1. Any other failure (the node is
 * down, a rate limit) throws, so a client never signs a v1 proof by mistake.
 */
export async function readRuleVersion(client: PublicClient): Promise<RuleVersion> {
  try {
    const v = await client.readContract({
      address: AGENT_POLICY_ADDRESS,
      abi: agentPolicyAbi,
      functionName: "ruleVersion",
    });
    return Number(v) >= 2 ? 2 : 1;
  } catch (err) {
    if (NOT_ACTIVE_SELECTOR.test(errorText(err))) return 1;
    throw err;
  }
}

/** The error's message and the messages of its causes (viem wraps the node's answer). */
function errorText(err: unknown): string {
  const parts: string[] = [];
  for (let e: unknown = err, i = 0; e && i < 8; i++) {
    const o = e as { message?: unknown; details?: unknown; cause?: unknown };
    if (typeof o.message === "string") parts.push(o.message);
    if (typeof o.details === "string") parts.push(o.details);
    e = o.cause;
  }
  return parts.join("\n");
}

export async function readFreezeEpoch(client: PublicClient, agent: Address): Promise<bigint> {
  return client.readContract({
    address: AGENT_POLICY_ADDRESS,
    abi: agentPolicyAbi,
    functionName: "freezeEpoch",
    args: [agent],
  });
}

/** A mandate as the owner sets it; dailyFeeCap counts only under v2. */
export type MandateInput = Mandate & { dailyFeeCap?: bigint };

/** Default daily cap on fees when a caller gives none: a twentieth of the daily cap. */
export const defaultDailyFeeCap = (dailyCap: bigint) => dailyCap / 20n;

const toV2 = (m: MandateInput): MandateV2 => ({
  payees: m.payees,
  perTxCap: m.perTxCap,
  dailyCap: m.dailyCap,
  dailyFeeCap: m.dailyFeeCap ?? defaultDailyFeeCap(m.dailyCap),
  expiry: m.expiry,
});

const domainOf = (ids: PolicyIds) => domainV2(ids.networkId, ids.blockchainId, ids.chainId);

/** The digest the agent key signs to be registered. */
export function registerDigestFor(
  v: RuleVersion,
  ids: PolicyIds,
  agent: Address,
  ownerX: Hex,
  ownerY: Hex,
): Hex {
  return v === 2
    ? registerDigestV2(domainOf(ids), agent, ownerX, ownerY)
    : registerDigest(ids.chainId, agent, ownerX, ownerY);
}

export function registerData(agent: Address, ownerX: Hex, ownerY: Hex, agentSig: Hex): Hex {
  return encodeFunctionData({
    abi: agentPolicyAbi,
    functionName: "register",
    args: [agent, ownerX, ownerY, agentSig],
  });
}

/** An owner action: the challenge the passkey signs, and the call data once it has signed. */
export type OwnerRequest = { challenge: Hex; data: (auth: Hex) => Hex };

export function setMandateRequest(
  v: RuleVersion,
  ids: PolicyIds,
  agent: Address,
  m: MandateInput,
  nonce: bigint,
): OwnerRequest {
  if (v === 2) {
    const m2 = toV2(m);
    return {
      challenge: setMandateV2Challenge(domainOf(ids), agent, m2, nonce),
      data: (auth) =>
        encodeFunctionData({
          abi: agentPolicyAbi,
          functionName: "setMandateV2",
          args: [agent, m2, nonce, auth],
        }),
    };
  }
  const m1: Mandate = {
    payees: m.payees,
    perTxCap: m.perTxCap,
    dailyCap: m.dailyCap,
    expiry: m.expiry,
  };
  return {
    challenge: setMandateChallenge(ids.chainId, agent, m1, nonce),
    data: (auth) =>
      encodeFunctionData({
        abi: agentPolicyAbi,
        functionName: "setMandate",
        args: [agent, m1, nonce, auth],
      }),
  };
}

/**
 * Freeze or unfreeze. Under v1 both are signed on the owner nonce. Under v2 a freeze is signed on
 * the freeze epoch (and can be signed ahead of time); an unfreeze on the owner nonce and the epoch.
 */
export function setFrozenRequest(
  v: RuleVersion,
  ids: PolicyIds,
  agent: Address,
  frozen: boolean,
  s: { ownerNonce: bigint; freezeEpoch: bigint },
): OwnerRequest {
  const fn = frozen ? "freeze" : "unfreeze";
  const arg = v === 2 && frozen ? s.freezeEpoch : s.ownerNonce;
  let challenge: Hex;
  if (v === 2) {
    challenge = frozen
      ? freezeChallengeV2(domainOf(ids), agent, s.freezeEpoch)
      : unfreezeChallengeV2(domainOf(ids), agent, s.ownerNonce, s.freezeEpoch);
  } else {
    challenge = (frozen ? freezeChallenge : unfreezeChallenge)(ids.chainId, agent, s.ownerNonce);
  }
  return {
    challenge,
    data: (auth) =>
      encodeFunctionData({ abi: agentPolicyAbi, functionName: fn, args: [agent, arg, auth] }),
  };
}

// ---- agent payments under rule v2 ----------------------------------------------------------

/** Highest effective tip rule v2 lets an agent pay: 1 gwei. */
export const AGENT_MAX_TIP = 1_000_000_000n;

/**
 * The gas limit rule v2 requires of an agent payment: exactly its intrinsic gas, 21000 plus 16 per
 * non-zero and 4 per zero byte of call data (empty, or the 32-byte x402 payment reference). Also
 * valid under v1.
 */
export function agentPaymentGas(data: Hex = "0x"): bigint {
  let gas = 21_000n;
  for (const b of hexToBytes(data)) gas += b === 0 ? 4n : 16n;
  return gas;
}

/** Fees for an agent payment: the node's estimate, with the tip capped at AGENT_MAX_TIP. */
export function agentFees(f: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }) {
  const tip = f.maxPriorityFeePerGas < AGENT_MAX_TIP ? f.maxPriorityFeePerGas : AGENT_MAX_TIP;
  return { maxFeePerGas: f.maxFeePerGas, maxPriorityFeePerGas: tip };
}
