import { describe, expect, it } from "vitest";
import { type AgentRead, initialRead, onRead } from "./agentView.js";

const A = "0x00000000000000000000000000000000000000a1" as const;
const B = "0x00000000000000000000000000000000000000b2" as const;
const view = (balance: bigint) => ({ balance }) as unknown as NonNullable<AgentRead["view"]>;

describe("onRead", () => {
  it("shows the first view of the agent asked for", () => {
    const s = onRead(initialRead(A), A, { ok: true, view: view(1n) }, 1000);
    expect(s).toMatchObject({ agent: A, view: { balance: 1n }, failedSince: undefined });
  });

  it("drops an answer for another agent (an older request that came back late)", () => {
    const shown = onRead(initialRead(B), B, { ok: true, view: view(2n) }, 1000);
    expect(onRead(shown, A, { ok: true, view: view(1n) }, 2000)).toBe(shown);
  });

  it("keeps the last good view when a read fails, and says since when", () => {
    const good = onRead(initialRead(A), A, { ok: true, view: view(1n) }, 1000);
    const failed = onRead(good, A, { ok: false }, 5000);
    expect(failed.view).toEqual(view(1n));
    expect(failed.failedSince).toBe(5000);
    // A second failure keeps the time of the first.
    expect(onRead(failed, A, { ok: false }, 9000).failedSince).toBe(5000);
    // A good read clears it.
    expect(onRead(failed, A, { ok: true, view: view(3n) }, 12000).failedSince).toBeUndefined();
  });

  it("starts empty when the agent changes", () => {
    expect(initialRead(B)).toEqual({ agent: B, view: undefined, failedSince: undefined });
  });
});
