import { decodeFunctionData, type Hex, type PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import {
  agentPolicyAbi,
  cancelPendingChallenge,
  domainV2,
  freezeChallengeV2,
  NO_PAYEE_CAP,
  registerDigestV2,
  setGuardianChallenge,
  setMandateV3Challenge,
  sweepChallenge,
  UNLIMITED_PAYMENTS,
  unfreezeChallengeV2,
} from "./agentPolicy.js";
import {
  cancelPendingRequest,
  defaultDailyFeeCap,
  executeSweepData,
  guardianFreezeData,
  hasUserVerified,
  type PolicyIds,
  readRuleVersion,
  registerDigestFor,
  requiresUserVerification,
  setFrozenRequest,
  setGuardianRequest,
  setMandateRequest,
  sweepRequest,
  UnknownRuleVersionError,
} from "./policyCalls.js";

const agent = "0x19e7e376e7c213b7e7e7e46cc70a5dd086daff2a" as const;
const guardian = "0x00000000000000000000000000000000000a11ce" as const;
const rescue = "0x000000000000000000000000000000000000b0b0" as const;
const x = `0x${"11".repeat(32)}` as Hex;
const y = `0x${"22".repeat(32)}` as Hex;
const ids: PolicyIds = { chainId: 261126n, networkId: 12345, blockchainId: `0x${"ab".repeat(32)}` };
const domain = domainV2(ids.networkId, ids.blockchainId, ids.chainId);
const m = {
  payees: ["0x00000000000000000000000000000000000000a1"] as const,
  perTxCap: 10n ** 18n,
  dailyCap: 3n * 10n ** 18n,
  expiry: 1_800_000_000n,
};
const auth = "0xabcd" as Hex;
const decode = (data: Hex) => decodeFunctionData({ abi: agentPolicyAbi, data });

describe("readRuleVersion under rule v3", () => {
  const client = (v: bigint) => ({ readContract: async () => v }) as unknown as PublicClient;
  it("3 when ruleVersion() answers 3, 2 when it answers 2", async () => {
    expect(await readRuleVersion(client(3n))).toBe(3);
    expect(await readRuleVersion(client(2n))).toBe(2);
  });
  it("throws on a version it does not know, so no wrong call is built", async () => {
    await expect(readRuleVersion(client(4n))).rejects.toBeInstanceOf(UnknownRuleVersionError);
    await expect(readRuleVersion(client(1n))).rejects.toBeInstanceOf(UnknownRuleVersionError);
  });
});

describe("owner calls under rule v3", () => {
  it("register and freeze keep the v2 domain and digests", () => {
    expect(registerDigestFor(3, ids, agent, x, y)).toBe(registerDigestV2(domain, agent, x, y));
    const s = { ownerNonce: 5n, freezeEpoch: 2n };
    expect(setFrozenRequest(3, ids, agent, true, s).challenge).toBe(
      freezeChallengeV2(domain, agent, 2n),
    );
    expect(setFrozenRequest(3, ids, agent, false, s).challenge).toBe(
      unfreezeChallengeV2(domain, agent, 5n, 2n),
    );
  });

  it("setMandateV3 with defaults: no payee caps, unlimited payments, fee cap dailyCap / 20", () => {
    const r = setMandateRequest(3, ids, agent, m, 4n);
    const m3 = {
      ...m,
      payeeDailyCaps: [NO_PAYEE_CAP],
      dailyFeeCap: defaultDailyFeeCap(m.dailyCap),
      maxPaymentsPerDay: UNLIMITED_PAYMENTS,
    };
    expect(r.challenge).toBe(setMandateV3Challenge(domain, agent, m3, 4n));
    const d = decode(r.data(auth));
    expect(d.functionName).toBe("setMandateV3");
    const withLimits = { ...m, payeeDailyCaps: [5n], maxPaymentsPerDay: 9, dailyFeeCap: 1n };
    expect(setMandateRequest(3, ids, agent, withLimits, 4n).challenge).toBe(
      setMandateV3Challenge(domain, agent, withLimits, 4n),
    );
  });

  it("cancelPending, setGuardian, sweep, executeSweep, guardianFreeze", () => {
    const c = cancelPendingRequest(ids, agent, 7n);
    expect(c.challenge).toBe(cancelPendingChallenge(domain, agent, 7n));
    expect(decode(c.data(auth)).functionName).toBe("cancelPending");
    const g = setGuardianRequest(ids, agent, guardian, 7n);
    expect(g.challenge).toBe(setGuardianChallenge(domain, agent, guardian, 7n));
    expect(String(decode(g.data(auth)).args?.[1]).toLowerCase()).toBe(guardian);
    const s = sweepRequest(ids, agent, rescue, { ownerNonce: 7n, freezeEpoch: 3n });
    expect(s.challenge).toBe(sweepChallenge(domain, agent, rescue, 7n, 3n));
    expect(decode(s.data(auth)).functionName).toBe("sweep");
    expect(decode(executeSweepData(agent)).functionName).toBe("executeSweep");
    const sig = `0x${"aa".repeat(65)}` as Hex;
    const gf = decode(guardianFreezeData(agent, 3n, sig)).args ?? [];
    expect([String(gf[0]).toLowerCase(), gf[1], gf[2]]).toEqual([agent, 3n, sig]);
  });

  it("user verification: required from v3 for every owner action except freeze", () => {
    for (const a of ["setMandate", "unfreeze", "cancelPending", "setGuardian", "sweep"] as const) {
      expect(requiresUserVerification(3, a)).toBe(true);
      expect(requiresUserVerification(2, a)).toBe(false);
    }
    expect(requiresUserVerification(3, "freeze")).toBe(false);
    const ad = (flags: number) =>
      `0x${"00".repeat(32)}${flags.toString(16).padStart(2, "0")}00000001` as Hex;
    expect(hasUserVerified(ad(0x05))).toBe(true);
    expect(hasUserVerified(ad(0x01))).toBe(false);
    expect(hasUserVerified(ad(0x04))).toBe(false);
    expect(hasUserVerified("0x00")).toBe(false);
  });
});
