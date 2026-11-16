/** One eth_sendRawTransaction seen by the gateway. No IP in clear: only a salted hash. */
export type Attempt = {
  ts: number;
  ipHash: string;
  from: string;
  to: string;
  value: string;
  hash: string;
  result: "accepted" | "rejected";
  /** The node's reason, normalized (e.g. "agent: payee not allowed"); empty when accepted. */
  reason: string;
};

export type PublicAttempt = Omit<Attempt, "ipHash">;

export type Summary = {
  total: number;
  accepted: number;
  rejected: number;
  byReason: Record<string, number>;
  distinctSenders: number;
  since: number | null;
};

export interface AttemptStore {
  add(a: Attempt): Promise<void>;
  /** Newest first, without the IP hash. */
  recent(limit: number, from?: string): Promise<PublicAttempt[]>;
  summary(from?: string): Promise<Summary>;
  /** Everything stored (tests). */
  dump(): Promise<Attempt[]>;
  close(): void;
}

const strip = ({ ipHash: _ip, ...rest }: Attempt): PublicAttempt => rest;
const same = (a: string, b?: string) => !b || a.toLowerCase() === b.toLowerCase();

export function summarize(rows: Attempt[]): Summary {
  const byReason: Record<string, number> = {};
  for (const r of rows)
    if (r.result === "rejected") byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
  return {
    total: rows.length,
    accepted: rows.filter((r) => r.result === "accepted").length,
    rejected: rows.filter((r) => r.result === "rejected").length,
    byReason,
    distinctSenders: new Set(rows.map((r) => r.ipHash)).size,
    since: rows.length ? Math.min(...rows.map((r) => r.ts)) : null,
  };
}

export class MemoryStore implements AttemptStore {
  private rows: Attempt[] = [];
  async add(a: Attempt) {
    this.rows.push(a);
  }
  async recent(limit: number, from?: string) {
    return this.rows
      .filter((r) => same(r.from, from))
      .slice(-limit)
      .reverse()
      .map(strip);
  }
  async summary(from?: string) {
    return summarize(this.rows.filter((r) => same(r.from, from)));
  }
  async dump() {
    return [...this.rows];
  }
  close() {}
}

/** SQLite file store, with node:sqlite (built into Node 24, no extra dependency). */
export async function sqliteStore(path: string): Promise<AttemptStore> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS attempts (
    ts INTEGER NOT NULL, ip_hash TEXT NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL,
    value TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL)`);
  db.exec("CREATE INDEX IF NOT EXISTS attempts_from ON attempts (from_addr)");
  const insert = db.prepare("INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  const rows = (from?: string): Attempt[] =>
    (from
      ? db.prepare("SELECT * FROM attempts WHERE lower(from_addr) = lower(?) ORDER BY ts").all(from)
      : db.prepare("SELECT * FROM attempts ORDER BY ts").all()
    ).map((r) => {
      const x = r as Record<string, string | number>;
      return {
        ts: Number(x.ts),
        ipHash: String(x.ip_hash),
        from: String(x.from_addr),
        to: String(x.to_addr),
        value: String(x.value),
        hash: String(x.hash),
        result: x.result === "accepted" ? "accepted" : "rejected",
        reason: String(x.reason),
      };
    });
  return {
    async add(a) {
      insert.run(a.ts, a.ipHash, a.from, a.to, a.value, a.hash, a.result, a.reason);
    },
    async recent(limit, from) {
      return rows(from).slice(-limit).reverse().map(strip);
    },
    async summary(from) {
      return summarize(rows(from));
    },
    async dump() {
      return rows();
    },
    close() {
      db.close();
    },
  };
}
