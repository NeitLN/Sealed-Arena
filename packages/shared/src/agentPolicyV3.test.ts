import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cancelPendingChallenge,
  guardianFreezeDigest,
  mandateV3Hash,
  NO_PAYEE_CAP,
  setGuardianChallenge,
  setMandateV3Challenge,
  sweepChallenge,
  UNLIMITED_PAYMENTS,
} from "./agentPolicy.js";

const repoFile = (p: string) => new URL(`../../../${p}`, import.meta.url);

describe("rule v3 digests", () => {
  const v = JSON.parse(readFileSync(repoFile("chain/testvectors/agentpolicy-v3.json"), "utf8"));
  const i = v.input;
  const m = {
    payees: i.mandate.payees,
    payeeDailyCaps: i.mandate.payeeDailyCaps.map(BigInt),
    perTxCap: BigInt(i.mandate.perTxCap),
    dailyCap: BigInt(i.mandate.dailyCap),
    dailyFeeCap: BigInt(i.mandate.dailyFeeCap),
    maxPaymentsPerDay: i.mandate.maxPaymentsPerDay,
    expiry: BigInt(i.mandate.expiry),
  };

  it("reproduce chain/testvectors/agentpolicy-v3.json (the Go tests check the same file)", () => {
    const n = BigInt(i.nonce);
    const e = BigInt(i.epoch);
    expect(mandateV3Hash(m)).toBe(v.mandateHash);
    expect(setMandateV3Challenge(i.domain, i.agent, m, n)).toBe(v.setMandateV3);
    expect(cancelPendingChallenge(i.domain, i.agent, n)).toBe(v.cancelPending);
    expect(setGuardianChallenge(i.domain, i.agent, i.guardian, n)).toBe(v.setGuardian);
    expect(sweepChallenge(i.domain, i.agent, i.to, n, e)).toBe(v.sweep);
    expect(guardianFreezeDigest(i.domain, i.agent, e)).toBe(v.guardianFreeze);
  });

  it("sentinels match the precompile's", () => {
    expect(NO_PAYEE_CAP).toBe(BigInt(i.mandate.payeeDailyCaps[1]));
    expect(UNLIMITED_PAYMENTS).toBe(4294967295);
  });
});
