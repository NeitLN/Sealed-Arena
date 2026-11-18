import { describe, expect, it } from "vitest";
import { classifySend } from "./forbiddenSend.js";

describe("classifySend", () => {
  it("a node message starting with 'agent:' is a refusal by the rule, with the reason", () => {
    const e = Object.assign(new Error("RPC Request failed."), {
      details: "agent: payee not allowed: 0x000000000000000000000000000000000000dEaD",
    });
    expect(classifySend({ error: e })).toEqual({
      kind: "refused",
      reason: "agent: payee not allowed",
    });
  });

  it("finds the reason inside a longer message too", () => {
    const e = new Error("Details: agent: budget exceeded\nVersion: viem@2");
    expect(classifySend({ error: e })).toEqual({
      kind: "refused",
      reason: "agent: budget exceeded",
    });
  });

  it("a rate limit is 'busy', never a refusal", () => {
    expect(
      classifySend({ error: Object.assign(new Error("HTTP 429"), { status: 429 }) }).kind,
    ).toBe("busy");
    expect(classifySend({ error: new Error("Details: rate limited") }).kind).toBe("busy");
  });

  it("any other failure is shown as an error with its message", () => {
    expect(classifySend({ error: new Error("nonce too low") })).toEqual({
      kind: "error",
      message: "nonce too low",
    });
  });

  it("a JSON-RPC error that is not the rule's is the node's answer, not a lost connection", () => {
    const e = Object.assign(new Error("Missing or invalid parameters."), {
      code: -32000,
      details: "insufficient funds for gas * price + value: balance 1, tx cost 2",
    });
    expect(classifySend({ error: e })).toEqual({
      kind: "node",
      message: "insufficient funds for gas * price + value: balance 1, tx cost 2",
    });
  });

  it("the rule's reason keeps digits and hyphens", () => {
    const e = Object.assign(new Error("x"), {
      code: -32000,
      details: "agent: payee has code: 0xabc",
    });
    expect(classifySend({ error: e })).toEqual({
      kind: "refused",
      reason: "agent: payee has code",
    });
  });

  it("a returned hash means the node accepted it", () => {
    expect(classifySend({ hash: "0xabc" })).toEqual({ kind: "accepted", hash: "0xabc" });
  });
});
