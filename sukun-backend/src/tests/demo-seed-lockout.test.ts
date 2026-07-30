import bcrypt from 'bcrypt';
import { seedDemoTenant } from '../scripts/demo-seed';

// ---------------------------------------------------------------------------
// Task 10 closeout — re-seeding the demo tenant must genuinely restore access.
//
// The bug this pins down: `login` checks `lockedUntil` BEFORE it compares the
// password (auth/auth.service.ts), so an account locked by SEC-007 rejects even
// the brand-new password the operator just set — with `ACCOUNT_LOCKED`. The
// upsert reset `passwordHash` and `status` but left `failedLoginAttempts` and
// `lockedUntil` untouched, so a verification sweep that made a few wrong
// attempts left the demo unusable and re-seeding looked like it had failed.
//
// A Prisma double is used deliberately: this asserts what the seed WRITES, and
// must not depend on a live database or on the demo tenant's current state.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeDb() {
  const userUpserts: Array<{ where: Row; update: Row; create: Row }> = [];

  const table = (rows: Row[] = []) => ({
    findUnique: jest.fn().mockResolvedValue(rows[0] ?? null),
    findFirst: jest.fn().mockResolvedValue(rows[0] ?? null),
    findMany: jest.fn().mockResolvedValue(rows),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation(async ({ data }: { data: Row }) => ({ id: 'generated-id', ...data })),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockImplementation(async ({ data }: { data: Row }) => ({ id: 'generated-id', ...data })),
    // The seed's closing consistency pass (`normalizeDemoTenant`) reconciles
    // unit occupancy with ownership through `updateMany`.
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockImplementation(async ({ data }: { data?: Row }) => ({ id: 'generated-id', ...(data ?? {}) })),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    groupBy: jest.fn().mockResolvedValue([]),
  });

  const db = {
    company: { ...table(), upsert: jest.fn().mockResolvedValue({ id: 'company-1', name: 'demo' }) },
    user: {
      ...table(),
      upsert: jest.fn().mockImplementation(async (args: { where: Row; update: Row; create: Row }) => {
        userUpserts.push(args);
        return { id: `user-${userUpserts.length}`, ...args.create };
      }),
    },
    contractorOrganization: table(),
    project: {
      ...table(),
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'project-1', code: 'SAKN-DEMO-P1' }),
    },
    projectMedia: table(),
    building: { ...table(), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'b1', number: 'A' }) },
    unit: { ...table(), findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'u1', status: 'OCCUPIED' }) },
    projectManager: table(),
    technician: { ...table(), upsert: jest.fn().mockResolvedValue({ id: 'tech-1' }) },
    ownership: { ...table(), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'own-1' }) },
    homeownerActivation: table(),
    warranty: { ...table(), upsert: jest.fn().mockResolvedValue({ id: 'w1', startDate: new Date() }), findUnique: jest.fn().mockResolvedValue(null) },
    savedProject: table(),
    searchJourney: { ...table(), findFirst: jest.fn().mockResolvedValue({ id: 'j1' }) },
    // count > 0 so the seed's "visits already present" branch is taken - this
    // test is about the user upsert, not the visit fixtures.
    visit: { ...table(), count: jest.fn().mockResolvedValue(2) },
    report: { ...table(), count: jest.fn().mockResolvedValue(1) },
    reportRepair: table(),
    reportReview: table(),
    reportTimelineEvent: table(),
  };

  return { db, userUpserts };
}

describe('demo seed — a rerun restores access, not just the password', () => {
  it('resets the password AND clears the lockout state on every existing account', async () => {
    const { db, userUpserts } = makeDb();

    await seedDemoTenant('a-new-strong-password', db as never);

    expect(userUpserts.length).toBeGreaterThanOrEqual(5);

    for (const call of userUpserts) {
      const update = call.update as {
        passwordHash?: string;
        status?: string;
        failedLoginAttempts?: number;
        lockedUntil?: Date | null;
      };

      // The password is re-hashed to the value supplied this run…
      expect(typeof update.passwordHash).toBe('string');
      await expect(bcrypt.compare('a-new-strong-password', update.passwordHash as string)).resolves.toBe(true);
      expect(update.status).toBe('ACTIVE');

      // …and, crucially, the SEC-007 counters are cleared. Without these two,
      // `login` rejects the new password with ACCOUNT_LOCKED before it ever
      // compares it.
      expect(update.failedLoginAttempts).toBe(0);
      expect(update.lockedUntil).toBeNull();
    }
  });

  it('supersedes the previous password rather than leaving both valid', async () => {
    const { db, userUpserts } = makeDb();

    await seedDemoTenant('second-run-password', db as never);

    const hash = (userUpserts[0].update as { passwordHash: string }).passwordHash;
    await expect(bcrypt.compare('second-run-password', hash)).resolves.toBe(true);
    await expect(bcrypt.compare('a-new-strong-password', hash)).resolves.toBe(false);
  });

  it('clears lockout on the CREATE path too, by never setting it', async () => {
    const { db, userUpserts } = makeDb();

    await seedDemoTenant('fresh-tenant-password', db as never);

    for (const call of userUpserts) {
      const create = call.create as { lockedUntil?: unknown; failedLoginAttempts?: unknown };
      // A brand-new row must not carry a lock in from anywhere; the schema
      // defaults are 0 / null and the seed does not override them.
      expect(create.lockedUntil).toBeUndefined();
      expect(create.failedLoginAttempts).toBeUndefined();
    }
  });
});
