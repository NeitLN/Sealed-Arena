import { describe, expect, it } from "vitest";
import { isStateAnswer, recorderFromState, type StateAnswer, viewFromState } from "./arenaState.js";

const s: StateAnswer = {
  ruleVersion: 2,
  registered: true,
  frozen: false,
  mandate: {
    payees: ["0x67d4a4664ff232e84FA89135EeFEb42DF3660819"],
    perTxCap: "500000000000000000",
    dailyCap: "1000000000000000000",
    expiry: "1798761600",
  },
  spentToday: "0",
  totalCharged: "20071400000021000",
  balance: "4979936999999979000",
  feeCapSet: true,
  dailyFeeCap: "50000000000000000",
  feeSpentToday: "21000",
  recorder: {
    funded: "5000000000000000000",
    required: "4979928599999979000",
    score: "3",
    breached: false,
  },
  summary: { total: 0 },
  recent: [],
};

describe("arena state from the gateway", () => {
  it("turns the /state answer into the page's view and recorder", () => {
    const v = viewFromState(s);
    expect(v.mandate.perTxCap).toBe(5n * 10n ** 17n);
    expect(v.balance).toBe(4979936999999979000n);
    expect(v.version).toBe(2);
    expect(v.feeCapSet).toBe(true);
    expect(v.dailyFeeCap).toBe(5n * 10n ** 16n);
    expect(recorderFromState(s)).toEqual({
      funded: 5n * 10n ** 18n,
      required: 4979928599999979000n,
      score: 3n,
      breached: false,
    });
  });

  it("an answer from a gateway without the v2 fields reads them as unset", () => {
    const { feeCapSet: _a, dailyFeeCap: _b, feeSpentToday: _c, ...old } = s;
    const v = viewFromState({ ...old, ruleVersion: 1 });
    expect(v.version).toBe(1);
    expect(v.feeCapSet).toBe(false);
    expect(v.dailyFeeCap).toBe(0n);
  });

  it("recognises a usable answer only", () => {
    expect(isStateAnswer(s)).toBe(true);
    expect(isStateAnswer({ error: "node unavailable" })).toBe(false);
    expect(isStateAnswer(null)).toBe(false);
  });
});
