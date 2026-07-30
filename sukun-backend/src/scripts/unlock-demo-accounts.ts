import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';
import { DEMO_ACCOUNT_EMAILS } from './demo-seed';

// ---------------------------------------------------------------------------
// Clear the SEC-007 lockout state on the demo tenant's six accounts - and
// nothing else, anywhere.
//
// Why this exists separately from `demo-seed.ts`: re-running the seed also
// RESETS THE PASSWORD to whatever `DEMO_SEED_PASSWORD` says, and re-asserts
// names, roles, company links, the project, units, ownership, warranties,
// reports and visits. When the only problem is "these accounts are locked
// out", all of that is collateral. This script writes exactly two columns:
//
//     failedLoginAttempts -> 0
//     lockedUntil         -> null
//
// It does not read, hash, set, or accept a password. It does not touch
// `status`, `role`, `companyId`, or any row in any other table. The account
// set is imported from the seed rather than re-typed, so the two can never
// disagree about which accounts are "the demo accounts".
//
// Safety properties:
//   * the WHERE clause is an exact `email IN (...)` over that fixed list -
//     there is no pattern match, no domain wildcard, and no "everything in the
//     demo company";
//   * an account that is already clean is written anyway (idempotent) but ends
//     in the same state;
//   * an email in the list with no row is reported as missing, never created.
//
// Run:  npm run demo:unlock
// ---------------------------------------------------------------------------

export interface DemoAccountLockState {
  email: string;
  found: boolean;
  failedLoginAttempts: number | null;
  lockedUntil: Date | null;
  /** True when this account would have been refused with ACCOUNT_LOCKED. */
  wasLocked: boolean;
}

export interface UnlockSummary {
  before: DemoAccountLockState[];
  after: DemoAccountLockState[];
  /** Rows actually written by the scoped update. */
  updated: number;
  /** Listed emails with no matching user row. */
  missing: string[];
}

const LOCK_SELECT = {
  email: true,
  failedLoginAttempts: true,
  lockedUntil: true,
} as const;

async function readLockState(
  db: PrismaClient,
  emails: readonly string[],
  now: Date,
): Promise<DemoAccountLockState[]> {
  const rows = (await db.user.findMany({
    where: { email: { in: [...emails] } },
    select: LOCK_SELECT,
  })) as Array<{ email: string; failedLoginAttempts: number; lockedUntil: Date | null }>;

  const byEmail = new Map(rows.map((r) => [r.email, r]));

  return emails.map((email) => {
    const row = byEmail.get(email);
    if (!row) {
      return { email, found: false, failedLoginAttempts: null, lockedUntil: null, wasLocked: false };
    }
    return {
      email,
      found: true,
      failedLoginAttempts: row.failedLoginAttempts,
      lockedUntil: row.lockedUntil,
      // `login` compares `lockedUntil > new Date()`; a stale timestamp in the
      // past is residue, not an active lock.
      wasLocked: !!row.lockedUntil && row.lockedUntil > now,
    };
  });
}

export async function unlockDemoAccounts(
  db: PrismaClient = prisma,
  emails: readonly string[] = DEMO_ACCOUNT_EMAILS,
): Promise<UnlockSummary> {
  const now = new Date();
  const before = await readLockState(db, emails, now);

  const result = await db.user.updateMany({
    where: { email: { in: [...emails] } },
    // EXACTLY these two columns. Adding anything here - a password hash, a
    // status, a role - would make this script something other than what it
    // says it is.
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  const after = await readLockState(db, emails, new Date());

  return {
    before,
    after,
    updated: result.count,
    missing: before.filter((s) => !s.found).map((s) => s.email),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function describe(state: DemoAccountLockState): string {
  if (!state.found) return 'NO SUCH ACCOUNT';
  const lock = state.lockedUntil ? state.lockedUntil.toISOString() : 'null';
  return `failedLoginAttempts=${state.failedLoginAttempts} lockedUntil=${lock}${
    state.wasLocked ? '  <-- LOCKED' : ''
  }`;
}

async function main() {
  const summary = await unlockDemoAccounts();

  console.log('Demo account lockout state - before:');
  for (const state of summary.before) console.log(`  ${state.email.padEnd(28)} ${describe(state)}`);

  console.log(`\nRows updated: ${summary.updated} (failedLoginAttempts=0, lockedUntil=null)`);
  if (summary.missing.length > 0) {
    console.log(`Not present in this database (nothing was created): ${summary.missing.join(', ')}`);
  }

  console.log('\nDemo account lockout state - after:');
  for (const state of summary.after) console.log(`  ${state.email.padEnd(28)} ${describe(state)}`);

  const stillLocked = summary.after.filter((s) => s.found && (s.wasLocked || s.failedLoginAttempts !== 0));
  if (stillLocked.length > 0) {
    throw new Error(`Still locked after the update: ${stillLocked.map((s) => s.email).join(', ')}`);
  }
  console.log('\nNo password, role, ownership or demo record was read or written by this script.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\nUnlock failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
