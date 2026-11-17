import { describe, expect, it } from "vitest";
import { wilson } from "./stats.js";

const round = (x: number) => Math.round(x * 1000) / 1000;

describe("wilson", () => {
  // 95% Wilson score interval, z = 1.959964; reference values computed by hand from the formula.
  it.each([
    [0, 5, 0, 434 / 1000], // written as a fraction: lint reads 0.434 as Math.LOG10E
    [5, 5, 0.566, 1],
    [2, 10, 0.057, 0.51],
    [1, 25, 0.007, 0.195],
    [0, 25, 0, 0.133],
  ])("k=%i n=%i -> [%f, %f]", (k, n, lo, hi) => {
    const w = wilson(k, n);
    expect(round(w.low)).toBe(lo);
    expect(round(w.high)).toBe(hi);
    expect(w.rate).toBe(k / n);
  });

  it("refuses an empty sample and k outside 0..n", () => {
    expect(() => wilson(0, 0)).toThrow();
    expect(() => wilson(6, 5)).toThrow();
    expect(() => wilson(-1, 5)).toThrow();
  });
});
