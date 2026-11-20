import { createHmac } from "node:crypto";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { getAddress, type Hex, isHex, parseTransaction, recoverTransactionAddress } from "viem";
import type { AttemptStore } from "./store.js";

/**
 * Public JSON-RPC gateway of the Sealed L1 (docs/ARCHITECTURE.md section 6): the only way outsiders
 * reach the chain. Forwards an allow-list of methods to the node, records every
 * eth_sendRawTransaction as an attempt (sender, payee, value, result, the rule's reason), and
 * rate-limits per client. Client IPs are only kept as a salted hash.
 */
export const ALLOWED = new Set([
  "eth_chainId",
  "eth_blockNumber",
  "eth_getBalance",
  "eth_getTransactionCount",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getBlockByNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_feeHistory",
  "eth_getCode",
  "eth_getLogs",
  "eth_sendRawTransaction",
  "net_version",
]);

const MAX_BATCH = 20;
const MAX_LOG_BLOCKS = 2048n;

type RpcRequest = { jsonrpc?: string; id?: unknown; method?: unknown; params?: unknown };
type RpcResponse = {
  jsonrpc: "2.0";
  id: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

export type GatewayOptions = {
  /** Sends one request to the node and returns its JSON-RPC response. */
  upstream: (req: {
    jsonrpc: "2.0";
    id: unknown;
    method: string;
    params: unknown;
  }) => Promise<unknown>;
  store: AttemptStore;
  /** Secret salt for hashing client IPs. */
  ipSalt: string;
  trustProxy?: boolean;
  /**
   * Calls per minute per client (default 600). Every open page polls, and people at one event share
   * an IP; sends have their own, lower limit.
   */
  perMinute?: number;
  /** eth_sendRawTransaction per minute per client. */
  sendPerMinute?: number;
  origins?: string[];
  /** How long a /attempts/summary answer is reused (default 2 s): every open page polls it. */
  summaryTtlMs?: number;
  /** Most cached summaries kept at once (default 1000): the filter is caller-chosen. */
  summaryCacheMax?: number;
  /** The cache map, for tests. */
  summaryCache?: Map<string, { at: number; value: Promise<unknown> }>;
  /** Snapshot of the open challenge for GET /state (state.ts); the route is off without it. */
  state?: () => Promise<unknown>;
  /** How long one /state answer is reused (default 3 s). */
  stateTtlMs?: number;
  /** Clock, for tests. */
  now?: () => number;
};

/** "agent: payee not allowed: 0x…" → "agent: payee not allowed"; other node messages keep their first clause. */
export function normalizeReason(message: string): string {
  const m = message.trim();
  if (!m) return "";
  const parts = m.split(":").map((s) => s.trim());
  if (parts[0] === "agent" && parts[1]) return `agent: ${parts[1]}`;
  return parts[0] ?? m;
}

const rpcError = (id: unknown, code: number, message: string): RpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});

/** A block number: "0x" and at least one hex digit (isHex alone accepts "0x", which BigInt refuses). */
const isBlockNumber = (v: unknown): v is string =>
  typeof v === "string" && /^0x[0-9a-fA-F]+$/.test(v);

function logRangeOk(params: unknown): boolean {
  const f = (Array.isArray(params) ? params[0] : undefined) as Record<string, unknown> | undefined;
  if (!f) return false;
  if (typeof f.blockHash === "string") return true;
  if (!isBlockNumber(f.fromBlock) || !isBlockNumber(f.toBlock)) return false;
  const span = BigInt(f.toBlock) - BigInt(f.fromBlock);
  return span >= 0n && span <= MAX_LOG_BLOCKS;
}

export function createGatewayApp(o: GatewayOptions) {
  const perMinute = o.perMinute ?? 600;
  const sendPerMinute = o.sendPerMinute ?? 20;
  const hits = new Map<string, number[]>();
  const sends = new Map<string, number[]>();
  const app = new Hono();
  app.use("*", cors({ origin: o.origins ?? "*" }));
  app.use("*", bodyLimit({ maxSize: 256 * 1024 }));

  const ipHashOf = (c: Parameters<typeof getConnInfo>[0]) => {
    let ip = "unknown";
    if (o.trustProxy) ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || ip;
    if (ip === "unknown") {
      try {
        ip = getConnInfo(c).remote.address ?? ip;
      } catch {
        // tests: no socket
      }
    }
    return createHmac("sha256", o.ipSalt).update(ip).digest("hex").slice(0, 16);
  };
  /** Sliding one-minute window; `cost` calls are taken at once (a batch counts every call). */
  const allow = (m: Map<string, number[]>, key: string, limit: number, cost = 1) => {
    const now = Date.now();
    const recent = (m.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length + cost > limit) return false;
    for (let i = 0; i < cost; i++) recent.push(now);
    m.set(key, recent);
    return true;
  };

  async function handle(req: RpcRequest, ipHash: string, source = "rpc"): Promise<RpcResponse> {
    if (typeof req !== "object" || req === null || Array.isArray(req))
      return rpcError(null, -32600, "invalid request");
    const method = typeof req.method === "string" ? req.method : "";
    if (!ALLOWED.has(method)) return rpcError(req.id, -32601, "method not allowed by the gateway");
    if (method === "eth_getLogs" && !logRangeOk(req.params)) {
      return rpcError(
        req.id,
        -32602,
        `eth_getLogs needs fromBlock/toBlock (hex) at most ${MAX_LOG_BLOCKS} blocks apart, or blockHash`,
      );
    }
    if (method === "eth_sendRawTransaction" && !allow(sends, ipHash, sendPerMinute)) {
      return rpcError(req.id, -32005, "rate limited");
    }
    const res = (await o.upstream({
      jsonrpc: "2.0",
      id: req.id ?? null,
      method,
      params: req.params ?? [],
    })) as RpcResponse;

    if (method === "eth_sendRawTransaction") {
      const raw = Array.isArray(req.params) ? req.params[0] : undefined;
      let from = "";
      let to = "";
      let value = "0";
      if (isHex(raw)) {
        try {
          const tx = parseTransaction(raw);
          to = tx.to ? getAddress(tx.to) : "";
          value = (tx.value ?? 0n).toString();
          from = await recoverTransactionAddress({ serializedTransaction: raw as never });
        } catch {
          // undecodable: recorded with empty fields
        }
      }
      await o.store.add({
        ts: Date.now(),
        ipHash,
        from,
        to,
        value,
        hash: typeof res.result === "string" ? res.result : "",
        result: res.error ? "rejected" : "accepted",
        reason: res.error ? normalizeReason(res.error.message) : "",
        source,
      });
    }
    return res;
  }

  app.post("/", async (c) => {
    const ipHash = ipHashOf(c);
    const source = sourceOf(c.req.header("x-sealed-source"));
    const body = (await c.req.json().catch(() => undefined)) as
      | RpcRequest
      | RpcRequest[]
      | undefined;
    // Every call costs one, so a batch of 20 is not cheaper than 20 requests (body size is capped).
    const cost = Array.isArray(body) ? Math.max(1, Math.min(body.length, MAX_BATCH)) : 1;
    if (!allow(hits, ipHash, perMinute, cost))
      return c.json(rpcError(null, -32005, "rate limited"), 429);
    if (!body) return c.json(rpcError(null, -32700, "parse error"), 400);
    if (Array.isArray(body)) {
      if (body.length === 0 || body.length > MAX_BATCH)
        return c.json(rpcError(null, -32600, `batch of 1 to ${MAX_BATCH}`), 400);
      return c.json(await Promise.all(body.map((r) => handle(r, ipHash, source))));
    }
    return c.json(await handle(body, ipHash, source));
  });

  const fromParam = (q: string | undefined) => (q && /^0x[0-9a-fA-F]{40}$/.test(q) ? q : undefined);
  // GETs are not rate limited and every open page polls the summary, so answers are reused for
  // a short time; the store's aggregate query then runs at most once per TTL per filter.
  const summaryTtl = o.summaryTtlMs ?? 2000;
  const summaryMax = o.summaryCacheMax ?? 1000;
  const clock = o.now ?? Date.now;
  const summaries = o.summaryCache ?? new Map<string, { at: number; value: Promise<unknown> }>();
  app.get("/attempts/summary", async (c) => {
    const from = fromParam(c.req.query("from"));
    const key = from?.toLowerCase() ?? "";
    const hit = summaries.get(key);
    if (hit && clock() - hit.at < summaryTtl) return c.json(await hit.value);
    const value = o.store.summary(from);
    // The filter is chosen by the caller, so keep the map bounded: drop expired entries when it
    // is full, and start over if every entry is still fresh.
    if (summaries.size >= summaryMax) {
      for (const [k, e] of summaries) if (clock() - e.at >= summaryTtl) summaries.delete(k);
      if (summaries.size >= summaryMax) summaries.clear();
    }
    summaries.set(key, { at: clock(), value });
    // A failed read is not cached.
    value.catch(() => summaries.delete(key));
    return c.json(await value);
  });
  // One snapshot of the open challenge for every open page: at most one set of chain reads per
  // TTL, however many tabs poll. A failed snapshot is not cached; the last good one is served
  // (marked stale) while the node does not answer.
  const stateTtl = o.stateTtlMs ?? 3000;
  let snapshot: { at: number; value: Promise<unknown> } | undefined;
  let lastGood: unknown;
  app.get("/state", async (c) => {
    if (!o.state) return c.json({ error: "not configured" }, 404);
    if (!snapshot || clock() - snapshot.at >= stateTtl) {
      const value = o.state();
      snapshot = { at: clock(), value };
      value.then(
        (v) => {
          lastGood = v;
        },
        () => {
          if (snapshot?.value === value) snapshot = undefined;
        },
      );
    }
    try {
      return c.json(await snapshot.value);
    } catch {
      if (lastGood !== undefined) return c.json({ ...(lastGood as object), stale: true });
      return c.json({ error: "node unavailable" }, 503);
    }
  });
  // result=rejected&since=<ms>: what an owner's console shows as "refused since your last visit".
  app.get("/attempts/recent", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    const result = c.req.query("result");
    const since = Number(c.req.query("since"));
    return c.json(
      await o.store.recent(limit, fromParam(c.req.query("from")), {
        ...(result === "accepted" || result === "rejected" ? { result } : {}),
        ...(Number.isFinite(since) && since > 0 ? { since } : {}),
      }),
    );
  });

  return app;
}

export type { Hex };

/** The client's X-Sealed-Source label ("web:arena"), or "rpc" when absent or not a short label. */
export function sourceOf(header: string | undefined): string {
  return header && /^[a-z0-9:-]{1,32}$/.test(header) ? header : "rpc";
}
