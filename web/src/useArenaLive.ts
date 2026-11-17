import { arenaRecorderAbi } from "@sealed-arena/shared";
import { useCallback, useEffect, useState } from "react";
import { ARENA, GATEWAY_URL } from "./arena.config.js";
import { type AgentView, chainClient, readAgent } from "./owner.js";

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
 * (chain), and the attempts the gateway logged. Polls the gateway every 3 s and the chain every
 * 10 s; `error` is set after two failed polls in a row and cleared by the next success.
 */
export function useArenaLive(recentLimit = 15) {
  const [client] = useState(() => chainClient(RPC));
  const [view, setView] = useState<AgentView>();
  const [rec, setRec] = useState<Recorder>();
  const [summary, setSummary] = useState<Summary>();
  const [recent, setRecent] = useState<Attempt[]>();
  const [fails, setFails] = useState(0);

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
    } catch {
      setFails((n) => n + 1);
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
    } catch {
      setFails((n) => n + 1);
    }
  }, [recentLimit]);

  useEffect(() => {
    void refreshChain();
    void refreshAttempts();
    const a = setInterval(() => void refreshAttempts(), 3000);
    const b = setInterval(() => void refreshChain(), 10_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, [refreshChain, refreshAttempts]);

  return { view, rec, summary, recent, error: fails >= 2, refreshChain };
}
