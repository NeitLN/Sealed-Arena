/** Minimal public ESM types for the vendored qrcode-generator 2.0.4. */
export default function qrcode(
  type: number,
  level: "L" | "M" | "Q" | "H",
): {
  addData(data: string): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
};
