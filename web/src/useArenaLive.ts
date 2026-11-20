import { arenaRecorderAbi } from "@sealed-arena/shared";
import { useCallback, useEffect, useState } from "react";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { isStateAnswer, recorderFromState, viewFromState } from "./arenaState.js";
import { type AgentView, chainClient, readAgent } from "./owner.js";
import { poll } from "./poll.js";

export const RPC = `${GATEWAY_URL}/rpc`;

export type Summary = {
  total: number;
  accepted: number;
  rejected: number;
  byReason: Record<string, number>;
  distinctSenders: number;
};
export type Attempt = { ts: number; to: string; value: string; result: string; reason: string };
export type Recorder = { funded: bigint; required: bigint; score: bigint; breached: boolean };

/**
 * Live state of the open challenge: the agent and its mandate (chain), the ArenaRecorder record
 * (chain), and the attempts the gateway logged. Polls the gateway every 5 s and the chain every
 * 15 s (see poll.ts); `error` is set after two failed polls in a row and cleared by the next success.
 */
export function useArenaLive(recentLimit = 15) {
  const [client] = useState(() => chainClient(RPC, { live: true }));
  const [view, setView] = useState<AgentView>();
  const [rec, setRec] = useState<Recorder>();
  const [summary, setSummary] = useState<Summary>();
  const [recent, setRecent] = useState<Attempt[]>();
  const [fails, setFails] = useState(0);
  const [stale, setStale] = useState(false);

  const refreshChain = useCallback(async () => {
    try {
      setView(await readAgent(client, ARENA.agent));
      const read = (fn: string) =>
        client.readContract({
          address: ARENA.recorder,
          abi: arenaRecorderAbi,
          functionName: fn,
          args: [ARENA.agent],
        } as never) as Promise<unknown>;
      const [funded, required, score, breached] = await Promise.all([
        read("funded"),
        read("requiredBalance"),
        read("score"),
        read("breached"),
      ]);
      setRec({
        funded: funded as bigint,
        required: required as bigint,
        score: score as bigint,
        breached: breached as boolean,
      });
      setFails(0);
      return true;
    } catch {
      setFails((n) => n + 1);
      return false;
    }
  }, [client]);

  const refreshAttempts = useCallback(async () => {
    try {
      const q = `from=${ARENA.agent}`;
      const [s, r] = await Promise.all([
        fetch(`${GATEWAY_URL}/attempts/summary?${q}`).then((x) => {
          if (!x.ok) throw new Error(String(x.status));
          return x.json() as Promise<Summary>;
        }),
        fetch(`${GATEWAY_URL}/attempts/recent?limit=${recentLimit}&${q}`).then((x) => {
          if (!x.ok) throw new Error(String(x.status));
          return x.json() as Promise<Attempt[]>;
        }),
      ]);
      setSummary(s);
      setRecent(r);
      setFails(0);
      return true;
    } catch {
      setFails((n) => n + 1);
      return false;
    }
  }, [recentLimit]);

  // One GET /state every 5 s: the gateway answers every tab from one cached snapshot. If the
  // gateway has no /state (404) or it fails, the page falls back to its own reads below.
  const [useState_, setUseState] = useState(true);
  const refreshState = useCallback(async () => {
    try {
      const r = await fetch(`${GATEWAY_URL}/state`);
      if (r.status === 404) {
        setUseState(false);
        return true;
      }
      if (!r.ok) throw new Error(String(r.status));
      const s: unknown = await r.json();
      if (!isStateAnswer(s)) throw new Error("bad state");
      setView(viewFromState(s));
      setRec(recorderFromState(s));
      setSummary(s.summary as Summary);
      setRecent((s.recent as Attempt[]).slice(0, recentLimit));
      setStale(s.stale === true);
      setFails(0);
      return true;
    } catch {
      setFails((n) => n + 1);
      return false;
    }
  }, [recentLimit]);

  useEffect(() => {
    if (useState_) return poll(refreshState, 5_000);
    // Fallback. Every open page polls the public gateway, which limits calls per client IP; people
    // at one event share an IP. So: a chain read (10 calls in one batch) every 15 s, attempts every
    // 5 s, longer waits after failures, nothing while the tab is hidden.
    const a = poll(refreshAttempts, 5_000);
    const b = poll(refreshChain, 15_000);
    return () => {
      a();
      b();
    };
  }, [useState_, refreshState, refreshChain, refreshAttempts]);

  return { view, rec, summary, recent, error: fails >= 2, stale, refreshChain };
}
