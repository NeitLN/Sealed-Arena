// Pure checks shared by verify-agree.ts and canary.ts (tested in checks.test.ts).

export type Header = { number: string; hash: string; stateRoot: string; timestamp: string };

/** Heights from..to with the given step; `to` is always included when the range is not empty. */
export function heightsToCheck(from: number, to: number, step = 1): number[] {
  const out: number[] = [];
  if (to < from) return out;
  const s = Math.max(1, Math.floor(step));
  for (let h = from; h <= to; h += s) out.push(h);
  if (out.at(-1) !== to) out.push(to);
  return out;
}

/** Heights where the two nodes disagree on the block hash or the state root, or one has no block. */
export function compareHeaders(
  heights: readonly number[],
  mine: ReadonlyMap<number, Header | null>,
  theirs: ReadonlyMap<number, Header | null>,
): { checked: number; differ: string[] } {
  let checked = 0;
  const differ: string[] = [];
  for (const h of heights) {
    const a = mine.get(h);
    const b = theirs.get(h);
    if (!a || !b) {
      differ.push(`${h}: no block on ${a ? "public" : "verifier"}`);
      continue;
    }
    checked++;
    if (a.hash.toLowerCase() !== b.hash.toLowerCase()) {
      differ.push(`${h}: hash ${a.hash} vs ${b.hash}`);
    } else if (a.stateRoot.toLowerCase() !== b.stateRoot.toLowerCase()) {
      differ.push(`${h}: state root ${a.stateRoot} vs ${b.stateRoot}`);
    }
  }
  return { checked, differ };
}

/** Every message in an error and its causes (viem nests the node's answer). */
export function errorText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; cur && i < 8; i++) {
    if (typeof cur === "string") {
      parts.push(cur);
      break;
    }
    const o = cur as {
      message?: unknown;
      details?: unknown;
      shortMessage?: unknown;
      cause?: unknown;
    };
    for (const v of [o.shortMessage, o.details, o.message])
      if (typeof v === "string") parts.push(v);
    cur = o.cause;
  }
  return parts.join(" | ");
}

/** The challenge invariant for one agent: balance >= funded - totalCharged (0 if charges exceed funding). */
export function invariantHolds(balance: bigint, funded: bigint, totalCharged: bigint): boolean {
  const required = funded > totalCharged ? funded - totalCharged : 0n;
  return balance >= required;
}
