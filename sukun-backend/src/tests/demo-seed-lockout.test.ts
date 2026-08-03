import bcrypt from 'bcrypt';
import { seedDemoTenant } from '../scripts/demo-seed';

// ---------------------------------------------------------------------------
// Task 10 closeout — re-seeding the demo tenant must genuinely restore access.
//
// The bug this pins down: `login` checks `lockedUntil` BEFORE it compares the
// password (auth/auth.service.ts), so an account locked by SEC-007 rejects even
// a correct password — with `ACCOUNT_LOCKED`. The seed cleared neither counter,
// so a verification sweep that made a few wrong attempts left the demo unusable
// and re-seeding looked like it had failed.
//
// PRODUCTION-SAFETY CHANGE (2026-07-31). The seed used to ALSO rewrite
// `passwordHash` on every run. That is fine when it owns a throwaway tenant and
// unacceptable when it is run against production to top up the catalogue: it
// silently invalidates logins people are already using. These tests now pin the
// opposite guarantee — an existing account keeps its hash, a password is
// written only when an account is CREATED — while still pinning the lockout
// clear, which restores access to the credential the account already had rather
// than granting a new one.
//
// A Prisma double is used deliberately: this asserts what the seed WRITES, and
// must not depend on a live database or on the demo tenant's current state.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;

function makeDb(existingUser: Row | null = null) {
  const userUpdates: Array<{ where: Row; data: Row }> = [];
  const userCreates: Array<{ data: Row }> = [];

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
      // `existingUser` decides which branch the seed takes: a row means the
      // account is already there (update path), null means it must be created.
      findUnique: jest.fn().mockImplementation(async () => existingUser),
      update: jest.fn().mockImplementation(async (args: { where: Row; data: Row }) => {
        userUpdates.push(args);
        return { id: `user-${userUpdates.length}`, ...args.data };
      }),
      create: jest.fn().mockImplementation(async (args: { data: Row }) => {
        userCreates.push(args);
        return { id: `user-${userCreates.length}`, ...args.data };
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

  return { db, userUpdates, userCreates };
}

describe('demo seed — a rerun restores access without touching credentials', () => {
  it('NEVER rewrites the password of an account that already exists', async () => {
    const { db, userUpdates } = makeDb({ id: 'u1', email: 'company@sakn-demo.sa', passwordHash: 'existing-hash' });

    await seedDemoTenant('a-brand-new-password', db as never);

    expect(userUpdates.length).toBeGreaterThanOrEqual(5);
    for (const call of userUpdates) {
      // The whole point: the seed does not carry a password into the update.
      expect(call.data).not.toHaveProperty('passwordHash');
    }
  });

  it('still clears the SEC-007 lockout on every existing account', async () => {
    const { db, userUpdates } = makeDb({ id: 'u1', email: 'company@sakn-demo.sa', passwordHash: 'existing-hash' });

    await seedDemoTenant('irrelevant-because-nothing-is-created', db as never);

    for (const call of userUpdates) {
      const data = call.data as { status?: string; failedLoginAttempts?: number; lockedUntil?: Date | null };
      expect(data.status).toBe('ACTIVE');
      // Restores access to the EXISTING credential; grants no new one.
      expect(data.failedLoginAttempts).toBe(0);
      expect(data.lockedUntil).toBeNull();
    }
  });

  it('sets the supplied password only on the CREATE path', async () => {
    const { db, userCreates } = makeDb(null);

    await seedDemoTenant('fresh-tenant-password', db as never);

    expect(userCreates.length).toBeGreaterThanOrEqual(5);
    for (const call of userCreates) {
      const data = call.data as { passwordHash: string; lockedUntil?: unknown; failedLoginAttempts?: unknown };
      await expect(bcrypt.compare('fresh-tenant-password', data.passwordHash)).resolves.toBe(true);
      // A brand-new row must not carry a lock in from anywhere; the schema
      // defaults are 0 / null and the seed does not override them.
      expect(data.lockedUntil).toBeUndefined();
      expect(data.failedLoginAttempts).toBeUndefined();
    }
  });

  it('tops up an existing tenant with NO password at all', async () => {
    // The production case: every account already exists, so nothing needs a
    // password and the workflow does not have to hold one.
    const { db, userUpdates, userCreates } = makeDb({ id: 'u1', email: 'company@sakn-demo.sa', passwordHash: 'existing-hash' });

    await expect(seedDemoTenant(null, db as never)).resolves.toBeDefined();

    expect(userCreates).toHaveLength(0);
    expect(userUpdates.length).toBeGreaterThanOrEqual(5);
  });

  it('refuses to invent a credential when an account must be created', async () => {
    const { db } = makeDb(null);

    await expect(seedDemoTenant(null, db as never)).rejects.toThrow(/DEMO_SEED_PASSWORD/);
  });
});
