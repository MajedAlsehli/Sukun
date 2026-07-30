/**
 * Task 10 (decisions.md K4) — bounded fan-out.
 *
 * `await Promise.all(items.map(fn))` issues ONE query per item simultaneously.
 * That is fine for a fixed handful and wrong for a list: this project runs
 * against a Supabase pooler with a documented client ceiling, and a company
 * with twenty projects would have asked for a hundred simultaneous connections
 * from a single request. Task 9 (J15) applied exactly this discipline to the PM
 * aggregates; Task 10 extends it to the company/project surfaces it missed.
 *
 * Order is preserved, so callers can keep using the result positionally.
 */
export const DEFAULT_QUERY_BATCH_SIZE = 3;

export async function mapInBatches<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  batchSize: number = DEFAULT_QUERY_BATCH_SIZE,
): Promise<R[]> {
  const size = Math.max(1, batchSize);
  const out: R[] = new Array(items.length);

  for (let start = 0; start < items.length; start += size) {
    const slice = items.slice(start, start + size);
    const settled = await Promise.all(slice.map((item, i) => fn(item, start + i)));
    for (let i = 0; i < settled.length; i += 1) out[start + i] = settled[i];
  }

  return out;
}
