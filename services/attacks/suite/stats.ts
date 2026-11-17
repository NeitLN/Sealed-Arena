/** z for a two-sided 95% interval. */
const Z = 1.959964;

/** Wilson score interval for k successes in n trials (95%). */
export function wilson(k: number, n: number): { rate: number; low: number; high: number } {
  if (!Number.isInteger(n) || n <= 0) throw new Error("wilson: n must be a positive integer");
  if (!Number.isInteger(k) || k < 0 || k > n) throw new Error("wilson: k must be in 0..n");
  const p = k / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { rate: p, low: Math.max(0, center - half), high: Math.min(1, center + half) };
}
