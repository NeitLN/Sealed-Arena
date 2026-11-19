import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, hexToString, recoverAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  cb58ToHex,
  challengeToBase64Url,
  domainV2,
  encodeAuth,
  freezeChallenge,
  freezeChallengeV2,
  type Mandate,
  mandateV2Hash,
  normalizeLowS,
  P256_N,
  registerDigest,
  registerDigestV2,
  setMandateChallenge,
  setMandateV2Challenge,
  unfreezeChallenge,
  unfreezeChallengeV2,
  type WebAuthnAssertion,
} from "./agentPolicy.js";
import { ADDRESSES } from "./chain.js";

const repoFile = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));

type Assertion = WebAuthnAssertion & { auth: Hex; error?: string };
type Vectors = {
  chainId: string;
  agent: Address;
  owner: { x: Hex; y: Hex };
  register: { digest: Hex; agentSig: Hex };
  mandate: { payees: Address[]; perTxCap: string; dailyCap: string; expiry: string };
  setMandate: {
    nonce: string;
    challenge: Hex;
    valid: Assertion;
    invalid: Record<string, Assertion>;
  };
  freeze: { nonce: string; challenge: Hex; valid: Assertion };
  unfreeze: { nonce: string; challenge: Hex; valid: Assertion };
};
const v: Vectors = JSON.parse(readFileSync(repoFile("chain/testvectors/webauthn.json"), "utf8"));
const chainId = BigInt(v.chainId);
const mandate: Mandate = {
  payees: v.mandate.payees,
  perTxCap: BigInt(v.mandate.perTxCap),
  dailyCap: BigInt(v.mandate.dailyCap),
  expiry: BigInt(v.mandate.expiry),
};

describe("AgentPolicy ABI and address", () => {
  it("matches chain/abi/IAgentPolicy.json", () => {
    const fromChain = JSON.parse(readFileSync(repoFile("chain/abi/IAgentPolicy.json"), "utf8"));
    expect(agentPolicyAbi).toEqual(fromChain);
  });

  it("is the address shared with every service", () => {
    expect(AGENT_POLICY_ADDRESS).toBe("0x0300000000000000000000000000000000000001");
    expect(ADDRESSES.agentPolicy).toBe(AGENT_POLICY_ADDRESS);
  });
});

describe("challenges match the shared vectors byte for byte", () => {
  it("register digest, signed by the agent key", async () => {
    expect(registerDigest(chainId, v.agent, v.owner.x, v.owner.y)).toBe(v.register.digest);
    expect(await recoverAddress({ hash: v.register.digest, signature: v.register.agentSig })).toBe(
      v.agent,
    );
  });

  it("setMandate, freeze and unfreeze", () => {
    expect(setMandateChallenge(chainId, v.agent, mandate, BigInt(v.setMandate.nonce))).toBe(
      v.setMandate.challenge,
    );
    expect(freezeChallenge(chainId, v.agent, BigInt(v.freeze.nonce))).toBe(v.freeze.challenge);
    expect(unfreezeChallenge(chainId, v.agent, BigInt(v.unfreeze.nonce))).toBe(
      v.unfreeze.challenge,
    );
  });

  it("changes when any signed field changes", () => {
    const base = setMandateChallenge(chainId, v.agent, mandate, 0n);
    expect(setMandateChallenge(chainId + 1n, v.agent, mandate, 0n)).not.toBe(base);
    expect(setMandateChallenge(chainId, AGENT_POLICY_ADDRESS, mandate, 0n)).not.toBe(base);
    expect(
      setMandateChallenge(chainId, v.agent, { ...mandate, dailyCap: mandate.dailyCap + 1n }, 0n),
    ).not.toBe(base);
    expect(setMandateChallenge(chainId, v.agent, mandate, 1n)).not.toBe(base);
    expect(freezeChallenge(chainId, v.agent, 1n)).not.toBe(unfreezeChallenge(chainId, v.agent, 1n));
  });

  it("puts the challenge into clientDataJSON as base64url", () => {
    const clientData = JSON.parse(hexToString(v.setMandate.valid.clientDataJSON));
    expect(clientData.challenge).toBe(challengeToBase64Url(v.setMandate.challenge));
    expect(clientData.type).toBe("webauthn.get");
  });
});

describe("encodeAuth", () => {
  const all: Array<[string, Assertion]> = [
    ["setMandate valid", v.setMandate.valid],
    ["freeze valid", v.freeze.valid],
    ["unfreeze valid", v.unfreeze.valid],
    ...Object.entries(v.setMandate.invalid),
  ];
  it.each(all)("%s: matches the vector", (_name, a) => {
    expect(encodeAuth(a)).toBe(a.auth);
  });
});

describe("normalizeLowS", () => {
  it("maps s to the lower half of the curve order", () => {
    expect(normalizeLowS(1n)).toBe(1n);
    expect(normalizeLowS(P256_N - 1n)).toBe(1n);
    expect(normalizeLowS(P256_N / 2n)).toBe(P256_N / 2n);
    expect(normalizeLowS(P256_N / 2n + 1n)).toBe(P256_N - (P256_N / 2n + 1n));
  });
});

describe("rule v2 digests", () => {
  const v = JSON.parse(readFileSync(repoFile("chain/testvectors/agentpolicy-v2.json"), "utf8"));
  const i = v.input;
  const m = {
    payees: i.mandate.payees,
    perTxCap: BigInt(i.mandate.perTxCap),
    dailyCap: BigInt(i.mandate.dailyCap),
    dailyFeeCap: BigInt(i.mandate.dailyFeeCap),
    expiry: BigInt(i.mandate.expiry),
  };

  it("reproduce chain/testvectors/agentpolicy-v2.json (the Go tests check the same file)", () => {
    const domain = domainV2(i.networkId, i.blockchainId, BigInt(i.chainId));
    expect(domain).toBe(v.domain);
    expect(registerDigestV2(domain, i.agent, i.ownerX, i.ownerY)).toBe(v.register);
    expect(mandateV2Hash(m)).toBe(v.mandateHash);
    expect(setMandateV2Challenge(domain, i.agent, m, BigInt(i.nonce))).toBe(v.setMandate);
    expect(freezeChallengeV2(domain, i.agent, BigInt(i.epoch))).toBe(v.freeze);
    expect(unfreezeChallengeV2(domain, i.agent, BigInt(i.nonce), BigInt(i.epoch))).toBe(v.unfreeze);
    expect(cb58ToHex(v.cb58.id)).toBe(v.cb58.hex);
  });

  it("change with the blockchain id (local and Fuji share the EVM chain id)", () => {
    const a = domainV2(i.networkId, i.blockchainId, BigInt(i.chainId));
    const b = domainV2(i.networkId, `0x${"00".repeat(31)}01`, BigInt(i.chainId));
    expect(a).not.toBe(b);
  });
});
