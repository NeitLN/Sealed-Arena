// "Refused since your last visit" for the owner console: the agent's payments the gateway saw
// refused by the node after the time the owner last marked them as seen (kept in this browser).
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { GATEWAY_URL } from "./arena.config.js";
import { poll } from "./poll.js";

export type Refusal = { ts: number; to: string; reason: string; source?: string };

/** Rows fetched per poll; at this many the true count may be higher. */
export const REFUSAL_LIMIT = 50;

/** The count to show: "50+" once the page is full. */
export const refusalCount = (n: number) =>
  n >= REFUSAL_LIMIT ? `${REFUSAL_LIMIT}+` : String(n);

const key = (agent: Address) => `sealed.refusals.seen.${agent.toLowerCase()}`;

/** The time this browser last marked the agent's refusals as seen; the first visit starts now. */
export function lastSeen(
  agent: Address,
  now: number,
  store: Pick<Storage, "getItem" | "setItem">,
): number {
  const v = Number(store.getItem(key(agent)));
  if (Number.isFinite(v) && v > 0) return v;
  store.setItem(key(agent), String(now));
  return now;
}

/** Reasons and how often each occurred, most frequent first. */
export function countReasons(rows: Refusal[]): [string, number][] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.reason, (m.get(r.reason) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function useRefusals(agent: Address | undefined) {
  const [rows, setRows] = useState<Refusal[]>([]);
  const [since, setSince] = useState<number>();

  useEffect(() => {
    setRows([]);
    if (!agent) return setSince(undefined);
    try {
      setSince(lastSeen(agent, Date.now(), localStorage));
    } catch {
      setSince(Date.now());
    }
  }, [agent]);

  const read = useCallback(async () => {
    if (!agent || since === undefined) return true;
    try {
      const r = await fetch(
        `${GATEWAY_URL}/attempts/recent?limit=${REFUSAL_LIMIT}&result=rejected&from=${agent}&since=${since}`,
      );
      if (!r.ok) return false;
      setRows((await r.json()) as Refusal[]);
      return true;
    } catch {
      return false;
    }
  }, [agent, since]);

  useEffect(() => poll(read, 30_000), [read]);

  const markSeen = () => {
    if (!agent) return;
    const now = Date.now();
    try {
      localStorage.setItem(key(agent), String(now));
    } catch {
      // private window: the banner simply resets on reload
    }
    setSince(now);
    setRows([]);
  };

  return { rows, since, markSeen };
}
