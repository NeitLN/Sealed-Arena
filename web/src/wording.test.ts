import { describe, expect, it } from "vitest";
import { arenaText } from "./arenaText.js";
import { businessText } from "./businessText.js";
import result from "./compare-result.json";
import { compareText, type Result } from "./compareText.js";
import { KEYS, useI18n } from "./i18n.js";
import { landingText } from "./landingText.js";

/** The project's "never say" list, in both languages (claims we must not make). */
const FORBIDDEN = [
  /unbreakable|cannot be broken|can't be broken/i,
  /absolutely (safe|secure)|100% (safe|secure)/i,
  /decentrali[sz]/i,
  /(block|stop)s? prompt injection/i,
  /\bimmune\b/i,
  /only avalanche/i,
  /\b(steal|rob|loot)\b/i,
  /\bprize\b|cash reward/i,
  /không thể phá/i,
  /an toàn tuyệt đối/i,
  /phi tập trung/i,
  /chặn prompt injection/i,
  /miễn nhiễm/i,
  /chỉ avalanche/i,
  /cướp|trộm/i,
  /giải thưởng/i,
];

const allText = (v: unknown): string[] =>
  typeof v === "string"
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(allText)
      : v && typeof v === "object"
        ? Object.values(v).flatMap(allText)
        : [];

describe("page wording", () => {
  it.each(["en", "vi"] as const)("challenge pages (%s) contain no forbidden claim", (lang) => {
    for (const s of allText(arenaText(lang)))
      for (const re of FORBIDDEN) expect(s, `${re} in: ${s}`).not.toMatch(re);
  });

  it.each(["en", "vi"] as const)("comparison page (%s) contains no forbidden claim", (lang) => {
    for (const s of allText(compareText(lang, result as unknown as Result)))
      for (const re of FORBIDDEN) expect(s, `${re} in: ${s}`).not.toMatch(re);
  });

  it.each(["en", "vi"] as const)("landing page (%s) contains no forbidden claim", (lang) => {
    for (const s of allText(landingText(lang)))
      for (const re of FORBIDDEN) expect(s, `${re} in: ${s}`).not.toMatch(re);
  });

  it.each(["en", "vi"] as const)("business page (%s) contains no forbidden claim", (lang) => {
    for (const s of allText(businessText(lang)))
      for (const re of FORBIDDEN) expect(s, `${re} in: ${s}`).not.toMatch(re);
  });

  it("business page labels the model a hypothesis with no customers, and states the limits", () => {
    expect(businessText("en").hypothesisBadge).toMatch(/hypothesis.*no customers/i);
    expect(businessText("vi").hypothesisBadge).toMatch(/giả thuyết.*chưa có khách hàng/i);
    expect(businessText("en").useTitle).toMatch(/not tested/);
    expect(businessText("vi").useTitle).toMatch(/chưa thử/);
    for (const lang of ["en", "vi"] as const) {
      const t = businessText(lang);
      expect(t.not).toHaveLength(3);
      expect(t.who.length + t.use.length + t.money.length + t.check.length).toBe(12);
    }
    // No price, customer count or traction figure anywhere on the page.
    for (const s of allText(businessText("en")))
      expect(s).not.toMatch(/\$\s?\d|\d+\s?(customers|users|clients)/i);
  });

  it("landing page says the plain-wallet loss is a hand-written transcript and the refusal count is off-chain", () => {
    expect(landingText("en").plainResult).toMatch(/hand-written/);
    expect(landingText("vi").plainResult).toMatch(/dựng tay/);
    expect(landingText("en").refused).toMatch(/off-chain/);
    expect(landingText("vi").refused).toMatch(/ngoài chain/);
  });

  it("landing page numbers come from the comparison results, not the text", () => {
    for (const lang of ["en", "vi"] as const)
      expect(landingText(lang).limitResult).toMatch(/\{passed\}.*\{attempts\}.*\{reverted\}/);
  });

  it("says the P column is a hand-written transcript, in both languages", () => {
    expect(compareText("en", result as unknown as Result).notes[0]).toMatch(/hand-written/);
    expect(compareText("vi", result as unknown as Result).notes[0]).toMatch(/dựng tay/);
  });

  it("states the six limits in both languages", () => {
    expect(arenaText("en").limits).toHaveLength(6);
    expect(arenaText("vi").limits).toHaveLength(6);
  });

  it("owner console keys exist", () => {
    expect(KEYS.length).toBeGreaterThan(10);
    expect(typeof useI18n).toBe("function");
  });
});
