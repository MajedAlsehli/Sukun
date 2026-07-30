import { unlockDemoAccounts } from '../scripts/unlock-demo-accounts';
import { DEMO_ACCOUNT_EMAILS } from '../scripts/demo-seed';

// ---------------------------------------------------------------------------
// `unlock-demo-accounts.ts` must clear the lockout on the six demo accounts
// and be incapable of doing anything else.
//
// A Prisma double is used deliberately: this asserts what the script WRITES
// and, just as importantly, what it does NOT write - which is a property of
// the query, not of any particular database's contents.
// ---------------------------------------------------------------------------

const DEMO_ROWS = [
  { email: 'company@sakn-demo.sa', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 600_000) },
  { email: 'pm@sakn-demo.sa', failedLoginAttempts: 3, lockedUntil: null },
  { email: 'technician@sakn-demo.sa', failedLoginAttempts: 0, lockedUntil: null },
  { email: 'technician2@sakn-demo.sa', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 900_000) },
  { email: 'homeowner@sakn-demo.sa', failedLoginAttempts: 1, lockedUntil: null },
  { email: 'seeker@sakn-demo.sa', failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 60_000) },
];

/** A locked-out account that is NOT part of the demo tenant. It must survive untouched. */
const BYSTANDER = {
  email: 'real.customer@example.com',
  failedLoginAttempts: 5,
  lockedUntil: new Date(Date.now() + 900_000),
  passwordHash: '$2b$10$unchanged',
  role: 'HOMEOWNER',
  status: 'ACTIVE',
};

type UserRow = { email: string; failedLoginAttempts: number; lockedUntil: Date | null; [k: string]: unknown };

function makeDb(seedRows: UserRow[]) {
  const rows: UserRow[] = seedRows.map((r) => ({ ...r }));
  const updateManyCalls: Array<{ where: unknown; data: unknown }> = [];
  const otherWrites: string[] = [];

  const forbid = (name: string) =>
    jest.fn(async () => {
      otherWrites.push(name);
      return { count: 0 };
    });

  const db = {
    user: {
      findMany: jest.fn(async ({ where }: { where: { email: { in: string[] } } }) =>
        rows
          .filter((r) => where.email.in.includes(r.email))
          .map((r) => ({
            email: r.email,
            failedLoginAttempts: r.failedLoginAttempts,
            lockedUntil: r.lockedUntil,
          })),
      ),
      updateMany: jest.fn(
        async ({ where, data }: { where: { email: { in: string[] } }; data: Record<string, unknown> }) => {
          updateManyCalls.push({ where, data });
          let count = 0;
          for (const row of rows) {
            if (!where.email.in.includes(row.email)) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
      update: forbid('user.update'),
      upsert: forbid('user.upsert'),
      create: forbid('user.create'),
      delete: forbid('user.delete'),
      deleteMany: forbid('user.deleteMany'),
    },
  };

  return { db, rows, updateManyCalls, otherWrites };
}

describe('unlock-demo-accounts - clears the lock', () => {
  it('sets failedLoginAttempts to 0 and lockedUntil to null on every demo account', async () => {
    const { db, rows } = makeDb([...DEMO_ROWS, BYSTANDER]);

    const summary = await unlockDemoAccounts(db as never);

    expect(summary.updated).toBe(6);
    for (const email of DEMO_ACCOUNT_EMAILS) {
      const row = rows.find((r) => r.email === email);
      expect(row).toBeDefined();
      expect(row!.failedLoginAttempts).toBe(0);
      expect(row!.lockedUntil).toBeNull();
    }
  });

  it('reports the before state honestly, including which accounts were actually locked', async () => {
    const { db } = makeDb([...DEMO_ROWS, BYSTANDER]);

    const summary = await unlockDemoAccounts(db as never);

    const lockedBefore = summary.before.filter((s) => s.wasLocked).map((s) => s.email).sort();
    expect(lockedBefore).toEqual(
      ['company@sakn-demo.sa', 'seeker@sakn-demo.sa', 'technician2@sakn-demo.sa'].sort(),
    );
    expect(summary.after.every((s) => !s.wasLocked && s.failedLoginAttempts === 0)).toBe(true);
  });

  it('is idempotent - a rerun on already-clean accounts changes nothing', async () => {
    const clean = DEMO_ROWS.map((r) => ({ ...r, failedLoginAttempts: 0, lockedUntil: null }));
    const { db, rows } = makeDb([...clean, BYSTANDER]);

    await unlockDemoAccounts(db as never);
    const summary = await unlockDemoAccounts(db as never);

    expect(summary.before.every((s) => s.failedLoginAttempts === 0 && s.lockedUntil === null)).toBe(true);
    expect(rows.every((r) => r.email === BYSTANDER.email || r.failedLoginAttempts === 0)).toBe(true);
  });

  it('reports a listed account that does not exist rather than creating it', async () => {
    const { db, otherWrites } = makeDb([DEMO_ROWS[0], BYSTANDER]);

    const summary = await unlockDemoAccounts(db as never);

    expect(summary.missing.sort()).toEqual(
      DEMO_ACCOUNT_EMAILS.filter((e) => e !== DEMO_ROWS[0].email).slice().sort(),
    );
    expect(otherWrites).toEqual([]);
  });
});

describe('unlock-demo-accounts - touches nothing else', () => {
  it('writes ONLY failedLoginAttempts and lockedUntil - never a password, role or status', async () => {
    const { db, updateManyCalls } = makeDb([...DEMO_ROWS, BYSTANDER]);

    await unlockDemoAccounts(db as never);

    expect(updateManyCalls).toHaveLength(1);
    expect(Object.keys(updateManyCalls[0].data as object).sort()).toEqual([
      'failedLoginAttempts',
      'lockedUntil',
    ]);
    expect(updateManyCalls[0].data).toEqual({ failedLoginAttempts: 0, lockedUntil: null });
  });

  it('scopes the update to an exact email list - no domain wildcard, no company sweep', async () => {
    const { db, updateManyCalls } = makeDb([...DEMO_ROWS, BYSTANDER]);

    await unlockDemoAccounts(db as never);

    expect(updateManyCalls[0].where).toEqual({ email: { in: [...DEMO_ACCOUNT_EMAILS] } });
    expect(DEMO_ACCOUNT_EMAILS).toHaveLength(6);
  });

  it('leaves a locked NON-demo account exactly as it was', async () => {
    const { db, rows } = makeDb([...DEMO_ROWS, BYSTANDER]);

    await unlockDemoAccounts(db as never);

    const bystander = rows.find((r) => r.email === BYSTANDER.email)!;
    expect(bystander).toEqual(BYSTANDER);
    expect(bystander.failedLoginAttempts).toBe(5);
    expect(bystander.lockedUntil).toEqual(BYSTANDER.lockedUntil);
    expect(bystander.passwordHash).toBe('$2b$10$unchanged');
  });

  it('makes no other kind of user write, and no write to any other table', async () => {
    const { db, otherWrites } = makeDb([...DEMO_ROWS, BYSTANDER]);

    await unlockDemoAccounts(db as never);

    // The double exposes ONLY `user`. Reaching for `db.report`, `db.project`,
    // `db.ownership` … would throw here, which is the point.
    expect(otherWrites).toEqual([]);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.user.upsert).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
    expect(db.user.deleteMany).not.toHaveBeenCalled();
  });
});
