import { describe, expect, it } from "vitest";
import { replay, runAgent, type Tool } from "./agent.js";
import { ScriptedModel } from "./model.js";
import { outcome, parseAmount } from "./tools.js";

const echo: Tool = {
  name: "echo",
  description: "echo",
  input_schema: { type: "object" },
  run: async (input) => JSON.stringify({ said: input.text }),
};
const boom: Tool = {
  name: "boom",
  description: "throws",
  input_schema: { type: "object" },
  run: async () => {
    throw new Error("kaput");
  },
};

describe("runAgent", () => {
  it("runs each tool call, feeds results back, and stops when the model stops calling tools", async () => {
    const model = new ScriptedModel([
      { text: "first", toolCalls: [{ id: "a", name: "echo", input: { text: "hi" } }] },
      {
        text: "",
        toolCalls: [
          { id: "b", name: "boom", input: {} },
          { id: "c", name: "nope", input: {} },
        ],
      },
      { text: "all done", toolCalls: [] },
    ]);
    const t = await runAgent({
      model,
      tools: [echo, boom],
      system: "s",
      task: "do it",
      scenario: "test",
    });
    expect(t.finished).toBe(true);
    expect(t.notes).toEqual(["first", "all done"]);
    expect(t.calls.map((c) => [c.step, c.name, c.output])).toEqual([
      [0, "echo", '{"said":"hi"}'],
      [1, "boom", "error: kaput"],
      [1, "nope", "error: no tool named nope"],
    ]);
    // The second request carried the first tool result back to the model.
    expect(model.seen[1]?.at(-1)).toEqual({
      role: "tool",
      results: [{ id: "a", content: '{"said":"hi"}' }],
    });
  });

  it("stops after maxSteps even if the model keeps calling tools", async () => {
    const loop = { text: "", toolCalls: [{ id: "x", name: "echo", input: { text: "again" } }] };
    const model = new ScriptedModel(Array.from({ length: 10 }, () => loop));
    const t = await runAgent({
      model,
      tools: [echo],
      system: "s",
      task: "t",
      scenario: "test",
      maxSteps: 3,
    });
    expect(t.finished).toBe(false);
    expect(t.calls).toHaveLength(3);
  });

  it("replays recorded calls in order without a model", async () => {
    const model = new ScriptedModel([
      { text: "", toolCalls: [{ id: "a", name: "echo", input: { text: "one" } }] },
      { text: "", toolCalls: [{ id: "b", name: "echo", input: { text: "two" } }] },
    ]);
    const t = await runAgent({ model, tools: [echo], system: "s", task: "t", scenario: "test" });
    const again = await replay(t, [echo]);
    expect(again.map((c) => c.output)).toEqual(t.calls.map((c) => c.output));
  });
});

describe("outcome", () => {
  const rec = (name: string, input: Record<string, unknown>, output: unknown) => ({
    step: 0,
    name,
    input,
    output: JSON.stringify(output),
  });

  it("names a paid purchase without hashes", () => {
    expect(
      outcome(
        rec(
          "fetch_url",
          { url: "http://s/a" },
          { status: 200, paid: { success: true, transaction: "0xabc" }, body: "x" },
        ),
      ),
    ).toBe("fetch_url http://s/a: 200 paid");
  });

  it("names the rule that refused a direct payment", () => {
    expect(
      outcome(
        rec(
          "send_payment",
          { to: "0xdead" },
          { sent: false, rejectedByNode: "agent: payee not allowed: 0xdead" },
        ),
      ),
    ).toBe("send_payment 0xdead: refused (agent: payee not allowed)");
  });

  it("is the same for two runs that differ only in hashes", () => {
    const a = rec(
      "send_payment",
      { to: "0x1" },
      { sent: true, transaction: "0xaaa", status: "success" },
    );
    const b = rec(
      "send_payment",
      { to: "0x1" },
      { sent: true, transaction: "0xbbb", status: "success" },
    );
    expect(outcome(a)).toBe(outcome(b));
  });
});

describe("parseAmount", () => {
  it.each([
    ["1", 10n ** 18n],
    ["0.5", 5n * 10n ** 17n],
    ["0.000000000000000001", 1n],
  ])("parses %s", (s, want) => {
    expect(parseAmount(s)).toBe(want);
  });

  it.each(["", "-1", "1e3", "0.0000000000000000001", "abc"])("refuses %j", (s) => {
    expect(parseAmount(s)).toBeUndefined();
  });
});
