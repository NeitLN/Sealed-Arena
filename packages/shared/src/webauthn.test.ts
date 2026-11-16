import { generateKeyPairSync, sign, verify } from "node:crypto";
import { type Hex, hexToBytes, toHex } from "viem";
import { describe, expect, it } from "vitest";
import { P256_N } from "./agentPolicy.js";
import { checkPayees, derToRS, formatUsdc, parseUsdc, spkiToXY } from "./webauthn.js";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const msg = Buffer.from("sealed arena");

/** Re-encodes (r, s) as DER, with the minimal integer encoding a browser uses. */
function der(r: bigint, s: bigint): Uint8Array {
  const int = (v: bigint) => {
    let b = Buffer.from(v.toString(16).padStart(64, "0"), "hex");
    while (b.length > 1 && b[0] === 0 && (b[1] ?? 0) < 0x80) b = b.subarray(1);
    if ((b[0] ?? 0) >= 0x80) b = Buffer.concat([Buffer.from([0]), b]);
    return Buffer.concat([Buffer.from([0x02, b.length]), b]);
  };
  const body = Buffer.concat([int(r), int(s)]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

const verifies = (r: Hex, s: Hex) =>
  verify(
    "sha256",
    msg,
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.concat([hexToBytes(r), hexToBytes(s)]),
  );

describe("derToRS", () => {
  it("turns a DER signature from the platform into 32-byte (r, s) that still verifies", () => {
    for (let i = 0; i < 20; i++) {
      const sig = sign("sha256", msg, { key: privateKey, dsaEncoding: "der" });
      const { r, s } = derToRS(new Uint8Array(sig));
      expect(hexToBytes(r)).toHaveLength(32);
      expect(hexToBytes(s)).toHaveLength(32);
      expect(verifies(r, s)).toBe(true);
      expect(BigInt(s) <= P256_N / 2n).toBe(true);
    }
  });

  it("keeps the value of an r shorter than 32 bytes (DER drops leading zero bytes)", () => {
    const r = 0x00ab_cdefn << 200n; // first byte zero: 31 bytes in DER
    const out = derToRS(der(r, 7n));
    expect(hexToBytes(out.r)).toHaveLength(32);
    expect(BigInt(out.r)).toBe(r);
    expect(BigInt(derToRS(der(5n, 7n)).r)).toBe(5n);
  });

  it("verifies a platform signature whose r starts with a zero byte", () => {
    let p1363: Buffer;
    do p1363 = sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
    while (p1363[0] !== 0);
    const r = BigInt(toHex(p1363.subarray(0, 32)));
    const s = BigInt(toHex(p1363.subarray(32)));
    const out = derToRS(der(r, s));
    expect(verifies(out.r, out.s)).toBe(true);
  });

  it("moves a high s to the low half, n - s (E4)", () => {
    const p1363 = sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
    const r = BigInt(toHex(p1363.subarray(0, 32)));
    const s = BigInt(toHex(p1363.subarray(32)));
    const high = s > P256_N / 2n ? s : P256_N - s;
    const out = derToRS(der(r, high));
    expect(BigInt(out.s)).toBe(P256_N - high);
    expect(verifies(out.r, out.s)).toBe(true);
  });

  it.each([
    ["not a sequence", "0x3102010102010a"],
    ["truncated", "0x3006020101020101ff"],
    ["integer longer than 33 bytes", `0x3026022201${"00".repeat(33)}020101`],
    ["zero r", "0x3006020100020101"],
  ])("refuses %s", (_name, bad) => {
    expect(() => derToRS(hexToBytes(bad as Hex))).toThrow();
  });
});

describe("spkiToXY", () => {
  it("reads the P-256 point from the SPKI a browser returns with getPublicKey()", () => {
    const spki = publicKey.export({ format: "der", type: "spki" });
    const jwk = publicKey.export({ format: "jwk" });
    const { x, y } = spkiToXY(new Uint8Array(spki));
    expect(x).toBe(toHex(Buffer.from(jwk.x ?? "", "base64url")));
    expect(y).toBe(toHex(Buffer.from(jwk.y ?? "", "base64url")));
  });

  it("refuses a key that is not P-256", () => {
    const { publicKey: ed } = generateKeyPairSync("ed25519");
    expect(() => spkiToXY(new Uint8Array(ed.export({ format: "der", type: "spki" })))).toThrow();
  });
});

describe("parseUsdc / formatUsdc (E5)", () => {
  it.each([
    ["0.001", 10n ** 15n],
    ["1", 10n ** 18n],
    ["3.5", 35n * 10n ** 17n],
    [" 2 ", 2n * 10n ** 18n],
    ["0.000000000000000001", 1n],
  ])("parses %j", (s, wei) => {
    expect(parseUsdc(s)).toBe(wei);
  });

  it.each(["", "-1", "1e3", "1.0000000000000000001", "abc", "1,5", ".5"])("refuses %j", (s) => {
    expect(() => parseUsdc(s)).toThrow();
  });

  it("formats wei back without trailing zeros", () => {
    expect(formatUsdc(10n ** 15n)).toBe("0.001");
    expect(formatUsdc(3n * 10n ** 18n)).toBe("3");
  });
});

describe("checkPayees (E6)", () => {
  const a = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";
  const b = "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955";

  it("accepts 1 to 16 distinct addresses", () => {
    expect(checkPayees([a, b]).errors).toEqual([]);
  });

  it("refuses none, more than 16, duplicates and bad addresses", () => {
    expect(checkPayees([]).errors).toContain("payees_empty");
    const many = Array.from(
      { length: 17 },
      (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`,
    );
    expect(checkPayees(many).errors).toContain("payees_too_many");
    expect(checkPayees([a, a.toLowerCase()]).errors).toContain("payee_duplicate");
    expect(checkPayees(["0x1234"]).errors).toContain("payee_invalid");
  });

  it("warns, without refusing, for precompile addresses and for payees with code", () => {
    const r = checkPayees(
      ["0x0300000000000000000000000000000000000001", a, b],
      new Set([b.toLowerCase()]),
    );
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([
      { address: "0x0300000000000000000000000000000000000001", reason: "payee_precompile" },
      { address: b, reason: "payee_has_code" },
    ]);
  });
});
