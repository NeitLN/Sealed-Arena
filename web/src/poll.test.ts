import { describe, expect, it, vi } from "vitest";
import { nextDelay, poll } from "./poll.js";

describe("nextDelay", () => {
  it("waits the base interval while polls succeed", () => {
    expect(nextDelay(15_000, 0)).toBe(15_000);
  });
  it("doubles after each failure in a row, up to the cap", () => {
    expect(nextDelay(15_000, 1)).toBe(30_000);
    expect(nextDelay(15_000, 2)).toBe(60_000);
    expect(nextDelay(15_000, 5)).toBe(60_000);
    expect(nextDelay(5_000, 3)).toBe(40_000);
  });
});

describe("poll", () => {
  const fakeDoc = () => {
    const listeners: Array<() => void> = [];
    return {
      hidden: false,
      addEventListener: (_: string, f: () => void) => {
        listeners.push(f);
      },
      removeEventListener: () => {},
      fire: () => {
        for (const f of listeners) f();
      },
    };
  };

  it("runs at once, then again after the delay; slows down after failures", async () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    let n = 0;
    const run = vi.fn(async () => {
      n++;
      return n !== 2; // second run fails
    });
    const stop = poll(run, 1_000, doc);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2); // failed
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(2); // backing off: next one after 2 s
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(3);
    stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(run).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it("does not poll while the page is hidden, and polls at once when it is shown again", async () => {
    vi.useFakeTimers();
    const doc = fakeDoc();
    const run = vi.fn(async () => true);
    const stop = poll(run, 1_000, doc);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    doc.hidden = true;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenCalledTimes(1);
    doc.hidden = false;
    doc.fire();
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    vi.useRealTimers();
  });
});
