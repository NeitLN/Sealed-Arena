import { describe, expect, it } from "vitest";
import { reasonFromRpc } from "./scheme.js";

describe("reasonFromRpc", () => {
  it.each([
    ["agent: payee not allowed: 0xabc", "agent_payee_not_allowed"],
    ["agent: budget exceeded: charge 5 above perTxCap 1", "agent_budget_exceeded"],
    ["agent: frozen", "agent_frozen"],
    ["agent: mandate expired", "agent_mandate_expired"],
    ["agent: payee has code: 0xabc", "agent_payee_has_code"],
    ["already known", "invalid_exact_native_payload_already_submitted"],
    ["nonce too low: next nonce 3, tx nonce 2", "invalid_exact_native_payload_nonce_used"],
    ["insufficient funds for gas * price + value", "insufficient_funds"],
    ["something else", "transaction_rejected"],
  ])("maps %j to %s", (message, reason) => {
    expect(reasonFromRpc(new Error(message))).toBe(reason);
  });
});
