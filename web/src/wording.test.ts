import { describe, expect, it } from "vitest";
import { arenaText } from "./arenaText.js";
import { KEYS, useI18n } from "./i18n.js";

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

  it("states the six limits in both languages", () => {
    expect(arenaText("en").limits).toHaveLength(6);
    expect(arenaText("vi").limits).toHaveLength(6);
  });

  it("owner console keys exist", () => {
    expect(KEYS.length).toBeGreaterThan(10);
    expect(typeof useI18n).toBe("function");
  });
});
