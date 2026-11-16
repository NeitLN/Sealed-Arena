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
  /** Requests per minute per client. */
  perMinute?: number;
  /** eth_sendRawTransaction per minute per client. */
  sendPerMinute?: number;
  origins?: string[];
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

function logRangeOk(params: unknown): boolean {
  const f = (Array.isArray(params) ? params[0] : undefined) as Record<string, unknown> | undefined;
  if (!f) return false;
  if (typeof f.blockHash === "string") return true;
  if (!isHex(f.fromBlock) || !isHex(f.toBlock)) return false;
  const span = BigInt(f.toBlock) - BigInt(f.fromBlock);
  return span >= 0n && span <= MAX_LOG_BLOCKS;
}

export function createGatewayApp(o: GatewayOptions) {
  const perMinute = o.perMinute ?? 120;
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
  const allow = (m: Map<string, number[]>, key: string, limit: number) => {
    const now = Date.now();
    const recent = (m.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= limit) return false;
    recent.push(now);
    m.set(key, recent);
    return true;
  };

  async function handle(req: RpcRequest, ipHash: string): Promise<RpcResponse> {
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
      });
    }
    return res;
  }

  app.post("/", async (c) => {
    const ipHash = ipHashOf(c);
    if (!allow(hits, ipHash, perMinute)) return c.json(rpcError(null, -32005, "rate limited"), 429);
    const body = (await c.req.json().catch(() => undefined)) as
      | RpcRequest
      | RpcRequest[]
      | undefined;
    if (!body) return c.json(rpcError(null, -32700, "parse error"), 400);
    if (Array.isArray(body)) {
      if (body.length === 0 || body.length > MAX_BATCH)
        return c.json(rpcError(null, -32600, `batch of 1 to ${MAX_BATCH}`), 400);
      return c.json(await Promise.all(body.map((r) => handle(r, ipHash))));
    }
    return c.json(await handle(body, ipHash));
  });

  const fromParam = (q: string | undefined) => (q && /^0x[0-9a-fA-F]{40}$/.test(q) ? q : undefined);
  app.get("/attempts/summary", async (c) =>
    c.json(await o.store.summary(fromParam(c.req.query("from")))),
  );
  app.get("/attempts/recent", async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50) || 50, 1), 200);
    return c.json(await o.store.recent(limit, fromParam(c.req.query("from"))));
  });

  return app;
}

export type { Hex };
