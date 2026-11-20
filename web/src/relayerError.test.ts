import { describe, expect, it } from "vitest";
import { textFor } from "./i18n.js";
import { relayerErrorText } from "./relayerError.js";

// 2026-11-21 10:00:00 UTC
const NOW = Date.UTC(2026, 10, 21, 10, 0, 0);
const hhmm = (ms: number, locale: string) =>
  new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

describe("relayer error messages", () => {
  it("gives the demo wait as a clock time and the real window, in English", () => {
    const text = relayerErrorText(
      textFor("en"),
      { error: "demo_rate_limited", retryAfter: 540, windowMs: 600_000 },
      "demoFailed",
      { now: NOW, locale: "en-US" },
    );
    expect(text).toBe(
      `One demo agent per network every 10 minutes. Try again at ${hhmm(NOW + 540_000, "en-US")}, or use the Try buttons on /arena.`,
    );
  });

  it("uses the window the relayer sends, in Vietnamese", () => {
    const text = relayerErrorText(
      textFor("vi"),
      { error: "demo_rate_limited", retryAfter: 120, windowMs: 180_000 },
      "demoFailed",
      { now: NOW, locale: "vi-VN" },
    );
    expect(text).toBe(
      `Mỗi mạng một demo agent mỗi 3 phút. Thử lại lúc ${hhmm(NOW + 120_000, "vi-VN")}, hoặc dùng nút Try trên /arena.`,
    );
  });

  it("falls back to 10 minutes when the relayer sends no window", () => {
    const text = relayerErrorText(textFor("en"), { error: "demo_rate_limited" }, "demoFailed", {
      now: NOW,
      locale: "en-US",
    });
    expect(text).toContain("every 10 minutes");
    expect(text).toContain(hhmm(NOW + 600_000, "en-US"));
  });

  it("gives the owner-action wait in seconds", () => {
    expect(
      relayerErrorText(textFor("en"), { error: "agent_rate_limited", retryAfter: 14 }, "x"),
    ).toBe("Too many owner actions for this agent. Try again in 14 s.");
    expect(
      relayerErrorText(textFor("vi"), { error: "agent_rate_limited", retryAfter: 14 }, "x"),
    ).toBe("Quá nhiều thao tác cho agent này. Thử lại sau 14 giây.");
  });

  it("looks up any other error, or the fallback when there is none", () => {
    const t = textFor("en");
    expect(relayerErrorText(t, { error: "demo_cap" }, "demoFailed")).toBe(t("demo_cap"));
    expect(relayerErrorText(t, {}, "demoFailed")).toBe(t("demoFailed"));
  });
});
