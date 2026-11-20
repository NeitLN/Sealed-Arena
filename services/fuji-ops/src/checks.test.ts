import { describe, expect, it } from "vitest";
import {
  compareHeaders,
  errorText,
  type Header,
  heightsToCheck,
  invariantHolds,
} from "./checks.js";

const h = (n: number, hash = `0x${n}a`, stateRoot = `0x${n}b`): Header => ({
  number: `0x${n.toString(16)}`,
  hash,
  stateRoot,
  timestamp: "0x1",
});

describe("heightsToCheck", () => {
  it("covers the range and always ends at `to`", () => {
    expect(heightsToCheck(0, 4)).toEqual([0, 1, 2, 3, 4]);
    expect(heightsToCheck(0, 10, 4)).toEqual([0, 4, 8, 10]);
    expect(heightsToCheck(5, 5)).toEqual([5]);
    expect(heightsToCheck(6, 5)).toEqual([]);
  });
});

describe("compareHeaders", () => {
  it("passes when hash and state root agree (case-insensitive)", () => {
    const mine = new Map([[1, h(1, "0xAB", "0xCD")]]);
    const theirs = new Map([[1, h(1, "0xab", "0xcd")]]);
    expect(compareHeaders([1], mine, theirs)).toEqual({ checked: 1, differ: [] });
  });

  it("reports a different hash, a different state root and a missing block", () => {
    const mine = new Map<number, Header | null>([
      [1, h(1, "0x1")],
      [2, h(2, "0x2", "0xr1")],
      [3, null],
    ]);
    const theirs = new Map<number, Header | null>([
      [1, h(1, "0x9")],
      [2, h(2, "0x2", "0xr2")],
      [3, h(3)],
    ]);
    const r = compareHeaders([1, 2, 3], mine, theirs);
    expect(r.checked).toBe(2);
    expect(r.differ).toEqual([
      "1: hash 0x1 vs 0x9",
      "2: state root 0xr1 vs 0xr2",
      "3: no block on verifier",
    ]);
  });
});

describe("errorText", () => {
  it("collects nested messages so the node's reason can be matched", () => {
    const inner = { message: "agent: payee not allowed" };
    const outer = { shortMessage: "Transaction failed", details: "rpc error", cause: inner };
    expect(errorText(outer)).toContain("agent: payee not allowed");
    expect(errorText("plain")).toBe("plain");
  });
});

describe("invariantHolds", () => {
  it("balance must cover funded minus charged", () => {
    expect(invariantHolds(10n, 10n, 0n)).toBe(true);
    expect(invariantHolds(9n, 10n, 0n)).toBe(false);
    expect(invariantHolds(7n, 10n, 3n)).toBe(true);
    expect(invariantHolds(0n, 10n, 12n)).toBe(true);
  });
});
