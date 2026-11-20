import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { createGatewayApp, normalizeReason, sourceOf } from "./app.js";
import { MemoryStore } from "./store.js";

const agent = privateKeyToAccount(generatePrivateKey());
const payee = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";

/** A node stand-in: answers by method; sendRawTransaction fails with `refuse` when set. */
function node(o: { refuse?: string } = {}) {
  const calls: string[] = [];
  const upstream = async (req: { method: string; id: unknown }) => {
    calls.push(req.method);
    if (req.method === "eth_sendRawTransaction" && o.refuse) {
      return { jsonrpc: "2.0", id: req.id, error: { code: -32000, message: o.refuse } };
    }
    const result = req.method === "eth_sendRawTransaction" ? `0x${"ab".repeat(32)}` : "0x3fc06";
    return { jsonrpc: "2.0", id: req.id, result };
  };
  return { calls, upstream };
}

const rpc = (app: ReturnType<typeof createGatewayApp>, body: unknown, ip = "203.0.113.7") =>
  app.request("/", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const signed = () =>
  agent.signTransaction({
    type: "eip1559",
    chainId: 261126,
    nonce: 0,
    gas: 21_000n,
    maxFeePerGas: 25_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    to: payee,
    value: 10n ** 15n,
  });

const setup = (o: { refuse?: string; perMinute?: number; sendPerMinute?: number } = {}) => {
  const n = node(o);
  const store = new MemoryStore();
  const app = createGatewayApp({
    upstream: n.upstream,
    store,
    ipSalt: "test-salt",
    trustProxy: true,
    ...(o.perMinute ? { perMinute: o.perMinute } : {}),
    ...(o.sendPerMinute ? { sendPerMinute: o.sendPerMinute } : {}),
  });
  return { app, store, n };
};

describe("rpc gateway", () => {
  it("forwards allowed read methods", async () => {
    const { app, n } = setup();
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });
    expect(await res.json()).toEqual({ jsonrpc: "2.0", id: 1, result: "0x3fc06" });
    expect(n.calls).toEqual(["eth_chainId"]);
  });

  it.each([
    "debug_traceTransaction",
    "admin_peers",
    "personal_unlockAccount",
    "eth_sign",
    "txpool_content",
  ])("refuses %s without reaching the node", async (method) => {
    const { app, n } = setup();
    const body = (await (await rpc(app, { jsonrpc: "2.0", id: 7, method, params: [] })).json()) as {
      error?: { code: number };
    };
    expect(body.error?.code).toBe(-32601);
    expect(n.calls).toEqual([]);
  });

  it("lets browsers cache the preflight for the source header", async () => {
    const { app } = setup();
    const res = await app.request("/", {
      method: "OPTIONS",
      headers: {
        origin: "https://example.test",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-sealed-source",
      },
    });
    expect(res.headers.get("access-control-max-age")).toBe("600");
  });

  it("limits eth_getLogs to 2048 blocks", async () => {
    const { app, n } = setup();
    const wide = await rpc(app, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getLogs",
      params: [{ fromBlock: "0x0", toBlock: "0x1000" }],
    });
    expect(((await wide.json()) as { error?: unknown }).error).toBeDefined();
    await rpc(app, {
      jsonrpc: "2.0",
      id: 2,
      method: "eth_getLogs",
      params: [{ fromBlock: "0x10", toBlock: "0x20" }],
    });
    expect(n.calls).toEqual(["eth_getLogs"]);
  });

  it("records a refused payment with the sender, payee and the rule's reason", async () => {
    const { app, store } = setup({
      refuse: "agent: payee not allowed: 0x976ea74026e726554db657fa54763abd0c3a0aa9",
    });
    const raw = await signed();
    const body = (await (
      await rpc(app, { jsonrpc: "2.0", id: 3, method: "eth_sendRawTransaction", params: [raw] })
    ).json()) as { error?: { message: string } };
    expect(body.error?.message).toContain("agent: payee not allowed");
    const [a] = await store.recent(10);
    expect(a).toMatchObject({
      from: agent.address,
      to: payee,
      value: (10n ** 15n).toString(),
      result: "rejected",
      reason: "agent: payee not allowed",
    });
  });

  it("records an accepted payment with its hash", async () => {
    const { app, store } = setup();
    await rpc(app, {
      jsonrpc: "2.0",
      id: 4,
      method: "eth_sendRawTransaction",
      params: [await signed()],
    });
    const [a] = await store.recent(10);
    expect(a).toMatchObject({ result: "accepted", hash: `0x${"ab".repeat(32)}`, reason: "" });
  });

  it("never stores the client IP in clear", async () => {
    const { app, store } = setup({ refuse: "agent: frozen" });
    await rpc(
      app,
      { jsonrpc: "2.0", id: 5, method: "eth_sendRawTransaction", params: [await signed()] },
      "198.51.100.42",
    );
    expect(JSON.stringify(await store.dump())).not.toContain("198.51.100.42");
  });

  it("summarises attempts: totals, reasons, distinct senders by hashed IP", async () => {
    const { app } = setup({ refuse: "agent: budget exceeded: charge 5 above perTxCap 1" });
    const raw = await signed();
    for (const ip of ["1.1.1.1", "1.1.1.1", "2.2.2.2"]) {
      await rpc(
        app,
        { jsonrpc: "2.0", id: 1, method: "eth_sendRawTransaction", params: [raw] },
        ip,
      );
    }
    const s = (await (await app.request("/attempts/summary")).json()) as Record<string, unknown>;
    expect(s).toMatchObject({ total: 3, rejected: 3, accepted: 0, distinctSenders: 2 });
    expect(s.byReason).toEqual({ "agent: budget exceeded": 3 });
  });

  it("returns 429 past the rate limit", async () => {
    const { app } = setup({ perMinute: 3 });
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push(
        (await rpc(app, { jsonrpc: "2.0", id: i, method: "eth_chainId", params: [] })).status,
      );
    }
    expect(codes).toEqual([200, 200, 200, 429]);
  });

  it("by default allows a few open pages from one address (600 calls a minute), then 429", async () => {
    const { app } = setup();
    const call = (id: number) => ({ jsonrpc: "2.0", id, method: "eth_chainId", params: [] });
    // 60 batches of 10 calls: what several polling pages behind one shared IP send in a minute.
    for (let i = 0; i < 60; i++) {
      const batch = Array.from({ length: 10 }, (_, k) => call(i * 10 + k));
      expect((await rpc(app, batch)).status).toBe(200);
    }
    expect((await rpc(app, call(999))).status).toBe(429);
    // Another client is not affected.
    expect((await rpc(app, call(1000), "198.51.100.9")).status).toBe(200);
  });

  it("counts every call in a batch toward the rate limit", async () => {
    const { app } = setup({ perMinute: 5 });
    const call = (id: number) => ({ jsonrpc: "2.0", id, method: "eth_chainId", params: [] });
    expect((await rpc(app, [call(1), call(2), call(3), call(4)])).status).toBe(200);
    // 4 used: a batch of 2 would make 6 > 5, a single call still fits.
    expect((await rpc(app, [call(5), call(6)])).status).toBe(429);
    expect((await rpc(app, call(7))).status).toBe(200);
    expect((await rpc(app, call(8))).status).toBe(429);
  });

  it("handles a small batch and refuses a large one", async () => {
    const { app } = setup();
    const ok = (await (
      await rpc(app, [
        { jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] },
        { jsonrpc: "2.0", id: 2, method: "admin_peers", params: [] },
      ])
    ).json()) as Array<{ result?: string; error?: unknown }>;
    expect(ok[0]?.result).toBe("0x3fc06");
    expect(ok[1]?.error).toBeDefined();
    const big = Array.from({ length: 21 }, (_, i) => ({
      jsonrpc: "2.0",
      id: i,
      method: "eth_chainId",
      params: [],
    }));
    expect((await rpc(app, big)).status).toBe(400);
  });

  it("answers a batch entry that is not an object with -32600, not a server error", async () => {
    const { app, n } = setup();
    const res = await rpc(app, [null, 5, { jsonrpc: "2.0", id: 3, method: "eth_chainId" }]);
    expect(res.status).toBe(200);
    const out = (await res.json()) as Array<{
      id: unknown;
      result?: string;
      error?: { code: number };
    }>;
    expect(out[0]).toMatchObject({ id: null, error: { code: -32600 } });
    expect(out[1]).toMatchObject({ id: null, error: { code: -32600 } });
    expect(out[2]?.result).toBe("0x3fc06");
    expect(n.calls).toEqual(["eth_chainId"]);
  });

  it.each([[{ fromBlock: "0x", toBlock: "0x10" }], [{ fromBlock: "0x1", toBlock: "0x" }]])(
    "refuses eth_getLogs with an empty hex block number (%j) with -32602",
    async (filter) => {
      const { app, n } = setup();
      const res = await rpc(app, {
        jsonrpc: "2.0",
        id: 9,
        method: "eth_getLogs",
        params: [filter],
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ id: 9, error: { code: -32602 } });
      expect(n.calls).toEqual([]);
    },
  );
});

describe("normalizeReason", () => {
  it.each([
    ["agent: payee not allowed: 0xabc", "agent: payee not allowed"],
    ["agent: budget exceeded: charge 5 above perTxCap 1", "agent: budget exceeded"],
    ["agent: frozen", "agent: frozen"],
    // rule v3
    [
      "agent: daily payment count exceeded: 3 today (pooled included), limit 3",
      "agent: daily payment count exceeded",
    ],
    [
      "agent: payee budget exceeded: paid today 600 + pooled 0 + value 500 above payee cap 1000",
      "agent: payee budget exceeded",
    ],
    ["nonce too low: next nonce 3, tx nonce 2", "nonce too low"],
    ["", ""],
  ])("%j → %j", (raw, want) => {
    expect(normalizeReason(raw)).toBe(want);
  });
});

describe("attempt summary cache", () => {
  /** A store that counts summary reads. */
  function counting() {
    const store = new MemoryStore();
    let reads = 0;
    const summary = store.summary.bind(store);
    store.summary = async (from?: string) => {
      reads++;
      return summary(from);
    };
    return { store, reads: () => reads };
  }

  it("serves repeated summary requests from a short cache, per sender filter", async () => {
    const { store, reads } = counting();
    let t = 1_000_000;
    const app = createGatewayApp({
      upstream: node().upstream,
      store,
      ipSalt: "s".repeat(16),
      summaryTtlMs: 2000,
      now: () => t,
    });
    const get = (q = "") => app.request(`/attempts/summary${q}`);
    expect((await get()).status).toBe(200);
    await get();
    await get();
    expect(reads()).toBe(1);
    // Another filter is another entry.
    await get(`?from=${payee}`);
    expect(reads()).toBe(2);
    // After the TTL the store is read again.
    t += 2000;
    await get();
    expect(reads()).toBe(3);
  });
});

describe("attempt summary cache size", () => {
  it("stays bounded when callers use many distinct sender filters", async () => {
    const cache = new Map<string, { at: number; value: Promise<unknown> }>();
    const app = createGatewayApp({
      upstream: node().upstream,
      store: new MemoryStore(),
      ipSalt: "s".repeat(16),
      summaryCacheMax: 50,
      summaryCache: cache,
    });
    for (let i = 0; i < 500; i++) {
      const from = `0x${i.toString(16).padStart(40, "0")}`;
      expect((await app.request(`/attempts/summary?from=${from}`)).status).toBe(200);
    }
    expect(cache.size).toBeLessThanOrEqual(50);
  });
});

describe("GET /state", () => {
  const make = (state: () => Promise<unknown>, now: () => number) =>
    createGatewayApp({
      upstream: async () => ({}),
      store: { add: async () => {}, summary: async () => ({}), recent: async () => [] } as never,
      ipSalt: "0123456789abcdef",
      state,
      stateTtlMs: 3000,
      now,
    });

  it("is off when no snapshot is configured", async () => {
    const app = createGatewayApp({
      upstream: async () => ({}),
      store: { add: async () => {}, summary: async () => ({}), recent: async () => [] } as never,
      ipSalt: "0123456789abcdef",
    });
    expect((await app.request("/state")).status).toBe(404);
  });

  it("reads the chain once per TTL however many pages ask", async () => {
    let t = 0;
    let reads = 0;
    const app = make(
      async () => ({ n: ++reads }),
      () => t,
    );
    const bodies = await Promise.all(
      Array.from({ length: 50 }, () =>
        Promise.resolve(app.request("/state")).then((r) => r.json() as Promise<unknown>),
      ),
    );
    expect(reads).toBe(1);
    expect(bodies.every((b) => (b as { n: number }).n === 1)).toBe(true);
    t = 2999;
    await app.request("/state");
    expect(reads).toBe(1);
    t = 3000;
    expect(await (await app.request("/state")).json()).toEqual({ n: 2 });
  });

  it("serves the last good snapshot marked stale when the node fails, and does not cache the failure", async () => {
    let t = 0;
    let fail = false;
    let reads = 0;
    const app = make(
      async () => {
        reads++;
        if (fail) throw new Error("down");
        return { n: reads };
      },
      () => t,
    );
    await app.request("/state");
    fail = true;
    t = 5000;
    expect(await (await app.request("/state")).json()).toEqual({ n: 1, stale: true });
    fail = false;
    expect(await (await app.request("/state")).json()).toEqual({ n: 3 });
  });

  it("answers 503 when the node fails before any good snapshot", async () => {
    const app = make(
      async () => {
        throw new Error("down");
      },
      () => 0,
    );
    expect((await app.request("/state")).status).toBe(503);
  });
});

describe("source label", () => {
  it("accepts short lower-case labels and falls back to rpc", () => {
    expect(sourceOf("web:arena")).toBe("web:arena");
    expect(sourceOf(undefined)).toBe("rpc");
    expect(sourceOf("Web Arena")).toBe("rpc");
    expect(sourceOf("x".repeat(33))).toBe("rpc");
  });
});
