/**
 * The language model behind the agent, behind a small interface so the loop can run with a
 * real provider, with a scripted stand-in in tests, or not at all (replay).
 */

export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema of the input object. */
  input_schema: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

/** One turn of the conversation, in a provider-neutral shape. */
export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: ToolCall[] }
  | { role: "tool"; results: { id: string; content: string }[] };

export type ModelReply = { text: string; toolCalls: ToolCall[] };

export interface Model {
  readonly name: string;
  next(system: string, turns: Turn[], tools: ToolSpec[]): Promise<ModelReply>;
}

/** Anthropic Messages API over fetch (no SDK). */
export class AnthropicModel implements Model {
  readonly name: string;

  constructor(
    private readonly o: {
      apiKey: string;
      model: string;
      /** Needed when the key is not scoped to one workspace. */
      workspaceId?: string | undefined;
      maxTokens?: number;
      fetch?: typeof fetch;
    },
  ) {
    this.name = `anthropic:${o.model}`;
  }

  async next(system: string, turns: Turn[], tools: ToolSpec[]): Promise<ModelReply> {
    const messages = turns.map((t) => {
      if (t.role === "user") return { role: "user", content: t.text };
      if (t.role === "assistant") {
        return {
          role: "assistant",
          content: [
            ...(t.text ? [{ type: "text", text: t.text }] : []),
            ...t.toolCalls.map((c) => ({
              type: "tool_use",
              id: c.id,
              name: c.name,
              input: c.input,
            })),
          ],
        };
      }
      return {
        role: "user",
        content: t.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
        })),
      };
    });
    const headers: Record<string, string> = {
      "x-api-key": this.o.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (this.o.workspaceId) headers["anthropic-workspace-id"] = this.o.workspaceId;
    const res = await (this.o.fetch ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.o.model,
        max_tokens: this.o.maxTokens ?? 1024,
        system,
        tools,
        messages,
      }),
    });
    const body = (await res.json()) as {
      content?: Array<{
        type: string;
        text?: string;
        id?: string;
        name?: string;
        input?: Record<string, unknown>;
      }>;
      error?: { type: string; message: string };
    };
    if (!res.ok || !body.content) {
      throw new Error(
        `model API ${res.status}: ${body.error?.type ?? ""} ${body.error?.message ?? ""}`,
      );
    }
    return {
      text: body.content
        .filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("\n"),
      toolCalls: body.content
        .filter((b) => b.type === "tool_use")
        .map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input ?? {} })),
    };
  }
}

/** Plays back fixed replies in order; for tests. */
export class ScriptedModel implements Model {
  readonly name = "scripted";
  private i = 0;
  readonly seen: Turn[][] = [];

  constructor(private readonly replies: ModelReply[]) {}

  async next(_system: string, turns: Turn[]): Promise<ModelReply> {
    this.seen.push(structuredClone(turns));
    return this.replies[this.i++] ?? { text: "done", toolCalls: [] };
  }
}

/** The model named by LLM_PROVIDER / LLM_MODEL. Only Anthropic is wired in. */
export function modelFromEnv(env: NodeJS.ProcessEnv = process.env): Model {
  const provider = env.LLM_PROVIDER || "anthropic";
  if (provider !== "anthropic") {
    throw new Error(`LLM_PROVIDER=${provider} is not supported yet; use anthropic`);
  }
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set (put it in .env)");
  return new AnthropicModel({
    apiKey,
    model: env.LLM_MODEL || "claude-sonnet-5-5",
    workspaceId: env.ANTHROPIC_WORKSPACE_ID || undefined,
  });
}
