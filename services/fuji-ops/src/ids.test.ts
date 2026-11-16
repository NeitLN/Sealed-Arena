import { describe, expect, it } from "vitest";
import { cb58ToHex, linkLibrary } from "./ids.js";

describe("cb58ToHex", () => {
  it("decodes the Fuji C-Chain blockchain ID", () => {
    // Fuji C-Chain: yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp
    expect(cb58ToHex("yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWp")).toBe(
      "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5",
    );
  });

  it("refuses a bad checksum", () => {
    expect(() => cb58ToHex("yH8D7ThNJkxmtkuv2jgBa4P1Rn3Qpr4pPr7QYNfcdoS6k6HWq")).toThrow();
  });
});

describe("linkLibrary", () => {
  it("writes the library address at every reference", () => {
    const code = `0x${"aa".repeat(4)}${"__$0123$__".padEnd(40, "_")}${"bb".repeat(2)}${"__$0123$__".padEnd(40, "_")}`;
    const refs = {
      "x.sol": {
        L: [
          { start: 4, length: 20 },
          { start: 26, length: 20 },
        ],
      },
    };
    const out = linkLibrary(
      code as `0x${string}`,
      refs,
      "0x1111111111111111111111111111111111111111",
    );
    expect(out).toBe(`0x${"aa".repeat(4)}${"11".repeat(20)}${"bb".repeat(2)}${"11".repeat(20)}`);
  });

  it("refuses bytecode that still has placeholders", () => {
    const code = "0x__$0123$__" as `0x${string}`;
    expect(() => linkLibrary(code, {}, "0x1111111111111111111111111111111111111111")).toThrow();
  });
});
