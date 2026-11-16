import { type Hex, sha256 } from "viem";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Avalanche CB58 (base58 with a 4-byte sha256 checksum) to 0x hex of the payload. */
export function cb58ToHex(s: string): Hex {
  let n = 0n;
  for (const ch of s) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error(`cb58: bad character ${ch}`);
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  const zeros = s.match(/^1*/)?.[0].length ?? 0;
  const bytes = `${"00".repeat(zeros)}${hex}`;
  const payload = bytes.slice(0, -8);
  const check = bytes.slice(-8);
  if (sha256(`0x${payload}`).slice(-8) !== check) throw new Error("cb58: bad checksum");
  return `0x${payload}`;
}

type LinkRefs = Record<string, Record<string, Array<{ start: number; length: number }>>>;

/** Fills library placeholders in bytecode at the byte offsets solc reports. */
export function linkLibrary(bytecode: Hex, refs: LinkRefs, address: Hex): Hex {
  let code = bytecode.slice(2);
  const addr = address.slice(2).toLowerCase();
  for (const lib of Object.values(refs)) {
    for (const spots of Object.values(lib)) {
      for (const { start, length } of spots) {
        code = code.slice(0, start * 2) + addr + code.slice((start + length) * 2);
      }
    }
  }
  if (code.includes("__")) throw new Error("bytecode still has unlinked library placeholders");
  return `0x${code}`;
}
