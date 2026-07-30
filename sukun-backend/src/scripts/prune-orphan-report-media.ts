/**
 * Prunes ORPHANED staged report-media objects from the private bucket.
 *
 * Why this exists (Task 3, Step 9): `report.service.ts` never moves or copies a
 * staged object — `reports/staging/{userId}/{uuid}.{ext}` IS the eventual
 * `ReportMedia.storageKey`. The service now releases staged objects
 * best-effort when an analysis or a creation fails, but that cannot recover
 * objects abandoned by a crashed process, a closed tab, or the failures that
 * happened before that cleanup existed. This sweeper is for those.
 *
 * ── Safety, in the order it is enforced ────────────────────────────────────
 *
 *  1. **DRY RUN BY DEFAULT.** Nothing is deleted without `APPLY=1`.
 *  2. **Bucket + prefix scoped.** Only the PRIVATE bucket, and only keys under
 *     `reports/staging/`. Nothing under `reports/{reportId}/before|after/` is
 *     even listed.
 *  3. **Ownership provable.** The `{userId}` segment must resolve to a real
 *     `User`. A key whose owner cannot be resolved is REPORTED, never deleted.
 *  4. **Database reference wins, always.** Every `ReportMedia.storageKey` is
 *     loaded up front, and a referenced key is skipped unconditionally. This is
 *     the rule that makes a live report's photos untouchable.
 *  5. **Age floor.** An object younger than `MIN_AGE_HOURS` (default 24) is
 *     never eligible — a staged photo mid-journey must never be pulled out from
 *     under a resident who is still filling in the form.
 *  6. **Explicit ceiling.** `MAX_DELETIONS` caps a single run, and the run
 *     reports what it skipped rather than silently truncating.
 *
 * The Supabase service key is read from the environment and NEVER printed. No
 * key, URL or object name is logged beyond what the operator needs to audit the
 * run, and no image bytes are read at all.
 *
 *   npx ts-node --transpile-only src/scripts/prune-orphan-report-media.ts
 *   APPLY=1 npx ts-node --transpile-only src/scripts/prune-orphan-report-media.ts
 */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { isStorageConfigured, privateMediaTarget } from '../shared/supabaseStorage';
import { reportMediaStorage } from '../reports/report-media-storage';

const prisma = new PrismaClient();

const APPLY = process.env.APPLY === '1';
const MIN_AGE_HOURS = Number(process.env.MIN_AGE_HOURS ?? 24);
const MAX_DELETIONS = Number(process.env.MAX_DELETIONS ?? 200);
const STAGING_ROOT = 'reports/staging/';

interface StorageObject {
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface OrphanCandidate {
  key: string;
  userId: string;
  ageHours: number;
}

export interface SweepDecision {
  eligible: OrphanCandidate[];
  skippedReferenced: string[];
  skippedTooNew: string[];
  skippedUnknownOwner: string[];
}

/**
 * The pure decision function, exported so it can be tested without a bucket or
 * a database. Everything the sweeper is allowed to delete is decided here.
 */
export function decideSweep(input: {
  objects: { key: string; createdAt: Date }[];
  referencedKeys: Set<string>;
  knownUserIds: Set<string>;
  now: Date;
  minAgeHours: number;
}): SweepDecision {
  const out: SweepDecision = {
    eligible: [],
    skippedReferenced: [],
    skippedTooNew: [],
    skippedUnknownOwner: [],
  };

  for (const obj of input.objects) {
    // Rule 4 — a referenced object is never a candidate, whatever its age.
    if (input.referencedKeys.has(obj.key)) {
      out.skippedReferenced.push(obj.key);
      continue;
    }
    // Rule 2 — prefix scope.
    if (!obj.key.startsWith(STAGING_ROOT)) {
      out.skippedUnknownOwner.push(obj.key);
      continue;
    }
    // Rule 3 — ownership must be provable.
    const userId = obj.key.slice(STAGING_ROOT.length).split('/')[0] ?? '';
    if (!userId || !input.knownUserIds.has(userId)) {
      out.skippedUnknownOwner.push(obj.key);
      continue;
    }
    // Rule 5 — age floor.
    const ageHours = (input.now.getTime() - obj.createdAt.getTime()) / 3_600_000;
    if (!Number.isFinite(ageHours) || ageHours < input.minAgeHours) {
      out.skippedTooNew.push(obj.key);
      continue;
    }
    out.eligible.push({ key: obj.key, userId, ageHours: Math.round(ageHours) });
  }

  return out;
}

async function listStagedObjects(): Promise<{ key: string; createdAt: Date }[]> {
  const target = privateMediaTarget();
  const owners = await prisma.user.findMany({ select: { id: true } });
  const found: { key: string; createdAt: Date }[] = [];

  // Listed per known user, so the sweeper can never wander outside
  // `reports/staging/{a real user id}/`.
  for (const owner of owners) {
    const prefix = `${STAGING_ROOT}${owner.id}/`;
    const res = await fetch(`${env.supabaseStorage.url}/storage/v1/object/list/${target.bucket}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.supabaseStorage.serviceKey}`,
        apikey: env.supabaseStorage.serviceKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'created_at', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`storage list failed with ${res.status}`);
    const rows = (await res.json()) as StorageObject[];
    for (const row of rows) {
      const stamp = Date.parse(row.created_at ?? row.updated_at ?? '');
      found.push({ key: `${prefix}${row.name}`, createdAt: new Date(Number.isFinite(stamp) ? stamp : Date.now()) });
    }
  }
  return found;
}

async function main() {
  if (!isStorageConfigured(privateMediaTarget())) {
    throw new Error('Private media storage is not configured in this environment.');
  }

  const [objects, media, users] = await Promise.all([
    listStagedObjects(),
    prisma.reportMedia.findMany({ select: { storageKey: true } }),
    prisma.user.findMany({ select: { id: true } }),
  ]);

  const decision = decideSweep({
    objects,
    referencedKeys: new Set(media.map((m) => m.storageKey)),
    knownUserIds: new Set(users.map((u) => u.id)),
    now: new Date(),
    minAgeHours: MIN_AGE_HOURS,
  });

  console.log(`staged objects scanned      : ${objects.length}`);
  console.log(`referenced by a report      : ${decision.skippedReferenced.length}  (never eligible)`);
  console.log(`younger than ${MIN_AGE_HOURS}h            : ${decision.skippedTooNew.length}  (never eligible)`);
  console.log(`owner not resolvable        : ${decision.skippedUnknownOwner.length}  (reported, never deleted)`);
  console.log(`ELIGIBLE ORPHANS            : ${decision.eligible.length}`);
  for (const c of decision.eligible.slice(0, MAX_DELETIONS)) {
    console.log(`  ${c.key}  (${c.ageHours}h old)`);
  }
  if (decision.eligible.length > MAX_DELETIONS) {
    console.log(`  … ${decision.eligible.length - MAX_DELETIONS} more NOT shown and NOT deleted this run (MAX_DELETIONS=${MAX_DELETIONS})`);
  }

  if (!APPLY) {
    console.log('\nDRY RUN — nothing was deleted. Re-run with APPLY=1 to delete the objects listed above.');
    return;
  }

  let removed = 0;
  for (const c of decision.eligible.slice(0, MAX_DELETIONS)) {
    if (await reportMediaStorage.remove(c.key)) removed += 1;
  }
  console.log(`\ndeleted ${removed} of ${Math.min(decision.eligible.length, MAX_DELETIONS)} eligible orphan(s).`);
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e instanceof Error ? e.message : String(e));
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
