/**
 * Splits an array into groups of at most `size` — what the four large
 * entities (plan §5.3) use to turn `--batch-size` into "one transaction per
 * chunk" instead of one 8,000-row transaction or 8,000 one-row ones.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive.');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
