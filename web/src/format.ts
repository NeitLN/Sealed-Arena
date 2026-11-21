import { formatUsdc } from "@sealed-arena/shared";

/** USDC with the 18-decimal native coin cut to 6 decimals ("≈" when that drops digits). */
export function usdcApprox(wei: bigint): string {
  const kept = wei - (wei % 10n ** 12n);
  return `${kept === wei ? "" : "≈"}${formatUsdc(kept)}`;
}

/** An address as 0x1234…abcd. */
export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/** The singular form for exactly one, the plural form otherwise. */
export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
