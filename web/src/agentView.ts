// The owner console's view of one agent, read from the chain every few seconds. A late answer for
// an agent the page no longer shows is dropped, and a failed read keeps the last good view (marked
// as old) instead of emptying the page.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, PublicClient } from "viem";
import { type AgentView, readAgent } from "./owner.js";
import { poll } from "./poll.js";

export type AgentRead = {
  agent: Address | undefined;
  view: AgentView | undefined;
  /** When reads started failing (ms), while they still fail. */
  failedSince: number | undefined;
};

export const initialRead = (agent: Address | undefined): AgentRead => ({
  agent,
  view: undefined,
  failedSince: undefined,
});

/** The state after a read for `asked` came back. */
export function onRead(
  s: AgentRead,
  asked: Address,
  r: { ok: true; view: AgentView } | { ok: false },
  now: number,
): AgentRead {
  if (s.agent !== asked) return s;
  if (r.ok) return { agent: asked, view: r.view, failedSince: undefined };
  return { ...s, failedSince: s.failedSince ?? now };
}

/** Polls the agent every `base` ms; `refresh` reads once now and resolves when the view is in. */
export function useAgentView(
  client: PublicClient | undefined,
  agent: Address | undefined,
  base = 5000,
) {
  const [state, setState] = useState<AgentRead>(() => initialRead(agent));
  const current = useRef(agent);

  const read = useCallback(async (): Promise<boolean> => {
    const asked = current.current;
    if (!client || !asked) return true;
    try {
      const view = await readAgent(client, asked);
      setState((s) => onRead(s, asked, { ok: true, view }, Date.now()));
      return true;
    } catch {
      setState((s) => onRead(s, asked, { ok: false }, Date.now()));
      return false;
    }
  }, [client]);

  useEffect(() => {
    current.current = agent;
    setState(initialRead(agent));
    if (!client || !agent) return;
    return poll(read, base);
  }, [client, agent, read, base]);

  return { ...state, refresh: read };
}
