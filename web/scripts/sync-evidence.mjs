import { readFileSync, writeFileSync } from "node:fs";

const source = "services/attacks/suite/results/leaked-key-fuji.json";
const run = JSON.parse(readFileSync(new URL(`../../${source}`, import.meta.url), "utf8"));
// Positive controls establish that permitted payments work; they are not attack cases.
const cases = run.results.filter((row) => !row.name.startsWith("control:"));
const summary = {
  at: run.at,
  source,
  cases: cases.length,
  passed: cases.filter((row) => row.result === row.expected).length,
  controlPassed: run.results
    .filter((row) => row.name.startsWith("control:"))
    .every((row) => row.result === row.expected),
};
writeFileSync(
  new URL("../src/leakedKeySummary.json", import.meta.url),
  `${JSON.stringify(summary, null, 2)}\n`,
);
