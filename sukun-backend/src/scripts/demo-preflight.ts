/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';

// ---------------------------------------------------------------------------
// Tenant preflight for `demo:seed`.
//
// The seed finds its company by `<LABEL>-CR` and its projects by `<LABEL>-Pn`.
// If `DEMO_TENANT_LABEL` does not match the label the tenant was ORIGINALLY
// seeded with, nothing errors — the seed simply creates a SECOND demo company
// with its own six projects, and the catalogue that was supposed to be topped
// up sits in a tenant nobody is looking at. That failure is silent and, once
// it has happened, awkward to unpick.
//
// So the label is not trusted. This resolves it from the DATABASE and prints
// the answer on stdout for the caller to export. Nothing is written here; this
// script is read-only.
//
// Resolution order:
//   1. The configured label, if a company with `<LABEL>-CR` actually exists.
//   2. Otherwise, if exactly ONE demo-shaped company exists (`%-CR` with at
//      least one `%-P1` project), its label — this is the mismatch case, and
//      resolving it is the "fix it automatically" the operator asked for.
//   3. Otherwise the configured label unchanged, which is correct for a first
//      run against an empty database.
//
// It fails loudly only when the choice is genuinely ambiguous: several demo
// tenants already exist and none matches the configured label. Guessing there
// could write into the wrong one.
// ---------------------------------------------------------------------------

const prisma = new PrismaClient();

function labelFromCr(cr: string): string {
  return cr.replace(/-CR$/, '');
}

async function main(): Promise<void> {
  const configured = env.demo.tenantLabel;

  const exact = await prisma.company.findFirst({
    where: { commercialRegistration: `${configured}-CR` },
    select: { id: true, name: true },
  });

  if (exact) {
    const projects = await prisma.project.count({
      where: { companyId: exact.id, code: { startsWith: `${configured}-` } },
    });
    console.error(`preflight: tenant "${configured}" exists (${projects} project(s)). Using it.`);
    console.log(configured);
    return;
  }

  // No company under the configured label. Is there exactly one elsewhere?
  const candidates = await prisma.company.findMany({
    where: { commercialRegistration: { endsWith: '-CR' } },
    select: { id: true, commercialRegistration: true },
  });

  const demoTenants: Array<{ label: string; projects: number }> = [];
  for (const candidate of candidates) {
    const label = labelFromCr(candidate.commercialRegistration);
    const seedProject = await prisma.project.count({
      where: { companyId: candidate.id, code: { startsWith: `${label}-P` } },
    });
    if (seedProject > 0) demoTenants.push({ label, projects: seedProject });
  }

  if (demoTenants.length === 1) {
    const found = demoTenants[0];
    console.error(
      `preflight: MISMATCH — DEMO_TENANT_LABEL is "${configured}" but the seeded tenant is ` +
        `"${found.label}" (${found.projects} project(s)). Using "${found.label}" so the ` +
        'catalogue is added to the EXISTING company rather than a new one.',
    );
    console.log(found.label);
    return;
  }

  if (demoTenants.length > 1) {
    const labels = demoTenants.map((t) => `${t.label} (${t.projects})`).join(', ');
    console.error(
      `preflight: AMBIGUOUS — no company matches DEMO_TENANT_LABEL "${configured}", and ` +
        `several demo tenants already exist: ${labels}. Refusing to guess which one to top ` +
        'up. Set DEMO_TENANT_LABEL explicitly in the Vercel backend project and re-run.',
    );
    process.exitCode = 1;
    return;
  }

  console.error(
    `preflight: no existing demo tenant found. Treating this as a first run and creating "${configured}".`,
  );
  console.log(configured);
}

main()
  .catch((error) => {
    // Never print the error verbatim: Prisma's connection errors quote the
    // datasource URL back at you, password included. Redact anything shaped
    // like one before it reaches a log the whole org can read.
    const raw = error instanceof Error ? error.message : 'unknown error';
    const safe = raw.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"']+/gi, '[redacted-url]');
    console.error(`preflight: failed — ${safe}`);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
