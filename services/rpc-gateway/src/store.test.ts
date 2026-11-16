import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { type Attempt, sqliteStore } from "./store.js";

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
