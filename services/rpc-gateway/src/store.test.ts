import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type Attempt, MemoryStore, sqliteStore } from "./store.js";

const dir = mkdtempSync(join(tmpdir(), "gateway-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const a = (o: Partial<Attempt>): Attempt => ({
  ts: 1,
  ipHash: "h1",
  from: "0xAbc0000000000000000000000000000000000001",
  to: "0x0000000000000000000000000000000000000002",
  value: "5",
  hash: "",
  result: "rejected",
  reason: "agent: frozen",
  ...o,
});

describe("sqliteStore", () => {
  it("keeps attempts across reopening and summarises them", async () => {
    const path = join(dir, "attempts.db");
    const s1 = await sqliteStore(path);
    await s1.add(a({ ts: 1 }));
    await s1.add(a({ ts: 2, ipHash: "h2", result: "accepted", reason: "", hash: "0x01" }));
    s1.close();
    const s2 = await sqliteStore(path);
    expect(await s2.summary()).toMatchObject({
      total: 2,
      accepted: 1,
      rejected: 1,
      distinctSenders: 2,
      since: 1,
    });
    const recent = await s2.recent(10);
    expect(recent.map((r) => r.ts)).toEqual([2, 1]);
    expect(recent[0]).not.toHaveProperty("ipHash");
    s2.close();
  });

  it("filters by sender, case-insensitive", async () => {
    const s = await sqliteStore(join(dir, "filter.db"));
    await s.add(a({ from: "0xAbc0000000000000000000000000000000000001" }));
    await s.add(a({ from: "0xdef0000000000000000000000000000000000009" }));
    expect((await s.summary("0xabc0000000000000000000000000000000000001")).total).toBe(1);
    s.close();
  });
});

describe("store at scale", () => {
  const N = 300_000;
  const sender = "0xAbc0000000000000000000000000000000000001";

  it("summarises and lists many rows without loading them all (sqlite)", async () => {
    const path = join(dir, "large.db");
    const s1 = await sqliteStore(path);
    s1.close();
    // Bulk rows written straight into the file, in one transaction, without the lower-case
    // column filled: like rows written by an older gateway.
    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(path);
    raw.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${N})
      INSERT INTO attempts (ts, ip_hash, from_addr, to_addr, value, hash, result, reason)
      SELECT i, 'h' || (i % 7), CASE WHEN i % 2 = 0 THEN '${sender}' ELSE '0xdef0000000000000000000000000000000000009' END,
        '0x0000000000000000000000000000000000000002', '5', '',
        CASE WHEN i % 10 = 0 THEN 'accepted' ELSE 'rejected' END,
        CASE WHEN i % 10 = 0 THEN '' WHEN i % 3 = 0 THEN 'agent: frozen' ELSE 'agent: payee not allowed' END
      FROM n`);
    raw.close();

    const s = await sqliteStore(path);
    const all = await s.summary();
    expect(all).toMatchObject({ total: N, accepted: N / 10, rejected: N - N / 10, since: 1 });
    expect(all.distinctSenders).toBe(7);
    expect(Object.keys(all.byReason).sort()).toEqual(["agent: frozen", "agent: payee not allowed"]);
    expect(Object.values(all.byReason).reduce((x, y) => x + y, 0)).toBe(N - N / 10);
    const mine = await s.summary(sender.toLowerCase());
    expect(mine).toMatchObject({ total: N / 2, since: 2 });
    const recent = await s.recent(3, sender.toUpperCase().replace("0X", "0x"));
    expect(recent.map((r) => r.ts)).toEqual([N, N - 2, N - 4]);
    expect((await s.recent(2)).map((r) => r.ts)).toEqual([N, N - 1]);
    s.close();
  }, 60_000);

  it("summarises many rows (memory)", async () => {
    const s = new MemoryStore();
    for (let i = 1; i <= N; i++) await s.add(a({ ts: i, from: i % 2 ? "0xother" : sender }));
    expect(await s.summary()).toMatchObject({ total: N, since: 1 });
    expect((await s.summary(sender.toLowerCase())).total).toBe(N / 2);
    expect((await s.recent(2, sender)).map((r) => r.ts)).toEqual([N, N - 2]);
  }, 60_000);
});

describe("sqliteStore on a database from an older gateway", () => {
  it("adds the lower-case sender column, backfills it, and keeps accepting rows", async () => {
    const path = join(dir, "legacy.db");
    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(path);
    raw.exec(`CREATE TABLE attempts (
      ts INTEGER NOT NULL, ip_hash TEXT NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL,
      value TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL)`);
    raw.exec("CREATE INDEX attempts_from ON attempts (from_addr)");
    raw
      .prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(1, "h1", "0xAbC0000000000000000000000000000000000001", "0x02", "5", "", "rejected", "x");
    raw.close();

    const s = await sqliteStore(path);
    await s.add(a({ ts: 2, from: "0xABC0000000000000000000000000000000000001" }));
    expect((await s.summary("0xabc0000000000000000000000000000000000001")).total).toBe(2);
    const recent = await s.recent(10, "0xabc0000000000000000000000000000000000001");
    expect(recent.map((r) => r.ts)).toEqual([2, 1]);
    expect(recent[1]?.from).toBe("0xAbC0000000000000000000000000000000000001");
    s.close();
  });
});

describe("source label and recent() filters", () => {
  it("stores the source, defaults to rpc, and filters by result and time (both stores)", async () => {
    for (const s of [new MemoryStore(), await sqliteStore(join(dir, "source.db"))]) {
      await s.add(a({ ts: 10, result: "accepted", reason: "", source: "web:arena" }));
      await s.add(a({ ts: 20 }));
      await s.add(a({ ts: 30, source: "web:console" }));
      const all = await s.recent(10);
      expect(all.map((r) => r.source)).toEqual(["web:console", "rpc", "web:arena"]);
      expect((await s.recent(10, undefined, { result: "rejected" })).map((r) => r.ts)).toEqual([
        30, 20,
      ]);
      expect(
        (await s.recent(10, undefined, { result: "rejected", since: 25 })).map((r) => r.ts),
      ).toEqual([30]);
      // `since` is inclusive: an attempt at exactly that time is listed.
      expect(
        (await s.recent(10, undefined, { result: "rejected", since: 20 })).map((r) => r.ts),
      ).toEqual([30, 20]);
      expect((await s.recent(10, undefined, { result: "accepted" })).map((r) => r.ts)).toEqual([
        10,
      ]);
      s.close();
    }
  });

  it("an older database gets the column; its rows read as rpc", async () => {
    const path = join(dir, "legacy-source.db");
    const { DatabaseSync } = await import("node:sqlite");
    const raw = new DatabaseSync(path);
    raw.exec(`CREATE TABLE attempts (
      ts INTEGER NOT NULL, ip_hash TEXT NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL,
      value TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL)`);
    raw
      .prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(1, "h", "0xA", "0xB", "1", "", "rejected", "x");
    raw.close();
    const s = await sqliteStore(path);
    await s.add(a({ ts: 2, source: "web:arena" }));
    expect((await s.recent(10)).map((r) => r.source)).toEqual(["web:arena", "rpc"]);
    s.close();
  });
});
