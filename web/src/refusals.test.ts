import { describe, expect, it } from "vitest";
import { countReasons, lastSeen } from "./refusals.js";

const agent = "0x30b01562945BB3cE72241b0EaaEB3F41660982F6";

const memory = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  };
};

describe("refusals since the last visit", () => {
  it("the first visit starts now; later visits keep the stored time (per agent, any case)", () => {
    const s = memory();
    expect(lastSeen(agent, 1000, s)).toBe(1000);
    expect(lastSeen(agent, 5000, s)).toBe(1000);
    expect(lastSeen(agent.toLowerCase() as typeof agent, 9000, s)).toBe(1000);
    expect(lastSeen("0x0000000000000000000000000000000000000001", 7000, s)).toBe(7000);
  });

  it("counts reasons, most frequent first", () => {
    expect(
      countReasons([
        { ts: 1, to: "a", reason: "agent: frozen" },
        { ts: 2, to: "b", reason: "agent: payee not allowed" },
        { ts: 3, to: "b", reason: "agent: payee not allowed" },
      ]),
    ).toEqual([
      ["agent: payee not allowed", 2],
      ["agent: frozen", 1],
    ]);
  });
});
