/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { normalizeDemoTenant } from './demo-seed';

// ---------------------------------------------------------------------------
// Run the demo tenant's consistency pass on its own.
//
// `demo-seed.ts` runs the same pass, but it also RESETS EVERY DEMO PASSWORD to
// `DEMO_SEED_PASSWORD` and re-asserts the whole fixture set. When the only
// thing that needs correcting is drifted demo CONTENT — an occupancy flag with
// no ownership behind it, a mixed-language report text, a report on the wrong
// trade — none of that is wanted, and requiring a password to fix a typo is
// how demo credentials end up in a shell history.
//
// This entry point takes no password, reads no password, and writes no
// credential field. It resolves the demo project and the two demo technicians
// by their own stable keys and calls `normalizeDemoTenant`, which is scoped to
// that project and idempotent.
//
// Run:  npm run demo:normalize
// ---------------------------------------------------------------------------

const LABEL = env.demo.tenantLabel;
const DOMAIN = env.demo.emailDomain;
const PROJECT_CODE = `${LABEL}-P1`;

export async function resolveScope(db: PrismaClient = prisma) {
  const project = await db.project.findUnique({ where: { code: PROJECT_CODE }, select: { id: true } });
  if (!project) throw new Error(`No demo project with code ${PROJECT_CODE} in this database.`);

  const units = await db.unit.findMany({
    where: { building: { projectId: project.id } },
    select: { id: true },
  });

  const general = await db.technician.findFirst({
    where: { user: { email: `technician@${DOMAIN}` } },
    select: { id: true },
  });
  const electrical = await db.technician.findFirst({
    where: { user: { email: `technician2@${DOMAIN}` } },
    select: { id: true },
  });
  if (!general || !electrical) throw new Error('Both demo technician records must exist.');

  return {
    projectId: project.id,
    unitIds: units.map((u) => u.id),
    generalTechnicianId: general.id,
    electricalTechnicianId: electrical.id,
  };
}

async function main() {
  const scope = await resolveScope();
  console.log(`Demo project ${PROJECT_CODE} (${scope.projectId}) — ${scope.unitIds.length} units.`);

  const first = await normalizeDemoTenant(prisma, scope);
  console.log('Corrections applied:');
  console.log(`  occupancy flags reconciled with ownership: ${first.occupancyFixed}`);
  console.log(`  reports with mixed-language text corrected: ${first.textFixed}`);
  console.log(`  reports re-pointed to the right trade:      ${first.reassigned}`);

  // Idempotence is a property this script claims, so it is checked rather than
  // asserted: a second pass must find nothing left to do.
  const second = await normalizeDemoTenant(prisma, scope);
  const clean = second.occupancyFixed === 0 && second.textFixed === 0 && second.reassigned === 0;
  console.log(`\nSecond pass changed nothing: ${clean ? 'yes' : 'NO — not idempotent'}`);
  if (!clean) {
    throw new Error(
      `Second pass still changed rows (${JSON.stringify(second)}) — the pass is not idempotent.`,
    );
  }
  console.log('No password, credential or non-demo record was read or written.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error(`\nNormalize failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
