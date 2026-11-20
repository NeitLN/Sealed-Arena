import type { Hex } from "viem";
import type { RelayResult } from "./owner.js";

/**
 * What the relayer's answer means for the owner. `refused`: the chain ran the action and said no,
 * with its reason. `error`: the action did not reach the chain or failed without a chain reason
 * (relayer send failure, rate limit, relayer down).
 */
export type RelayOutcome =
  | { kind: "ok"; tx: Hex }
  | { kind: "refused"; reason: string; tx?: Hex }
  | { kind: "error"; code: string; detail?: string; tx?: Hex };

export function classifyRelay(r: RelayResult): RelayOutcome {
  if (r.ok) return { kind: "ok", tx: r.transaction };
  const tx = r.transaction ? { tx: r.transaction } : {};
  if (r.error === "reverted" && r.reason) return { kind: "refused", reason: r.reason, ...tx };
  return {
    kind: "error",
    code: r.error,
    ...(r.error === "send_failed" && r.reason ? { detail: r.reason } : {}),
    ...tx,
  };
}

/** The translated message for an error code, or a generic message when the code has none. */
export function explain(t: (k: string) => string, code: string): string {
  const s = t(code);
  return s === code ? t("errorGeneric") : s;
}

/** Whether to show the form's first problem: only once the owner touched the form or payees are filled. */
export function formErrorVisible(
  error: string | undefined,
  o: { touched: boolean; payeesText: string },
): boolean {
  return !!error && (o.touched || o.payeesText.trim() !== "");
}
