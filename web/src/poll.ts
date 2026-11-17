/** Longest wait between polls after failures in a row. */
export const MAX_DELAY = 60_000;

/** Wait before the next poll: the base interval, doubled for each failure in a row, capped. */
export const nextDelay = (base: number, failures: number) =>
  Math.min(MAX_DELAY, base * 2 ** Math.min(failures, 10));

/** The part of `document` used here (a fake in tests). */
type Doc = {
  hidden: boolean;
  addEventListener(type: "visibilitychange", f: () => void): void;
  removeEventListener(type: "visibilitychange", f: () => void): void;
};

/**
 * Runs `run` at once and then again after `base` ms, waiting longer after failures (`run` returns
 * false) so a rate-limited page backs off. Nothing runs while the page is hidden; it runs at once
 * when the page is shown again. Returns a function that stops it.
 */
export function poll(run: () => Promise<boolean>, base: number, doc: Doc = document): () => void {
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let running = false;

  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped && !doc.hidden) timer = setTimeout(tick, ms);
  };
  const tick = async () => {
    if (stopped || doc.hidden || running) return;
    running = true;
    const ok = await run().catch(() => false);
    running = false;
    failures = ok ? 0 : failures + 1;
    schedule(nextDelay(base, failures));
  };
  const onVisibility = () => {
    if (doc.hidden) clearTimeout(timer);
    else void tick();
  };

  doc.addEventListener("visibilitychange", onVisibility);
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
    doc.removeEventListener("visibilitychange", onVisibility);
  };
}
