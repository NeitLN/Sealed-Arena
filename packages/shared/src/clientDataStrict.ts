// The strict clientDataJSON check of agent rule v3, the same grammar as the precompile's
// checkClientDataV3 (docs/ARCHITECTURE.md 3.6). The owner page runs it before submitting, so a
// proof the chain would refuse is caught in the browser. Shared vectors:
// chain/testvectors/clientdata-divergences.json.

const MAX_KEYS = 16;
const MAX_DEPTH = 4;
const MAX_INT_DIGITS = 15;

export type StrictClientData =
  | { ok: true; type: string; challenge: string }
  | { ok: false; error: "bad_client_data" };

const isHex = (c: number) =>
  (c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x66) || (c >= 0x41 && c <= 0x46);
const isDigit = (c: number) => c >= 0x30 && c <= 0x39;

class Scanner {
  i = 0;
  constructor(readonly b: Uint8Array) {}

  eat(c: string): boolean {
    if (this.i < this.b.length && this.b[this.i] === c.charCodeAt(0)) {
      this.i++;
      return true;
    }
    return false;
  }

  atEnd(): boolean {
    return this.i === this.b.length;
  }

  /** A string of bytes 0x20-0x7e without '"' or '\'; returns its content. */
  plainString(): string | undefined {
    if (!this.eat('"')) return undefined;
    const start = this.i;
    while (this.i < this.b.length) {
      const c = this.b[this.i] as number;
      if (c === 0x22) {
        const s = String.fromCharCode(...this.b.subarray(start, this.i));
        this.i++;
        return s;
      }
      if (c < 0x20 || c > 0x7e || c === 0x5c) return undefined;
      this.i++;
    }
    return undefined;
  }

  /** Length of the valid UTF-8 sequence at i (no overlongs, surrogates or values above U+10FFFF), or 0. */
  utf8Len(): number {
    const b = this.b;
    const i = this.i;
    const c0 = b[i] as number;
    const cont = (k: number) => {
      const c = b[i + k];
      return c !== undefined && c >= 0x80 && c <= 0xbf;
    };
    if (c0 >= 0xc2 && c0 <= 0xdf) return cont(1) ? 2 : 0;
    if (c0 >= 0xe0 && c0 <= 0xef) {
      const c1 = b[i + 1];
      if (c1 === undefined) return 0;
      if (c0 === 0xe0 && c1 < 0xa0) return 0;
      if (c0 === 0xed && c1 > 0x9f) return 0;
      return cont(1) && cont(2) ? 3 : 0;
    }
    if (c0 >= 0xf0 && c0 <= 0xf4) {
      const c1 = b[i + 1];
      if (c1 === undefined) return 0;
      if (c0 === 0xf0 && c1 < 0x90) return 0;
      if (c0 === 0xf4 && c1 > 0x8f) return 0;
      return cont(1) && cont(2) && cont(3) ? 4 : 0;
    }
    return 0;
  }

  skipString(): boolean {
    if (!this.eat('"')) return false;
    while (this.i < this.b.length) {
      const c = this.b[this.i] as number;
      if (c === 0x22) {
        this.i++;
        return true;
      }
      if (c < 0x20) return false;
      if (c === 0x5c) {
        const e = this.b[this.i + 1];
        if (e === undefined) return false;
        if ('"\\/bfnrt'.includes(String.fromCharCode(e))) {
          this.i += 2;
        } else if (e === 0x75) {
          for (let k = 2; k < 6; k++) {
            const h = this.b[this.i + k];
            if (h === undefined || !isHex(h)) return false;
          }
          this.i += 6;
        } else {
          return false;
        }
      } else if (c < 0x80) {
        this.i++;
      } else {
        const n = this.utf8Len();
        if (n === 0) return false;
        this.i += n;
      }
    }
    return false;
  }

  lit(s: string): boolean {
    for (let k = 0; k < s.length; k++) {
      if (this.b[this.i + k] !== s.charCodeAt(k)) return false;
    }
    this.i += s.length;
    return true;
  }

  skipInt(): boolean {
    this.eat("-");
    const c = this.b[this.i];
    if (c === undefined) return false;
    if (c === 0x30) {
      this.i++;
    } else if (c >= 0x31 && c <= 0x39) {
      this.i++;
      let n = 0;
      while (this.i < this.b.length && isDigit(this.b[this.i] as number)) {
        if (n === MAX_INT_DIGITS - 1) return false;
        n++;
        this.i++;
      }
    } else {
      return false;
    }
    const next = this.b[this.i];
    if (next !== undefined && (isDigit(next) || next === 0x2e || next === 0x65 || next === 0x45)) {
      return false;
    }
    return true;
  }

  skipValue(depth: number): boolean {
    const c = this.b[this.i];
    if (c === undefined) return false;
    if (c === 0x22) return this.skipString();
    if (c === 0x74) return this.lit("true");
    if (c === 0x66) return this.lit("false");
    if (c === 0x6e) return this.lit("null");
    if (c === 0x2d || isDigit(c)) return this.skipInt();
    if (c === 0x7b || c === 0x5b) {
      if (depth + 1 > MAX_DEPTH) return false;
      const object = c === 0x7b;
      const close = object ? "}" : "]";
      this.i++;
      if (this.eat(close)) return true;
      for (;;) {
        if (object && (!this.skipString() || !this.eat(":"))) return false;
        if (!this.skipValue(depth + 1)) return false;
        if (this.eat(close)) return true;
        if (!this.eat(",")) return false;
      }
    }
    return false;
  }
}

/** Checks the grammar and returns the raw type and challenge (the precompile's scanClientDataV3). */
export function scanClientDataStrict(cd: Uint8Array): StrictClientData {
  const bad = { ok: false, error: "bad_client_data" } as const;
  const p = new Scanner(cd);
  if (!p.eat("{")) return bad;
  const seen = new Set<string>();
  let type: string | undefined;
  let challenge: string | undefined;
  for (;;) {
    const k = p.plainString();
    if (k === undefined || !p.eat(":") || seen.size === MAX_KEYS || seen.has(k)) return bad;
    seen.add(k);
    if (k === "type") {
      type = p.plainString();
      if (type === undefined) return bad;
    } else if (k === "challenge") {
      challenge = p.plainString();
      if (challenge === undefined) return bad;
    } else if (!p.skipValue(1)) {
      return bad;
    }
    if (p.eat("}")) break;
    if (!p.eat(",")) return bad;
  }
  if (!p.atEnd() || type === undefined || challenge === undefined) return bad;
  return { ok: true, type, challenge };
}

/** Whether the chain under rule v3 accepts this clientDataJSON for `expectedChallenge` (base64url). */
export function clientDataAcceptedV3(cd: Uint8Array, expectedChallenge: string): boolean {
  const r = scanClientDataStrict(cd);
  return r.ok && r.type === "webauthn.get" && r.challenge === expectedChallenge;
}
