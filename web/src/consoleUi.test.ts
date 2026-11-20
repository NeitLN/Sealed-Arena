import { describe, expect, it } from "vitest";
import { classifyRelay, explain, formErrorVisible } from "./consoleUi.js";

const TX = "0xabc" as const;

describe("classifyRelay", () => {
  it("reports a sent transaction as ok", () => {
    expect(classifyRelay({ ok: true, function: "freeze", transaction: TX })).toEqual({
      kind: "ok",
      tx: TX,
    });
  });
  it("reports refused only for a reverted transaction with a reason", () => {
    expect(
      classifyRelay({ ok: false, error: "reverted", reason: "agent: frozen", transaction: TX }),
    ).toEqual({ kind: "refused", reason: "agent: frozen", tx: TX });
  });
  it("reports a relayer send failure as an error, keeping the reason as detail", () => {
    expect(classifyRelay({ ok: false, error: "send_failed", reason: "nonce too low" })).toEqual({
      kind: "error",
      code: "send_failed",
      detail: "nonce too low",
    });
  });
  it("reports a revert without a reason as an error", () => {
    expect(classifyRelay({ ok: false, error: "reverted", transaction: TX })).toEqual({
      kind: "error",
      code: "reverted",
      tx: TX,
    });
  });
  it("reports infrastructure errors as errors even when they carry a reason", () => {
    for (const error of ["rate_limited", "relayer_down", "agent_not_allowed", "x_unknown"])
      expect(classifyRelay({ ok: false, error, reason: "something" }).kind).toBe("error");
  });
});

describe("explain", () => {
  const dict: Record<string, string> = { send_failed: "Could not send", errorGeneric: "Generic" };
  const t = (k: string) => dict[k] ?? k;
  it("uses the translated string when the code has one", () => {
    expect(explain(t, "send_failed")).toBe("Could not send");
  });
  it("uses the generic message instead of a raw code", () => {
    expect(explain(t, "issue_failed")).toBe("Generic");
  });
});

describe("formErrorVisible", () => {
  it("hides the first problem until the owner touched the form or payees are filled", () => {
    expect(formErrorVisible("payees_empty", { touched: false, payeesText: "" })).toBe(false);
    expect(formErrorVisible("payees_empty", { touched: true, payeesText: "" })).toBe(true);
    expect(formErrorVisible("amount_invalid", { touched: false, payeesText: "0x1" })).toBe(true);
  });
  it("shows nothing when the form is valid", () => {
    expect(formErrorVisible(undefined, { touched: true, payeesText: "0x1" })).toBe(false);
  });
});
