import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Address, type Hex, hexToString, recoverAddress } from "viem";
import { describe, expect, it } from "vitest";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  challengeToBase64Url,
  encodeAuth,
  freezeChallenge,
  type Mandate,
  normalizeLowS,
  P256_N,
  registerDigest,
  setMandateChallenge,
  unfreezeChallenge,
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
