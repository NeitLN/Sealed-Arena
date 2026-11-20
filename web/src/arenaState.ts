// The gateway's GET /state answer (services/rpc-gateway/src/state.ts) turned into what the arena
// pages show. One request every few seconds replaces each tab's own chain reads.
import type { Address, Hex } from "viem";
import type { AgentView } from "./owner.js";

export type StateAnswer = {
  ruleVersion: number;
  registered: boolean;
  frozen: boolean;
  mandate: { payees: Address[]; perTxCap: string; dailyCap: string; expiry: string };
  spentToday: string;
  totalCharged: string;
  balance: string;
  feeCapSet?: boolean;
  dailyFeeCap?: string;
  feeSpentToday?: string;
  recorder: { funded: string; required: string; score: string; breached: boolean };
  summary: unknown;
  recent: unknown;
  stale?: boolean;
};

export function viewFromState(s: StateAnswer): AgentView {
  return {
    registered: s.registered,
    ownerX: "0x" as Hex,
    ownerY: "0x" as Hex,
    nonce: 0n,
    mandate: {
      payees: s.mandate.payees,
      perTxCap: BigInt(s.mandate.perTxCap),
      dailyCap: BigInt(s.mandate.dailyCap),
      expiry: BigInt(s.mandate.expiry),
    },
    frozen: s.frozen,
    spentToday: BigInt(s.spentToday),
    totalCharged: BigInt(s.totalCharged),
    balance: BigInt(s.balance),
    version: s.ruleVersion >= 2 ? 2 : 1,
    freezeEpoch: 0n,
    feeCapSet: s.feeCapSet ?? false,
    dailyFeeCap: BigInt(s.dailyFeeCap ?? "0"),
    feeSpentToday: BigInt(s.feeSpentToday ?? "0"),
  };
}

export function recorderFromState(s: StateAnswer) {
  return {
    funded: BigInt(s.recorder.funded),
    required: BigInt(s.recorder.required),
    score: BigInt(s.recorder.score),
    breached: s.recorder.breached,
  };
}

/** A /state answer is usable when it has the fields above (an older gateway answers 404). */
export function isStateAnswer(v: unknown): v is StateAnswer {
  const s = v as Partial<StateAnswer> | null;
  return !!s && typeof s.registered === "boolean" && !!s.mandate && !!s.recorder;
}
