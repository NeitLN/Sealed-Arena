// Replaces exactly one occurrence of <from> by <to> in <file>; "\n", "\t" and "\&" in the
// arguments stand for a newline, a tab and "&". Exits 1 if <from> does not occur exactly once.
// Usage: node chain/tests/mutation/apply.mjs <file> <from> <to>
import { readFileSync, writeFileSync } from "node:fs";

const decodeArg = (s) => s.replaceAll("\\n", "\n").replaceAll("\\t", "\t").replaceAll("\\&", "&");
const [file, from, to] = process.argv.slice(2);
const a = decodeArg(from);
const s = readFileSync(file, "utf8");
const count = s.split(a).length - 1;
if (count !== 1) {
  console.error(`pattern found ${count} times`);
  process.exit(1);
}
writeFileSync(file, s.replace(a, decodeArg(to)));
