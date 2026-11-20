import { getConnInfo } from "@hono/node-server/conninfo";
import {
  AGENT_POLICY_ADDRESS,
  agentPolicyAbi,
  arenaRecorderAbi,
  type PolicyIds,
  type RuleVersion,
  registerData,
  registerDigestFor,
} from "@sealed-arena/shared";
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
  parseEther,
  recoverAddress,
} from "viem";

/** The owner actions the relayer sends. Each carries the owner's passkey proof, checked by the precompile. */
export const RELAYED = new Set(["register", "setMandate", "setMandateV2", "freeze", "unfreeze"]);

/** What the relayer needs from the chain; the real one is in chain.ts. */
export type RelayChain = {
  relayer: Address;
  chainId: number;
  /** The agent rule version in force and the ids a v2 proof is bound to (returned by /info). */
  policy(): Promise<{ version: RuleVersion; ids: PolicyIds }>;
  /** eth_call of the action from the relayer (to AgentPolicy unless `to` is given); throws with the node's message if it would revert. */
  simulate(data: Hex, to?: Address): Promise<void>;
  /** Whether `agent` may send transactions (TxAllowList role > 0). Only those are registered. */
  canSend(agent: Address): Promise<boolean>;
  /** Sends the action from the relayer and waits for the receipt. */
  send(data: Hex, to?: Address): Promise<{ transaction: Hex; status: "success" | "reverted" }>;
};

/**
 * Gives a demo agent its right to send and its coins, from a key that holds the TxAllowList
 * manager role (never the admin role). Used only after the agent is registered.
 */
export type DemoIssuer = {
  /** Whether the issuing key still holds the TxAllowList manager role (it can be revoked). */
  ready(): Promise<boolean>;
  /** TxAllowList.setEnabled(agent); resolves with the transaction once it is in a block. */
  enable(agent: Address): Promise<Hex>;
  /** Sends `wei` of the native coin to the agent; resolves once it is in a block. */
  fund(agent: Address, wei: bigint): Promise<Hex>;
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
  /** Minimum time between two owner actions (/relay, except freeze) for the same agent (default 15 s). */
  agentGapMs?: number;
  /** Owner actions (/relay, except freeze) per agent in any hour (default 20). */
  agentPerHour?: number;
  /** Clock, for tests. */
  now?: () => number;
  /** Allowed browser origins (CORS). Default: any. */
  origins?: string[];
  /** Enables POST /demo/claim: a new agent for a visitor's passkey (see createRelayerApp). */
  demo?: {
    issuer: DemoIssuer;
    /** Coins given to each demo agent (default 0.05). */
    funding?: bigint;
    /**
     * Agents per client address: one per this many ms (default 10 minutes). Only claims whose
     * register transaction was sent count.
     */
    perClientMs?: number;
    /** Agents per UTC day in total (default 40). */
    perDay?: number;
  };
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

/** Whole seconds until `ms` milliseconds have passed, at least 1. */
const seconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

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
  const HOUR = 3_600_000;
  const agentGap = o.agentGapMs ?? 15_000;
  const agentPerHour = o.agentPerHour ?? 20;
  /** Owner actions sent (or in flight) in the last hour, per agent (lower case). */
  const agentSends = new Map<string, number[]>();
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

  app.get("/info", async (c) => {
    const p = await o.chain.policy().catch(() => undefined);
    return c.json({
      relayer: o.chain.relayer,
      chainId: o.chain.chainId,
      target: AGENT_POLICY_ADDRESS,
      ...(o.publicRpc ? { rpc: o.publicRpc } : {}),
      ...(p
        ? { ruleVersion: p.version, networkId: p.ids.networkId, blockchainId: p.ids.blockchainId }
        : {}),
    });
  });

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

    // Every owner action names its agent first. One owner of one agent could otherwise loop
    // setMandateV2 or unfreeze and spend the relayer's gas for everyone, so each agent gets a few
    // sends per hour, whoever asks. Freezing is never limited: it is the owner's stop button.
    // The slot is checked and taken only after the simulation passed (so a request with a junk
    // proof never holds one), with no await in between (so two requests cannot both pass), and
    // given back if the send fails.
    let release = () => {};
    if (name !== "freeze") {
      const key = String(args?.[0]).toLowerCase();
      const at = clock();
      const sends = (agentSends.get(key) ?? []).filter((s) => at - s < HOUR);
      const latest = sends[sends.length - 1];
      const oldest = sends[0];
      const wait =
        latest !== undefined && at - latest < agentGap
          ? agentGap - (at - latest)
          : oldest !== undefined && sends.length >= agentPerHour
            ? HOUR - (at - oldest)
            : 0;
      if (wait > 0) {
        c.header("Retry-After", String(seconds(wait)));
        return c.json({ ok: false, error: "agent_rate_limited", retryAfter: seconds(wait) }, 429);
      }
      sends.push(at);
      agentSends.set(key, sends);
      release = () => {
        const list = agentSends.get(key);
        const i = list?.lastIndexOf(at) ?? -1;
        if (list && i >= 0) list.splice(i, 1);
        if (list?.length === 0) agentSends.delete(key);
      };
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
      release();
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

  // The browser signs registration with its own new key. Register FIRST, then allow and fund:
  // an enabled key without an owner-bound policy must never exist. No private key crosses this API.
  const demoLast = new Map<string, number>();
  const demoDays = new Map<number, number>();
  const DAY = 86_400_000;
  app.post("/demo/claim", async (c) => {
    const demo = o.demo;
    if (!demo) return c.json({ ok: false, error: "no_demo" }, 404);
    // Revoked on purpose (RUNBOOK, "if the relayer host is suspected"): say so instead of failing later.
    if (!(await demo.issuer.ready().catch(() => false)))
      return c.json({ ok: false, error: "demo-disabled" }, 503);
    const body = (await c.req.json().catch(() => undefined)) as
      | { agent?: unknown; ownerX?: unknown; ownerY?: unknown; agentSig?: unknown }
      | undefined;
    const agent = body?.agent;
    const sig = body?.agentSig;
    const x = body?.ownerX;
    const y = body?.ownerY;
    const word = (v: unknown): v is Hex => isHex(v) && v.length === 66;
    if (!word(x) || !word(y)) return c.json({ ok: false, error: "passkey_invalid" }, 400);

    if (typeof agent !== "string" || !isAddress(agent) || !isHex(sig) || sig.length !== 132)
      return c.json({ ok: false, error: "signature_invalid" }, 400);

    const ip = client(c);
    const now = clock();
    const day = Math.floor(now / DAY);
    const window = demo.perClientMs ?? 10 * 60_000;
    const last = demoLast.get(ip);
    if (last !== undefined && now - last < window) {
      const retryAfter = seconds(window - (now - last));
      c.header("Retry-After", String(retryAfter));
      return c.json({ ok: false, error: "demo_rate_limited", retryAfter, windowMs: window }, 429);
    }
    if ((demoDays.get(day) ?? 0) >= (demo.perDay ?? 40)) {
      const retryAfter = seconds((day + 1) * DAY - now);
      c.header("Retry-After", String(retryAfter));
      return c.json({ ok: false, error: "demo_cap", retryAfter }, 429);
    }
    // Both counters are taken before any await, so two claims arriving together cannot both
    // pass. They are given back on every path where no register transaction was sent: a bad
    // signature or a failing node must not use up a visitor's slot or the day's agents.
    const previous = last;
    demoLast.set(ip, now);
    demoDays.set(day, (demoDays.get(day) ?? 0) + 1);
    const release = () => {
      if (demoLast.get(ip) === now) {
        if (previous === undefined) demoLast.delete(ip);
        else demoLast.set(ip, previous);
      }
      const n = demoDays.get(day) ?? 0;
      if (n > 1) demoDays.set(day, n - 1);
      else demoDays.delete(day);
    };

    let policy: { version: RuleVersion; ids: PolicyIds };
    try {
      policy = await o.chain.policy();
    } catch (e) {
      release();
      return c.json(
        { ok: false, error: "send_failed", function: "register", reason: revertReason(e) },
        502,
      );
    }
    try {
      const signer = await recoverAddress({
        hash: registerDigestFor(policy.version, policy.ids, agent, x, y),
        signature: sig,
      });
      if (signer.toLowerCase() !== agent.toLowerCase()) {
        release();
        return c.json({ ok: false, error: "signature_invalid" }, 400);
      }
    } catch {
      release();
      return c.json({ ok: false, error: "signature_invalid" }, 400);
    }
    const data = registerData(agent, x, y, sig);
    try {
      await o.chain.simulate(data);
    } catch (e) {
      release();
      return c.json(
        { ok: false, error: "reverted", function: "register", reason: revertReason(e) },
        422,
      );
    }
    let register: Hex;
    try {
      const r = await send(data);
      // From here a register transaction was sent and paid for: the claim keeps its slot.
      if (r.status !== "success")
        return c.json(
          { ok: false, error: "reverted", function: "register", transaction: r.transaction },
          422,
        );
      register = r.transaction;
    } catch (e) {
      release();
      return c.json(
        { ok: false, error: "send_failed", function: "register", reason: revertReason(e) },
        502,
      );
    }
    try {
      const enable = await demo.issuer.enable(agent);
      const fund = await demo.issuer.fund(agent, demo.funding ?? parseEther("0.05"));
      return c.json({
        ok: true,
        agent: agent,
        transactions: { register, enable, fund },
      });
    } catch (e) {
      // Registered but not (yet) allowed: it can send nothing, which is safe.
      return c.json(
        { ok: false, error: "issue_failed", agent: agent, reason: revertReason(e) },
        502,
      );
    }
  });

  return app;
}
