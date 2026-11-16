import type { Model, ToolCall, ToolSpec, Turn } from "./model.js";

/** A tool the agent can call. `run` returns the text the model sees. */
export type Tool = ToolSpec & { run(input: Record<string, unknown>): Promise<string> };

/** One tool call as it happened: what the model asked and what came back. */
export type CallRecord = {
  step: number;
  name: string;
  input: Record<string, unknown>;
  output: string;
};

export type Transcript = {
  version: 1;
  model: string;
  scenario: string;
  task: string;
  system: string;
  calls: CallRecord[];
  /** The model's text replies, in order. */
  notes: string[];
  finished: boolean;
};

/**
 * The agent loop: ask the model, run the tools it calls, feed back the results, repeat.
 * There is no filter between the model and the tools: what the model asks for is sent.
 * Every limit on spending comes from the chain (the mandate), not from this code.
 */
export async function runAgent(o: {
  model: Model;
  tools: Tool[];
  system: string;
  task: string;
  scenario: string;
  maxSteps?: number;
  onCall?: (c: CallRecord) => void;
}): Promise<Transcript> {
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const specs: ToolSpec[] = o.tools.map(({ name, description, input_schema }) => ({
    name,
    description,
    input_schema,
  }));
  const turns: Turn[] = [{ role: "user", text: o.task }];
  const t: Transcript = {
    version: 1,
    model: o.model.name,
    scenario: o.scenario,
    task: o.task,
    system: o.system,
    calls: [],
    notes: [],
    finished: false,
  };

  for (let step = 0; step < (o.maxSteps ?? 20); step++) {
    const reply = await o.model.next(o.system, turns, specs);
    if (reply.text) t.notes.push(reply.text);
    turns.push({ role: "assistant", text: reply.text, toolCalls: reply.toolCalls });
    if (reply.toolCalls.length === 0) {
      t.finished = true;
      break;
    }
    const results: { id: string; content: string }[] = [];
    for (const call of reply.toolCalls) {
      const output = await runTool(byName, call);
      const rec = { step, name: call.name, input: call.input, output };
      t.calls.push(rec);
      o.onCall?.(rec);
      results.push({ id: call.id, content: output });
    }
    turns.push({ role: "tool", results });
  }
  return t;
}

async function runTool(byName: Map<string, Tool>, call: ToolCall): Promise<string> {
  const tool = byName.get(call.name);
  if (!tool) return `error: no tool named ${call.name}`;
  try {
    return await tool.run(call.input);
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/** Runs the recorded tool calls again, in order, without a model. */
export async function replay(
  t: Transcript,
  tools: Tool[],
  onCall?: (c: CallRecord) => void,
): Promise<CallRecord[]> {
  const byName = new Map(tools.map((x) => [x.name, x]));
  const out: CallRecord[] = [];
  for (const c of t.calls) {
    const output = await runTool(byName, {
      id: `replay-${out.length}`,
      name: c.name,
      input: c.input,
    });
    const rec = { ...c, output };
    out.push(rec);
    onCall?.(rec);
  }
  return out;
}
