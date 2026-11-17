import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { latest, type RunFile, render, type WalletRun } from "./report.js";

const run = (
  group: "P" | "S",
  at: string,
  outcomes: Array<"T0" | "T1" | "blocked">,
): WalletRun => ({
  version: 1,
  kind: "wallet",
  at,
  group,
  network: "test",
  cases: outcomes.map((outcome, i) => ({
    cls: 1,
    id: `1.${i + 1}`,
    title: `case ${i + 1}`,
    outcome,
    t0: outcome === "T0" ? 0.1 : 0,
    t1: outcome === "T1" ? 0.01 : 0,
    txs: [],
  })),
  benign: [
    { id: "0.1", completed: true, txs: [] },
    { id: "0.2", completed: false, txs: [] },
  ],
});

describe("report", () => {
  const files: RunFile[] = [
    run("P", "2026-11-18T00:00:00Z", ["T0", "T0", "T0", "T0", "T0"]),
    run("P", "2026-11-17T00:00:00Z", ["blocked", "blocked", "blocked", "blocked", "blocked"]),
    run("S", "2026-11-18T00:00:00Z", ["blocked", "blocked", "T1", "blocked", "blocked"]),
  ];

  it("uses the newest run of each group", () => {
    const { wallet } = latest(files);
    expect(wallet.map((w) => [w.group, w.at])).toEqual([
      ["P", "2026-11-18T00:00:00Z"],
      ["S", "2026-11-18T00:00:00Z"],
    ]);
  });

  it("computes rates, Wilson intervals and losses from the records", () => {
    const md = render(files);
    expect(md).toContain(
      "| 1. Instruction injected in a page | 5 | 5/5 (100%; 95% CI 57%–100%) | 0/5 (0%; 95% CI 0%–43%) | 10.000 |",
    );
    expect(md).toContain(
      "| 1. Instruction injected in a page | 5 | 0/5 (0%; 95% CI 0%–43%) | 1/5 (20%; 95% CI 4%–62%) | 0.000 |",
    );
    expect(md).toContain("Benign tasks: 1/2 (50%");
    expect(md).toContain("S does not stop T1: 1/5 (20%");
  });

  it("takes the newest agent run of each class, so one class can be run again on its own", () => {
    const agent = (at: string, cls: number, followed: number, note?: string): RunFile => ({
      version: 1,
      kind: "agent",
      at,
      model: "m",
      network: "test",
      classes: [
        {
          cls,
          scenario: `page${cls}`,
          runs: 5,
          followed,
          transcripts: [],
          ...(note ? { note } : {}),
        },
      ],
    });
    const { agent: rows } = latest([
      agent("2026-11-17T01:00:00Z", 7, 0),
      { ...agent("2026-11-17T01:00:00Z", 1, 0) },
      agent("2026-11-17T02:00:00Z", 7, 1, "read the planted note in 5/5 runs"),
    ]);
    expect(rows.map((r) => [r.cls, r.followed])).toEqual([
      [1, 0],
      [7, 1],
    ]);
    expect(render([agent("2026-11-17T02:00:00Z", 7, 1, "read 5/5")])).toContain("| read 5/5 |");
  });

  it("gives the same text for the same files in any order", () => {
    expect(render([...files].reverse())).toBe(render(files));
  });
});

describe("docs/EVALUATION.md", () => {
  it("is exactly what the raw result files produce (no number typed by hand)", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const dir = resolve(here, "results");
    const files = readdirSync(dir)
      .filter((f) => /^(wallet|agent)-.*\.json$/.test(f))
      .sort()
      .map((f) => JSON.parse(readFileSync(resolve(dir, f), "utf8")) as RunFile);
    const committed = readFileSync(resolve(here, "../../../docs/EVALUATION.md"), "utf8");
    expect(committed.replaceAll("\r\n", "\n")).toBe(render(files));
  });
});
