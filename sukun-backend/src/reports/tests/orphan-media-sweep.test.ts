import { decideSweep } from '../../scripts/prune-orphan-report-media';

/**
 * Task 3 (Step 9) — the orphan sweeper's decision rules.
 *
 * The property that matters most is NEGATIVE: a referenced object must never
 * become eligible, under any combination of age, prefix or owner. Everything
 * else is a bonus. These tests drive the pure decision function, so they need
 * no bucket and no database.
 */

const NOW = new Date('2026-07-30T12:00:00.000Z');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const knownUserIds = new Set([USER, OTHER]);

function hoursAgo(h: number): Date {
  return new Date(NOW.getTime() - h * 3_600_000);
}

function sweep(objects: { key: string; createdAt: Date }[], referenced: string[] = [], minAgeHours = 24) {
  return decideSweep({
    objects,
    referencedKeys: new Set(referenced),
    knownUserIds,
    now: NOW,
    minAgeHours,
  });
}

describe('referenced media are NEVER eligible', () => {
  it('skips a key that a report still references, however old', () => {
    const key = `reports/staging/${USER}/live.jpg`;
    const r = sweep([{ key, createdAt: hoursAgo(10_000) }], [key]);
    expect(r.eligible).toEqual([]);
    expect(r.skippedReferenced).toEqual([key]);
  });

  it('protects every referenced key while still sweeping the unreferenced ones', () => {
    const referenced = `reports/staging/${USER}/kept.jpg`;
    const orphan = `reports/staging/${USER}/dropped.jpg`;
    const r = sweep(
      [
        { key: referenced, createdAt: hoursAgo(200) },
        { key: orphan, createdAt: hoursAgo(200) },
      ],
      [referenced],
    );
    expect(r.eligible.map((e) => e.key)).toEqual([orphan]);
    expect(r.skippedReferenced).toEqual([referenced]);
  });

  it('a referenced key belonging to ANOTHER user is still protected', () => {
    const key = `reports/staging/${OTHER}/kept.jpg`;
    const r = sweep([{ key, createdAt: hoursAgo(500) }], [key]);
    expect(r.eligible).toEqual([]);
  });
});

describe('eligible orphans', () => {
  it('sweeps an old, unreferenced, provably-owned staged object', () => {
    const key = `reports/staging/${USER}/abandoned.jpg`;
    const r = sweep([{ key, createdAt: hoursAgo(48) }]);
    expect(r.eligible).toHaveLength(1);
    expect(r.eligible[0]).toMatchObject({ key, userId: USER });
    expect(r.eligible[0].ageHours).toBe(48);
  });

  it('sweeps orphans across several owners independently', () => {
    const a = `reports/staging/${USER}/a.jpg`;
    const b = `reports/staging/${OTHER}/b.jpg`;
    const r = sweep([
      { key: a, createdAt: hoursAgo(30) },
      { key: b, createdAt: hoursAgo(30) },
    ]);
    expect(r.eligible.map((e) => e.key).sort()).toEqual([a, b].sort());
  });
});

describe('the age floor protects a journey in progress', () => {
  it('never sweeps an object younger than the floor', () => {
    const key = `reports/staging/${USER}/in-progress.jpg`;
    const r = sweep([{ key, createdAt: hoursAgo(1) }]);
    expect(r.eligible).toEqual([]);
    expect(r.skippedTooNew).toEqual([key]);
  });

  it('treats the floor as inclusive-from, not a rounding accident', () => {
    const key = `reports/staging/${USER}/edge.jpg`;
    expect(sweep([{ key, createdAt: hoursAgo(23.9) }]).eligible).toEqual([]);
    expect(sweep([{ key, createdAt: hoursAgo(24.1) }]).eligible).toHaveLength(1);
  });
});

describe('scope and ownership', () => {
  it('refuses a key outside the staging prefix', () => {
    // Permanent before/after media live under `reports/{reportId}/…` and must
    // never be listed, let alone deleted.
    const key = `reports/some-report-id/after/final.jpg`;
    const r = sweep([{ key, createdAt: hoursAgo(999) }]);
    expect(r.eligible).toEqual([]);
    expect(r.skippedUnknownOwner).toEqual([key]);
  });

  it('refuses a key whose owner segment is not a real user', () => {
    const key = 'reports/staging/not-a-user/x.jpg';
    const r = sweep([{ key, createdAt: hoursAgo(999) }]);
    expect(r.eligible).toEqual([]);
    expect(r.skippedUnknownOwner).toEqual([key]);
  });

  it('refuses a key with an empty owner segment', () => {
    const key = 'reports/staging//x.jpg';
    const r = sweep([{ key, createdAt: hoursAgo(999) }]);
    expect(r.eligible).toEqual([]);
    expect(r.skippedUnknownOwner).toEqual([key]);
  });

  it('never reports the same key as both eligible and skipped', () => {
    const keys = [
      `reports/staging/${USER}/old.jpg`,
      `reports/staging/${USER}/new.jpg`,
      `reports/staging/${USER}/kept.jpg`,
      'reports/staging/ghost/x.jpg',
      'reports/final/y.jpg',
    ];
    const r = sweep(
      [
        { key: keys[0], createdAt: hoursAgo(100) },
        { key: keys[1], createdAt: hoursAgo(2) },
        { key: keys[2], createdAt: hoursAgo(100) },
        { key: keys[3], createdAt: hoursAgo(100) },
        { key: keys[4], createdAt: hoursAgo(100) },
      ],
      [keys[2]],
    );
    const all = [
      ...r.eligible.map((e) => e.key),
      ...r.skippedReferenced,
      ...r.skippedTooNew,
      ...r.skippedUnknownOwner,
    ];
    expect(all).toHaveLength(keys.length);
    expect(new Set(all).size).toBe(keys.length);
  });
});
