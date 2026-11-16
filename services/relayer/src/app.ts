import { getConnInfo } from "@hono/node-server/conninfo";
import { AGENT_POLICY_ADDRESS, agentPolicyAbi } from "@sealed-arena/shared";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { type Address, decodeFunctionData, type Hex, isHex } from "viem";

/** The owner actions the relayer sends. Each carries the owner's passkey proof, checked by the precompile. */
export const RELAYED = new Set(["register", "setMandate", "freeze", "unfreeze"]);

/** What the relayer needs from the chain; the real one is in chain.ts. */
export type RelayChain = {
  relayer: Address;
  chainId: number;
  /** eth_call of the action from the relayer; throws with the node's message if it would revert. */
  simulate(data: Hex): Promise<void>;
  /** Whether `agent` may send transactions (TxAllowList role > 0). Only those are registered. */
  canSend(agent: Address): Promise<boolean>;
  /** Sends the action from the relayer and waits for the receipt. */
  send(data: Hex): Promise<{ transaction: Hex; status: "success" | "reverted" }>;
};

export type RelayerOptions = {
  chain: RelayChain;
  /** Requests per minute per client address. */
  perMinute?: number;
  /** Take the client address from X-Forwarded-For (only behind a proxy you run). */
  trustProxy?: boolean;
  /** RPC URL the web app should read the chain from (returned by /info). */
  publicRpc?: string;
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
  const hits = new Map<string, number[]>();
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
      const r = await o.chain.send(data);
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

  return app;
}
