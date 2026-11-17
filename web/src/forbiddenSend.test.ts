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

  it("a returned hash means the node accepted it", () => {
    expect(classifySend({ hash: "0xabc" })).toEqual({ kind: "accepted", hash: "0xabc" });
  });
});
