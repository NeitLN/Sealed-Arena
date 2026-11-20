import { describe, expect, it } from "vitest";
import type { Sent } from "./probe.js";
import {
  boundaryRoundOk,
  boundaryVerdict,
  freezeRaceVerdict,
  highFeeCapVerdict,
  mandateChecks,
  payeeGetsCodeVerdict,
  refusedWith,
  verdictOf,
} from "./verdicts.js";

const GWEI = 1_000_000_000n;
const included = (block = 10n): Sent => ({ status: "included", hash: "0x01", block, ok: true });
const refused = (reason: string): Sent => ({ status: "refused", reason });
const dropped = (inPool = false): Sent => ({ status: "not included", hash: "0x02", inPool });

describe("verdict words", () => {
  it("maps true, false and not run", () => {
    expect(verdictOf(true)).toBe("PASS");
    expect(verdictOf(false)).toBe("FAIL");
    expect(verdictOf("not run")).toBe("NOT RUN");
  });

  it("refusedWith needs a refusal carrying the text", () => {
    expect(refusedWith(refused("agent: tip too high: 10 above 1"), "agent: tip too high")).toBe(
      true,
    );
    expect(refusedWith(refused("agent: frozen"), "agent: tip too high")).toBe(false);
    expect(refusedWith(included(), "agent: tip too high")).toBe(false);
  });
});

describe("b5: high fee cap inside every cap", () => {
  const value = 10n ** 16n;
  const maxFeePerGas = 10n ** 17n / 21_000n;
  const paidFee = 21_000n * 2n * GWEI;
  const good = {
    success: true,
    effectiveTip: GWEI,
    balanceDrop: value + paidFee,
    paidFee,
    value,
    counted: value + 21_000n * maxFeePerGas,
    maxFeePerGas,
  };
  it("passes when only base fee + tip is paid and the maximum fee counts", () => {
    expect(highFeeCapVerdict(good)).toBe(true);
  });
  it.each([
    ["reverted", { success: false }],
    ["tip above 1 gwei", { effectiveTip: GWEI + 1n }],
    ["more taken than value + fee", { balanceDrop: value + paidFee + 1n }],
    ["only the paid fee counted", { counted: value + paidFee }],
  ])("fails when %s", (_, change) => {
    expect(highFeeCapVerdict({ ...good, ...change })).toBe(false);
  });
});

describe("c: payment in the pool when the owner freezes", () => {
  const raced = { beforeFreeze: false, payment: dropped() };
  it("passes when trials raced and none was included or kept", () => {
    expect(freezeRaceVerdict([raced, raced])).toBe(true);
  });
  it("a payment in a block before the freeze is no race, not a failure", () => {
    expect(freezeRaceVerdict([{ beforeFreeze: true, payment: included(5n) }, raced])).toBe(true);
  });
  it("fails when no trial raced", () => {
    expect(freezeRaceVerdict([{ beforeFreeze: true, payment: included(5n) }])).toBe(false);
    expect(freezeRaceVerdict([])).toBe(false);
  });
  it("fails when a raced payment was included", () => {
    expect(freezeRaceVerdict([raced, { beforeFreeze: false, payment: included(12n) }])).toBe(false);
  });
  it("fails when a payment is still in the pool", () => {
    expect(freezeRaceVerdict([{ beforeFreeze: false, payment: dropped(true) }])).toBe(false);
  });
});

describe("d: listed payee gets code", () => {
  const second = refused("agent: payee has code");
  it("passes: first included, code deployed, then refused", () => {
    expect(payeeGetsCodeVerdict(included(), "0x60", second)).toBe(true);
  });
  it.each([
    ["first not included", refused("x"), "0x60", second],
    ["no code", included(), "0x", second],
    ["no code (undefined)", included(), undefined, second],
    ["second included", included(), "0x60", included()],
    ["second refused for another reason", included(), "0x60", refused("agent: frozen")],
  ] as const)("fails when %s", (_, first, code, after) => {
    expect(payeeGetsCodeVerdict(first, code, after)).toBe(false);
  });
});

describe("a: the 00:00 UTC boundary", () => {
  const budget = refused("agent: budget exceeded: spentToday");
  const round = [included(), included(), included(), budget];
  it("a round is three included then a budget refusal", () => {
    expect(boundaryRoundOk(round)).toBe(true);
    // A round is exactly four payments: a fifth one (included or not) is not this case.
    expect(boundaryRoundOk([...round, budget])).toBe(false);
    expect(boundaryRoundOk(round.slice(0, 3))).toBe(false);
    expect(boundaryRoundOk([included(), included(), included(), included()])).toBe(false);
    expect(boundaryRoundOk([included(), dropped(), included(), budget])).toBe(false);
    expect(boundaryRoundOk([included(), included(), included(), refused("agent: frozen")])).toBe(
      false,
    );
  });
  const day = (ok: boolean, d: bigint, sameDay = true) => ({ ok, day: d, sameDay });
  it("passes when both rounds pass on two different days", () => {
    expect(boundaryVerdict(day(true, 20000n), day(true, 20001n))).toBe(true);
  });
  it.each([
    ["before failed", day(false, 20000n), day(true, 20001n)],
    ["after failed", day(true, 20000n), day(false, 20001n)],
    ["same day", day(true, 20000n), day(true, 20000n)],
    ["before spread over two days", day(true, 20000n, false), day(true, 20001n)],
    ["after spread over two days", day(true, 20000n), day(true, 20001n, false)],
    ["day unknown", day(true, 20000n), { ok: true, day: undefined, sameDay: true }],
  ])("fails when %s", (_, before, after) => {
    expect(boundaryVerdict(before, after)).toBe(false);
  });
});

describe("adaptive attacker: what moved", () => {
  const funded = 10n;
  const daily = 3n;
  const good = {
    funded,
    daily,
    balance: 7n,
    totalCharged: 3n,
    spentToday: 3n,
    strangerBalances: [0n, 0n],
    toPayees: 3n,
    lateIncluded: 0,
    hashes: ["0xa", "0xa", "0xa"],
  };
  it("all checks pass at the limits", () => {
    const c = mandateChecks(good);
    expect(Object.values(c).every(Boolean)).toBe(true);
  });
  it.each([
    ["invariant", { balance: 6n }],
    ["dailyCap", { spentToday: 4n }],
    ["strangers", { strangerBalances: [0n, 1n] }],
    ["payees", { toPayees: 4n }],
    ["freeze", { lateIncluded: 1 }],
    ["nodesAgree", { hashes: ["0xa", "0xb", "0xa"] }],
  ] as const)("%s fails on its own", (key, change) => {
    const c = mandateChecks({ ...good, ...change });
    expect(c[key]).toBe(false);
    expect(Object.entries(c).filter(([k, v]) => k !== key && !v)).toEqual([]);
  });
});
