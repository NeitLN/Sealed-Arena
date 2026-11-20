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
  /**
   * Where the attempt came from, as the client said (X-Sealed-Source, e.g. "web:arena"), or "rpc".
   * Not authenticated: a label for reading the log, not evidence.
   */
  source?: string;
};

/** Filters for recent(): only accepted or only rejected attempts, and only from a time on. */
export type RecentFilter = { result?: "accepted" | "rejected"; since?: number };

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
  recent(limit: number, from?: string, filter?: RecentFilter): Promise<PublicAttempt[]>;
  summary(from?: string): Promise<Summary>;
  /** Everything stored (tests). */
  dump(): Promise<Attempt[]>;
  close(): void;
}

const strip = ({ ipHash: _ip, ...rest }: Attempt): PublicAttempt => rest;
const same = (a: string, b?: string) => !b || a.toLowerCase() === b.toLowerCase();

export function summarize(rows: Attempt[]): Summary {
  const byReason: Record<string, number> = {};
  const senders = new Set<string>();
  let accepted = 0;
  let since: number | null = null;
  // A loop, not Math.min(...rows): spreading a large array overflows the call stack.
  for (const r of rows) {
    if (r.result === "accepted") accepted++;
    else byReason[r.reason] = (byReason[r.reason] ?? 0) + 1;
    senders.add(r.ipHash);
    if (since === null || r.ts < since) since = r.ts;
  }
  return {
    total: rows.length,
    accepted,
    rejected: rows.length - accepted,
    byReason,
    distinctSenders: senders.size,
    since,
  };
}

export class MemoryStore implements AttemptStore {
  private rows: Attempt[] = [];
  async add(a: Attempt) {
    this.rows.push(a);
  }
  async recent(limit: number, from?: string, f: RecentFilter = {}) {
    const out: PublicAttempt[] = [];
    for (let i = this.rows.length - 1; i >= 0 && out.length < limit; i--) {
      const r = this.rows[i] as Attempt;
      if (!same(r.from, from)) continue;
      if (f.result && r.result !== f.result) continue;
      if (f.since !== undefined && r.ts < f.since) continue;
      out.push(strip({ ...r, source: r.source ?? "rpc" }));
    }
    return out;
  }
  async summary(from?: string) {
    return summarize(from ? this.rows.filter((r) => same(r.from, from)) : this.rows);
  }
  async dump() {
    return [...this.rows];
  }
  close() {}
}

const toAttempt = (r: unknown): Attempt => {
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
    source: x.source === null || x.source === undefined ? "rpc" : String(x.source),
  };
};

/**
 * SQLite file store, with node:sqlite (built into Node 24, no extra dependency). Reads are SQL
 * aggregates and LIMIT queries, never every row: the challenge agent's key is public, so anyone
 * can add rows.
 */
export async function sqliteStore(path: string): Promise<AttemptStore> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE IF NOT EXISTS attempts (
    ts INTEGER NOT NULL, ip_hash TEXT NOT NULL, from_addr TEXT NOT NULL, to_addr TEXT NOT NULL,
    value TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, reason TEXT NOT NULL)`);
  // The sender in lower case, so a filter by sender can use an index. A database written before
  // this column existed gets it added and filled here.
  const cols = db.prepare("PRAGMA table_info(attempts)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "from_lc")) {
    db.exec("ALTER TABLE attempts ADD COLUMN from_lc TEXT");
  }
  db.exec("UPDATE attempts SET from_lc = lower(from_addr) WHERE from_lc IS NULL");
  if (!cols.some((c) => c.name === "source")) {
    db.exec("ALTER TABLE attempts ADD COLUMN source TEXT");
  }
  db.exec("DROP INDEX IF EXISTS attempts_from");
  db.exec("CREATE INDEX IF NOT EXISTS attempts_from_lc ON attempts (from_lc, ts)");
  db.exec("CREATE INDEX IF NOT EXISTS attempts_ts ON attempts (ts)");

  const insert = db.prepare(
    `INSERT INTO attempts (ts, ip_hash, from_addr, to_addr, value, hash, result, reason, from_lc, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const filter = (from?: string) => (from ? "from_lc = ?" : "1 = 1");
  const args = (from?: string) => (from ? [from.toLowerCase()] : []);
  return {
    async add(a) {
      insert.run(
        a.ts,
        a.ipHash,
        a.from,
        a.to,
        a.value,
        a.hash,
        a.result,
        a.reason,
        a.from.toLowerCase(),
        a.source ?? "rpc",
      );
    },
    async recent(limit, from, f = {}) {
      const where = [filter(from)];
      const extra: (string | number)[] = [];
      if (f.result) {
        where.push("result = ?");
        extra.push(f.result);
      }
      if (f.since !== undefined) {
        where.push("ts >= ?");
        extra.push(f.since);
      }
      return db
        .prepare(
          `SELECT * FROM attempts WHERE ${where.join(" AND ")} ORDER BY ts DESC, rowid DESC LIMIT ?`,
        )
        .all(...args(from), ...extra, limit)
        .map((r) => strip(toAttempt(r)));
    },
    async summary(from) {
      const t = db
        .prepare(
          `SELECT COUNT(*) AS total, COALESCE(SUM(result = 'accepted'), 0) AS accepted,
             COUNT(DISTINCT ip_hash) AS senders, MIN(ts) AS since
           FROM attempts WHERE ${filter(from)}`,
        )
        .get(...args(from)) as Record<string, number | null>;
      const reasons = db
        .prepare(
          `SELECT reason, COUNT(*) AS n FROM attempts
           WHERE ${filter(from)} AND result != 'accepted' GROUP BY reason`,
        )
        .all(...args(from)) as { reason: string; n: number }[];
      const byReason: Record<string, number> = {};
      for (const r of reasons) byReason[String(r.reason)] = Number(r.n);
      const total = Number(t.total);
      const accepted = Number(t.accepted);
      return {
        total,
        accepted,
        rejected: total - accepted,
        byReason,
        distinctSenders: Number(t.senders),
        since: t.since === null || t.since === undefined ? null : Number(t.since),
      };
    },
    async dump() {
      return db.prepare("SELECT * FROM attempts ORDER BY ts, rowid").all().map(toAttempt);
    },
    close() {
      db.close();
    },
  };
}
