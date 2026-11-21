import { readFileSync } from "node:fs";
import { hexToBytes } from "viem";
import { describe, expect, it } from "vitest";
import { clientDataAcceptedV3, scanClientDataStrict } from "./clientDataStrict.js";

const repoFile = (p: string) => new URL(`../../../${p}`, import.meta.url);
const enc = (s: string) => new TextEncoder().encode(s);

describe("strict clientDataJSON (rule v3)", () => {
  const v = JSON.parse(readFileSync(repoFile("chain/testvectors/clientdata-v3.json"), "utf8")) as {
    challenge: string;
    cases: { category: string; hex: string; strict: boolean }[];
  };

  it("gives the verdicts of the shared vectors (the Go precompile tests check the same file)", () => {
    expect(v.cases.length).toBeGreaterThan(20);
    for (const c of v.cases) {
      const cd = hexToBytes(`0x${c.hex}`);
      expect(scanClientDataStrict(cd).ok, `${c.category}: ${new TextDecoder().decode(cd)}`).toBe(
        c.strict,
      );
      // The legacy (v1/v2) parser accepts every case: JSON.parse is a stand-in for it here.
      if (c.category !== "invalid-utf8") {
        expect(() => JSON.parse(new TextDecoder().decode(cd))).not.toThrow();
      }
    }
  });

  it("checks type and challenge after the grammar", () => {
    const ok = enc(`{"type":"webauthn.get","challenge":"${v.challenge}"}`);
    expect(clientDataAcceptedV3(ok, v.challenge)).toBe(true);
    expect(clientDataAcceptedV3(ok, "B".repeat(43))).toBe(false);
    const create = enc(`{"type":"webauthn.create","challenge":"${v.challenge}"}`);
    expect(clientDataAcceptedV3(create, v.challenge)).toBe(false);
  });

  it("generated client serializations pass", () => {
    const origins = [
      '"https://sealed.example"',
      '"https:\\/\\/sealed.example"',
      '"https://s\\u00e9aled.example"',
    ];
    for (let i = 0; i < 200; i++) {
      const kv = [
        '"type":"webauthn.get"',
        `"challenge":"${v.challenge}"`,
        `"origin":${origins[i % origins.length]}`,
      ];
      if (i % 2) kv.push(`"crossOrigin":${i % 4 === 1}`);
      if (i % 3 === 0) kv.push('"topOrigin":"https://top.example"');
      if (i % 5 === 0) kv.reverse();
      const cd = enc(`{${kv.join(",")}}`);
      expect(scanClientDataStrict(cd).ok, new TextDecoder().decode(cd)).toBe(true);
    }
  });

  it("refuses the grammar rules one by one", () => {
    const c = v.challenge;
    const base = (extra: string) => `{"type":"webauthn.get","challenge":"${c}"${extra}}`;
    for (const bad of [
      ` ${base("")}`,
      `${base("")}x`,
      base(',"type":"webauthn.get"'),
      base(',"n":1.5'),
      base(',"n":01'),
      base(',"n":1234567890123456'),
      base(',"x":{"a":[{"b":[1]}]}'),
      base(',"o":"\\x"'),
      `{"challenge":"${c}"}`,
      "{}",
    ]) {
      expect(scanClientDataStrict(enc(bad)).ok, bad).toBe(false);
    }
    expect(
      scanClientDataStrict(enc(base(',"x":{"a":[{"b":1}]},"n":-0,"m":123456789012345'))).ok,
    ).toBe(true);
  });
});
