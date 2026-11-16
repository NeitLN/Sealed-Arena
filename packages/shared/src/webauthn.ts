import { type Hex, isAddress, toHex } from "viem";
import { encodeAuth, MAX_PAYEES, normalizeLowS } from "./agentPolicy.js";

/**
 * Browser-side helpers for the owner's passkey (docs/ARCHITECTURE.md 3.3).
 * Pure functions: no WebAuthn calls here, so they run in tests without a device.
 */

const hex32 = (b: Uint8Array): Hex => toHex(b, { size: 32 });

/** Reads one DER INTEGER at `at`; returns its value bytes (leading sign byte removed) and the next offset. */
function derInt(d: Uint8Array, at: number): { value: Uint8Array; next: number } {
  if (d[at] !== 0x02) throw new Error("signature: expected INTEGER");
  const len = d[at + 1] ?? 0;
  if (len < 1 || len > 33 || at + 2 + len > d.length)
    throw new Error("signature: bad INTEGER length");
  let value = d.subarray(at + 2, at + 2 + len);
  while (value.length > 1 && value[0] === 0) value = value.subarray(1);
  if (value.length > 32) throw new Error("signature: INTEGER longer than 32 bytes");
  return { value, next: at + 2 + len };
}

/**
 * The ECDSA signature of a WebAuthn assertion (ASN.1 DER) as 32-byte (r, s), with s moved to the
 * low half (n − s) as the precompile requires.
 */
export function derToRS(der: Uint8Array): { r: Hex; s: Hex } {
  if (der[0] !== 0x30) throw new Error("signature: expected SEQUENCE");
  const len = der[1] ?? 0;
  if (len + 2 !== der.length) throw new Error("signature: length mismatch");
  const r = derInt(der, 2);
  const s = derInt(der, r.next);
  if (s.next !== der.length) throw new Error("signature: trailing bytes");
  const rv = BigInt(toHex(r.value));
  const sv = BigInt(toHex(s.value));
  if (rv === 0n || sv === 0n) throw new Error("signature: zero r or s");
  return { r: hex32(r.value), s: toHex(normalizeLowS(sv), { size: 32 }) };
}

/** DER prefix of a P-256 SubjectPublicKeyInfo with an uncompressed point (91 bytes in all). */
const P256_SPKI_PREFIX = "3059301306072a8648ce3d020106082a8648ce3d030107034200";

/** (x, y) of the P-256 public key a browser returns from `AuthenticatorAttestationResponse.getPublicKey()`. */
export function spkiToXY(spki: Uint8Array): { x: Hex; y: Hex } {
  const h = toHex(spki).slice(2);
  if (spki.length !== 91 || !h.startsWith(P256_SPKI_PREFIX) || spki[26] !== 0x04) {
    throw new Error("public key: not an uncompressed P-256 key");
  }
  return { x: hex32(spki.subarray(27, 59)), y: hex32(spki.subarray(59, 91)) };
}

/** The `auth` bytes the precompile verifies, from the parts of a WebAuthn assertion. */
export function assertionToAuth(a: {
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
}): Hex {
  const { r, s } = derToRS(a.signature);
  return encodeAuth({
    authenticatorData: toHex(a.authenticatorData),
    clientDataJSON: toHex(a.clientDataJSON),
    r,
    s,
  });
}

/** A USDC amount typed by a person ("0.001") in wei (18 decimals). Throws on anything else. */
export function parseUsdc(input: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,18}))?$/.exec(input.trim());
  if (!m) throw new Error("amount_invalid");
  return BigInt(m[1] ?? "0") * 10n ** 18n + BigInt((m[2] ?? "").padEnd(18, "0"));
}

/** Wei as a USDC amount, without trailing zeros. */
export function formatUsdc(wei: bigint): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / 10n ** 18n;
  const frac = (v % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

export type PayeeWarning = { address: string; reason: "payee_precompile" | "payee_has_code" };

/** Native precompiles (no code in state, so the chain rule does not stop them) and the stateful ranges. */
function isPrecompile(a: string): boolean {
  const v = BigInt(a);
  return (
    (v >= 0x01n && v <= 0x0an) ||
    v === 0x100n ||
    v >> 8n === 0x02000000000000000000000000000000000000n ||
    v >> 8n === 0x03000000000000000000000000000000000000n
  );
}

/**
 * Checks a payee list before it is signed. Errors block; warnings are shown and the owner may go on
 * (coins sent to a precompile or a contract cannot be taken back; docs/ARCHITECTURE.md 3.1).
 * `withCode` holds lower-case addresses found to have code on chain.
 */
export function checkPayees(
  payees: readonly string[],
  withCode: ReadonlySet<string> = new Set(),
): { errors: string[]; warnings: PayeeWarning[] } {
  const errors = new Set<string>();
  const warnings: PayeeWarning[] = [];
  if (payees.length === 0) errors.add("payees_empty");
  if (payees.length > MAX_PAYEES) errors.add("payees_too_many");
  const seen = new Set<string>();
  for (const p of payees) {
    if (!isAddress(p, { strict: false })) {
      errors.add("payee_invalid");
      continue;
    }
    const k = p.toLowerCase();
    if (seen.has(k)) errors.add("payee_duplicate");
    seen.add(k);
    if (isPrecompile(p)) warnings.push({ address: p, reason: "payee_precompile" });
    else if (withCode.has(k)) warnings.push({ address: p, reason: "payee_has_code" });
  }
  return { errors: [...errors], warnings };
}
