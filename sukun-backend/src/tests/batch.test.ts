import { mapInBatches, DEFAULT_QUERY_BATCH_SIZE } from '../shared/batch';

/**
 * Task 10 (decisions.md K4) — bounded fan-out.
 *
 * The property under test is not "it maps": it is "it never has more than
 * `batchSize` calls in flight at once". This project runs against a Supabase
 * pooler with a documented client ceiling, and the local browser pass genuinely
 * hit it — `Promise.all(projects.map(...))` over a company's project list was
 * asking for five simultaneous connections per project.
 */
describe('mapInBatches', () => {
  it('preserves order and results', async () => {
    const out = await mapInBatches([1, 2, 3, 4, 5, 6, 7], async (n) => n * 2, 3);
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
  });

  it('never exceeds the batch size in flight', async () => {
    let inFlight = 0;
    let peak = 0;

    await mapInBatches(
      Array.from({ length: 20 }, (_, i) => i),
      async (n) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight -= 1;
        return n;
      },
      3,
    );

    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // still concurrent, not serialised one-by-one
  });

  it('passes the ORIGINAL index, not the index within the batch', async () => {
    const seen: number[] = [];
    await mapInBatches([10, 11, 12, 13, 14], async (_item, i) => void seen.push(i), 2);
    expect(seen.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('handles an empty list and a single item without issuing anything odd', async () => {
    expect(await mapInBatches([], async () => 1)).toEqual([]);
    expect(await mapInBatches([7], async (n) => n)).toEqual([7]);
  });

  it('treats a nonsensical batch size as 1 rather than dividing by zero', async () => {
    expect(await mapInBatches([1, 2, 3], async (n) => n, 0)).toEqual([1, 2, 3]);
    expect(await mapInBatches([1, 2, 3], async (n) => n, -5)).toEqual([1, 2, 3]);
  });

  it('defaults to a small batch - the ceiling is real, not theoretical', () => {
    expect(DEFAULT_QUERY_BATCH_SIZE).toBeLessThanOrEqual(3);
  });
});
