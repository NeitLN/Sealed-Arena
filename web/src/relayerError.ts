import type { T } from "./i18n.js";

/** The error part of a relayer answer (/relay and /demo/claim). */
export type RelayerError = {
  error?: string | undefined;
  /** Seconds to wait, sent with the 429 answers. */
  retryAfter?: number | undefined;
  /** The demo claim's per-network window, in ms. */
  windowMs?: number | undefined;
};

/**
 * The message to show for a relayer error, with the real wait filled in: the clock time for a
 * demo claim (in the viewer's locale), seconds for an owner action. `now` and `locale` are for tests.
 */
export function relayerErrorText(
  t: T,
  r: RelayerError,
  fallback: string,
  o: { now?: number; locale?: string | undefined } = {},
): string {
  const wait = typeof r.retryAfter === "number" && r.retryAfter > 0 ? r.retryAfter : undefined;
  if (r.error === "demo_rate_limited") {
    const minutes =
      typeof r.windowMs === "number" && r.windowMs > 0 ? Math.ceil(r.windowMs / 60_000) : 10;
    const at = new Date((o.now ?? Date.now()) + (wait ?? minutes * 60) * 1000);
    const time = at.toLocaleTimeString(o.locale, { hour: "2-digit", minute: "2-digit" });
    return t("demo_rate_limited").replace("{min}", String(minutes)).replace("{time}", time);
  }
  if (r.error === "agent_rate_limited")
    return t("agent_rate_limited").replace("{s}", String(wait ?? 15));
  return t(r.error ?? fallback);
}
