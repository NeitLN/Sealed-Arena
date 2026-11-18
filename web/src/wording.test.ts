import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { arenaText } from "./arenaText.js";
import { businessText } from "./businessText.js";
import result from "./compare-result.json";
import { compareText, type Result } from "./compareText.js";
import { KEYS, useI18n } from "./i18n.js";
import { landingText } from "./landingText.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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

  it.each(["en", "vi"] as const)(
    "challenge, business and comparison pages (%s) speak of one validator and block inclusion",
    (lang) => {
      const OVERCLAIM =
        /validators (refuse|check)|refused by the validators|all validators|never enters? a block|never (reach|in) a block|standard EVM RPC|common style|RPC EVM chuẩn|kiểu phổ biến|toàn bộ validator/i;
      const pages = [
        arenaText(lang),
        businessText(lang),
        compareText(lang, result as unknown as Result),
      ];
      for (const s of pages.flatMap(allText))
        expect(s, `overclaim in: ${s}`).not.toMatch(OVERCLAIM);
    },
  );

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
      expect(t.not).toHaveLength(5);
      expect(t.who.length + t.use.length + t.money.length + t.check.length).toBe(12);
    }
    // No price, customer count or traction figure anywhere on the page.
    for (const s of allText(businessText("en")))
      expect(s).not.toMatch(/\$\s?\d|\d+\s?(customers|users|clients)/i);
  });

  it("landing page says the plain-wallet loss is a hand-written transcript and the refusal count is off-chain", () => {
    expect(landingText("en").plainResult).toMatch(/hand-written/);
    expect(landingText("vi").plainResult).toMatch(/dựng tay/);
    expect(landingText("en").refusedSource).toMatch(/off-chain/);
    expect(landingText("vi").refusedSource).toMatch(/ngoài chain/);
  });

  it.each(["en", "vi"] as const)("S burst outcomes in %s describe block inclusion", (lang) => {
    const t = landingText(lang);
    expect([t.inBlocks, t.keptOut, t.reverted, t.sealedResult].join(" ")).not.toMatch(
      /refused|từ chối/i,
    );
  });

  it("landing page numbers come from the comparison results, not the text", () => {
    for (const lang of ["en", "vi"] as const)
      expect(landingText(lang).limitResult).toMatch(/\{passed\}.*\{attempts\}.*\{reverted\}/);
  });

  it("explains the clean-up after the S measurement, with its blocks, in both languages", () => {
    const r = result as unknown as Result;
    const a = r.S.afterMeasurement;
    if (!a) throw new Error("compare-result.json has no afterMeasurement for S");
    for (const lang of ["en", "vi"] as const) {
      const note = compareText(lang, r).notes.at(-1) ?? "";
      expect(note).toContain(`block ${a.waitingIncluded.block}`);
      expect(note).toContain(String(a.waitingIncluded.count));
    }
  });

  it("says the P column is a hand-written transcript, in both languages", () => {
    expect(compareText("en", result as unknown as Result).notes[0]).toMatch(/hand-written/);
    expect(compareText("vi", result as unknown as Result).notes[0]).toMatch(/dựng tay/);
  });

  it("states the six limits in both languages", () => {
    expect(arenaText("en").limits).toHaveLength(6);
    expect(arenaText("vi").limits).toHaveLength(6);
  });

  it.each([
    ["arenaText", (l: "en" | "vi") => arenaText(l)],
    ["landingText", (l: "en" | "vi") => landingText(l)],
    ["businessText", (l: "en" | "vi") => businessText(l)],
    ["compareText", (l: "en" | "vi") => compareText(l, result as unknown as Result)],
  ])("%s has the same keys and list lengths in English and Vietnamese", (_, text) => {
    const shape = (v: unknown): unknown =>
      Array.isArray(v)
        ? v.map(shape)
        : v && typeof v === "object"
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shape(x)]))
          : typeof v;
    expect(shape(text("vi"))).toEqual(shape(text("en")));
    for (const s of allText(text("vi"))) expect(s.trim(), "empty Vietnamese string").not.toBe("");
  });

  it.each([
    "README.md",
    "SECURITY.md",
    "docs/SUBMISSION.md",
    "docs/EVALUATION.md",
    "docs/ARCHITECTURE.md",
    "services/agent/README.md",
  ])("%s contains no forbidden claim", (file) => {
    const text = readFileSync(resolve(ROOT, file), "utf8");
    for (const re of FORBIDDEN) expect(text, `${re} in ${file}`).not.toMatch(re);
  });

  it("owner console keys exist", () => {
    expect(KEYS.length).toBeGreaterThan(10);
    expect(typeof useI18n).toBe("function");
  });
});
