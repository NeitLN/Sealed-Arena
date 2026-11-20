// The PASS/FAIL decisions of edge.ts and adaptive.ts, kept free of network calls so that they can
// be tested on their own (verdicts.test.ts).
import type { Sent } from "./probe.js";

export type Verdict = "PASS" | "FAIL" | "NOT RUN";

const ONE_GWEI = 1_000_000_000n;
const INTRINSIC_GAS = 21_000n;

export const verdictOf = (ok: boolean | "not run"): Verdict =>
  ok === "not run" ? "NOT RUN" : ok ? "PASS" : "FAIL";

export const refusedWith = (s: Sent, text: string) =>
  s.status === "refused" && s.reason.includes(text);

/** b5: a high fee cap inside every cap pays only base fee + at most 1 gwei tip, while the maximum
 * fee (gas limit x fee cap) is what counts toward the caps. */
export function highFeeCapVerdict(r: {
  success: boolean;
  effectiveTip: bigint;
  balanceDrop: bigint;
  paidFee: bigint;
  value: bigint;
  counted: bigint;
  maxFeePerGas: bigint;
}) {
  return (
    r.success &&
    r.effectiveTip <= ONE_GWEI &&
    r.balanceDrop === r.value + r.paidFee &&
    r.counted === r.value + INTRINSIC_GAS * r.maxFeePerGas
  );
}

/** c: at least one trial raced the freeze, and no raced payment was included or kept in the pool. */
export function freezeRaceVerdict(trials: { beforeFreeze: boolean; payment: Sent }[]) {
  const raced = trials.filter((t) => !t.beforeFreeze);
  return (
    raced.length > 0 &&
    raced.every((t) => t.payment.status !== "included") &&
    trials.every((t) => !(t.payment.status === "not included" && t.payment.inPool))
  );
}

/** d: paid while the payee had no code, then refused for its code. */
export const payeeGetsCodeVerdict = (first: Sent, code: string | undefined, second: Sent) =>
  first.status === "included" &&
  !!code &&
  code !== "0x" &&
  refusedWith(second, "agent: payee has code");

/** a: one round = three payments of 0.99 included, the fourth refused for the daily cap. */
export const boundaryRoundOk = (out: Sent[]) =>
  out.length === 4 &&
  out.slice(0, 3).every((s) => s.status === "included") &&
  refusedWith(out[3] as Sent, "agent: budget exceeded");

type Round = { ok: boolean; day: bigint | undefined; sameDay: boolean };

/** a: both rounds pass, each within one day, and on two different days. */
export const boundaryVerdict = (before: Round, after: Round) =>
  before.ok &&
  before.sameDay &&
  after.ok &&
  after.sameDay &&
  before.day !== undefined &&
  after.day !== undefined &&
  after.day !== before.day;

/** Adaptive attacker: what moved after the run, each check on its own. */
export function mandateChecks(m: {
  funded: bigint;
  daily: bigint;
  balance: bigint;
  totalCharged: bigint;
  spentToday: bigint;
  strangerBalances: readonly bigint[];
  toPayees: bigint;
  lateIncluded: number;
  hashes: readonly string[];
}) {
  return {
    invariant: m.balance >= m.funded - m.totalCharged,
    dailyCap: m.spentToday <= m.daily,
    strangers: m.strangerBalances.every((b) => b === 0n),
    payees: m.toPayees <= m.daily,
    freeze: m.lateIncluded === 0,
    nodesAgree: m.hashes.length > 0 && m.hashes.every((h) => h === m.hashes[0]),
  };
}
