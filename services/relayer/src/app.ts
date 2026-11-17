import { getConnInfo } from "@hono/node-server/conninfo";
import { AGENT_POLICY_ADDRESS, agentPolicyAbi, arenaRecorderAbi } from "@sealed-arena/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import {
  type Address,
  decodeFunctionData,
  encodeFunctionData,
  type Hex,
  isAddress,
  isHex,
} from "viem";

/** The owner actions the relayer sends. Each carries the owner's passkey proof, checked by the precompile. */
export const RELAYED = new Set(["register", "setMandate", "freeze", "unfreeze"]);

/** What the relayer needs from the chain; the real one is in chain.ts. */
export type RelayChain = {
  relayer: Address;
  chainId: number;
  /** eth_call of the action from the relayer (to AgentPolicy unless `to` is given); throws with the node's message if it would revert. */
  simulate(data: Hex, to?: Address): Promise<void>;
  /** Whether `agent` may send transactions (TxAllowList role > 0). Only those are registered. */
  canSend(agent: Address): Promise<boolean>;
  /** Sends the action from the relayer and waits for the receipt. */
  send(data: Hex, to?: Address): Promise<{ transaction: Hex; status: "success" | "reverted" }>;
};

export type RelayerOptions = {
  chain: RelayChain;
  /** Requests per minute per client address. */
  perMinute?: number;
  /** Take the client address from X-Forwarded-For (only behind a proxy you run). */
  trustProxy?: boolean;
  /** RPC URL the web app should read the chain from (returned by /info). */
  publicRpc?: string;
  /** ArenaRecorder address: enables POST /arena (checkpoint, reportBreach) for the open challenge. */
  arenaRecorder?: Address;
  /** Minimum time between two sends of the same arena action for the same agent (default 60 s). */
  arenaCooldownMs?: number;
  /** Clock, for tests. */
  now?: () => number;
  /** Allowed browser origins (CORS). Default: any. */
  origins?: string[];
};

/** The text the node gave for a revert, without viem's wrapping. */
export function revertReason(e: unknown): string {
  const m = e instanceof Error ? ((e as { details?: string }).details ?? e.message) : String(e);
  return (
    m
      .replace(/^.*execution reverted:?\s*/s, "")
      .split("\n")[0]
      ?.trim() || "reverted"
  );
}

/**
 * Relayer for owner actions on AgentPolicy (docs/ARCHITECTURE.md 3.2, 7). It pays the gas and sends;
 * it cannot forge an action, because the precompile checks the owner's passkey proof. It holds only
 * its own key, never an owner's or an agent's.
 */
export function createRelayerApp(o: RelayerOptions) {
  const perMinute = o.perMinute ?? 10;
  const cooldown = o.arenaCooldownMs ?? 60_000;
  const clock = o.now ?? Date.now;
  /** Last send per `${action}:${agent}`. */
  const lastSent = new Map<string, number>();
  const hits = new Map<string, number[]>();
  // One send at a time from the relayer's key: two sends in flight together would pick the same
  // nonce (an owner's freeze and an arena checkpoint can arrive at once). A failed send does not
  // stop the queue.
  let queue: Promise<unknown> = Promise.resolve();
  const send: RelayChain["send"] = (data, to) => {
    const next = queue.then(() => o.chain.send(data, to));
    queue = next.catch(() => undefined);
    return next;
  };
  const app = new Hono();

  app.use("*", cors({ origin: o.origins ?? "*" }));
  app.use("*", bodyLimit({ maxSize: 32 * 1024 }));

  const client = (c: Parameters<typeof getConnInfo>[0]): string => {
    if (o.trustProxy) {
      const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
      if (fwd) return fwd;
    }
    try {
      return getConnInfo(c).remote.address ?? "unknown";
    } catch {
      return "unknown";
    }
  };

  app.get("/info", (c) =>
    c.json({
      relayer: o.chain.relayer,
      chainId: o.chain.chainId,
      target: AGENT_POLICY_ADDRESS,
      ...(o.publicRpc ? { rpc: o.publicRpc } : {}),
    }),
  );

  app.post("/relay", async (c) => {
    const ip = client(c);
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return c.json({ ok: false, error: "rate_limited" }, 429);
    recent.push(now);
    hits.set(ip, recent);

    const body = (await c.req.json().catch(() => undefined)) as { data?: unknown } | undefined;
    const data = body?.data;
    if (!isHex(data)) return c.json({ ok: false, error: "data_invalid" }, 400);
    let name: string;
    let args: readonly unknown[] | undefined;
    try {
      ({ functionName: name, args } = decodeFunctionData({ abi: agentPolicyAbi, data }));
    } catch {
      return c.json({ ok: false, error: "function_not_allowed" }, 400);
    }
    if (!RELAYED.has(name))
      return c.json({ ok: false, error: "function_not_allowed", function: name }, 400);
    // A public relayer pays gas for anyone; registering throwaway agents would drain it.
    // Only agents the admin already allowed to send are registered.
    if (name === "register" && !(await o.chain.canSend(args?.[0] as Address).catch(() => false))) {
      return c.json({ ok: false, error: "agent_not_allowed", function: name }, 403);
    }

    try {
      await o.chain.simulate(data);
    } catch (e) {
      return c.json({ ok: false, error: "reverted", function: name, reason: revertReason(e) }, 422);
    }
    try {
      const r = await send(data);
      if (r.status !== "success") {
        return c.json(
          { ok: false, error: "reverted", function: name, transaction: r.transaction },
          422,
        );
      }
      return c.json({ ok: true, function: name, ...r });
    } catch (e) {
      return c.json(
        { ok: false, error: "send_failed", function: name, reason: revertReason(e) },
        502,
      );
    }
  });

  // The open challenge's players are not on the TxAllowList, so the relayer sends the two public
  // ArenaRecorder calls for them. It builds the calldata itself; callers only choose the action and agent.
  // On chain the caller (and so the recorded finder) is the relayer.
  app.post("/arena", async (c) => {
    if (!o.arenaRecorder) return c.json({ ok: false, error: "no_arena" }, 404);
    const ip = client(c);
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) return c.json({ ok: false, error: "rate_limited" }, 429);
    recent.push(now);
    hits.set(ip, recent);
    const body = (await c.req.json().catch(() => undefined)) as
      | { action?: unknown; agent?: unknown }
      | undefined;
    const action = body?.action;
    const agent = body?.agent;
    if (
      (action !== "checkpoint" && action !== "reportBreach") ||
      typeof agent !== "string" ||
      !isAddress(agent)
    ) {
      return c.json({ ok: false, error: "bad_request" }, 400);
    }
    // Each send costs the relayer gas, and many clients could ask for the same agent: send one
    // action per agent at most once per cooldown, whoever asks.
    const key = `${action}:${agent.toLowerCase()}`;
    const last = lastSent.get(key);
    if (last !== undefined && clock() - last < cooldown)
      return c.json(
        { ok: false, error: "cooldown", retryAfterMs: cooldown - (clock() - last) },
        429,
      );
    // Taken before any await, so two requests arriving together cannot both send.
    const mark = clock();
    lastSent.set(key, mark);
    const data = encodeFunctionData({ abi: arenaRecorderAbi, functionName: action, args: [agent] });
    try {
      await o.chain.simulate(data, o.arenaRecorder);
    } catch (e) {
      // Nothing was sent: an action the chain refuses does not hold the next one back.
      if (lastSent.get(key) === mark) lastSent.delete(key);
      return c.json({ ok: false, error: "reverted", reason: revertReason(e) }, 422);
    }
    try {
      const r = await send(data, o.arenaRecorder);
      return c.json(
        { ok: r.status === "success", function: action, ...r },
        r.status === "success" ? 200 : 422,
      );
    } catch (e) {
      // Nothing was mined, so the next request for this agent may try again.
      if (lastSent.get(key) === mark) lastSent.delete(key);
      return c.json({ ok: false, error: "send_failed", reason: revertReason(e) }, 502);
    }
  });

  return app;
}
