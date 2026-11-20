import { describe, expect, it } from "vitest";
import { plural, shortAddress, usdcApprox } from "./format.js";

describe("usdcApprox", () => {
  it("keeps up to 6 decimals and marks dropped digits with ≈", () => {
    // 4.949873999999916 USDC with 18 decimals, as the live monitor read it.
    expect(usdcApprox(4_949_873_999_999_916_000n)).toBe("≈4.949873");
  });
  it("shows exact values without ≈", () => {
    expect(usdcApprox(5n * 10n ** 18n)).toBe("5");
    expect(usdcApprox(20_000_000_000_000_000n)).toBe("0.02");
    expect(usdcApprox(0n)).toBe("0");
  });
  it("marks a value below one micro-USDC as ≈0", () => {
    expect(usdcApprox(1n)).toBe("≈0");
  });
});

describe("shortAddress", () => {
  it("keeps 0x plus 4 hex characters at the front and 4 at the end", () => {
    expect(shortAddress("0x67d4a4664ff232e84FA89135EeFEb42DF3660819")).toBe("0x67d4…0819");
  });
  it("leaves short strings alone", () => {
    expect(shortAddress("0x1234")).toBe("0x1234");
  });
});

describe("plural", () => {
  it("picks the singular form only for exactly one", () => {
    expect(plural(1, "one", "many")).toBe("one");
    expect(plural(0, "one", "many")).toBe("many");
    expect(plural(2, "one", "many")).toBe("many");
  });
});
