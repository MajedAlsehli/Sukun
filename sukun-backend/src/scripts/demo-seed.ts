/* eslint-disable no-console */
import bcrypt from 'bcrypt';
import readline from 'readline';
import { Writable } from 'stream';
import {
  CompanyStatus,
  OwnershipStatus,
  Prisma,
  PrismaClient,
  ProjectManagerStatus,
  ProjectReadiness,
  ProjectStatus,
  ReportActorType,
  ReportCategory,
  ReportMediaStage,
  ReportPriority,
  ReportPrioritySource,
  ReportRepairStatus,
  ReportRoutingState,
  ReportStatus,
  ReportTimelineEventType,
  SearchJourneyStatus,
  TechnicianStatus,
  UnitStatus,
  UserRole,
  VisitStatus,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { evaluateReportWarranty } from '../reports/report-warranty';
import {
  computeSlaStartDueAt,
  REPORT_SLA_RULES_VERSION,
  SPECIALTY_ELECTRICAL,
  SPECIALTY_GENERAL,
  SPECIALTY_PLUMBING,
} from '../reports/report.types';

// ---------------------------------------------------------------------------
// Task 10 - the investor-demo tenant.
//
// WHAT THIS IS: an idempotent seed that creates ONE clearly labelled demo
// company and everything a live walkthrough needs - five real Supabase-backed
// identities (company, project manager, technician, active homeowner, home
// seeker), a polished active project, occupied and vacant units, real
// ownership, warranties, canonical reports across the useful statuses with
// real timelines, a completed repair with a homeowner approval and review,
// visits, and a saved project.
//
// WHAT IT IS NOT:
//   * It is NOT run at application startup and NOT run by a migration. It is
//     a deliberate, manual, one-off command (`npm run demo:seed`).
//   * It NEVER contains a password. The password comes from
//     DEMO_SEED_PASSWORD or an interactive hidden prompt, is never printed,
//     never logged, and never written to any file.
//   * It NEVER touches a row outside the demo tenant. Every write is scoped to
//     the company whose commercialRegistration is `<LABEL>-CR`, and `--reset`
//     deletes strictly within that scope. There is no unscoped delete anywhere
//     in this file.
//
// Reset semantics: `npm run demo:reset` removes the demo tenant entirely.
// `npm run demo:seed` on an existing tenant tops it up without duplicating -
// it re-asserts the identities and inventory, and skips the report dataset if
// one is already present.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Task 10 closeout - demo photography.
//
// These are neutral architectural renders served as STATIC PUBLIC ASSETS from
// the frontend (`app/public/demo/projects/`), stripped of all EXIF/GPS. They
// are marketing imagery for the demo project only.
//
// They are deliberately NOT used as report, repair or visit evidence: those are
// a homeowner's own property photos, they live in the PRIVATE Supabase bucket
// behind signed URLs (decisions.md K3), and dressing a stock render up as
// evidence of a real defect is exactly the fabrication this project refuses to
// do. `isPlaceholder: false` is honest here - these are genuine project
// photography for a genuine (demo) project, not a stand-in image.
// ---------------------------------------------------------------------------
const DEMO_ASSET_BASE_URL = (
  process.env.DEMO_ASSET_BASE_URL ?? 'https://sakn-app.vercel.app'
).replace(/\/+$/, '');

const DEMO_COVER_URL = `${DEMO_ASSET_BASE_URL}/demo/projects/demo-project-cover.webp`;
const DEMO_GALLERY_URLS = [2, 3, 4, 5, 6, 7, 8].map(
  (n) => `${DEMO_ASSET_BASE_URL}/demo/projects/demo-project-0${n}.webp`,
);

const LABEL = env.demo.tenantLabel;
const DOMAIN = env.demo.emailDomain;
const CR = `${LABEL}-CR`;
const PROJECT_CODE = `${LABEL}-P1`;

// ---------------------------------------------------------------------------
// CATALOGUE. `${LABEL}-P1` above is one project, and one project is what
// Discovery shows: a browse screen with a single card. These five are
// ADDITIONAL — P1 is never read, updated or referenced by the code that seeds
// them, so the polished walkthrough hanging off it (its homeowner, units,
// warranty and five reports) is untouched.
//
// Images are RELATIVE paths, deliberately unlike P1's absolute
// `DEMO_ASSET_BASE_URL` ones: these files ship inside the frontend's own
// `public/projects/` directory, so the URL resolves against whatever origin
// serves the app and cannot point at a host that lacks them. They are the
// developers' own ROSHN/NHC project photography.
//
// Price/area/bedrooms/bathrooms are UNIT columns in this schema, not project
// columns — the API derives `priceFrom` as min(Unit.price) and reads the
// bedroom/area facts off the detail response's units — so each project carries
// a small, real unit mix rather than a price written onto the project row.
// ---------------------------------------------------------------------------
interface CatalogueUnitSpec {
  /** Free text, exactly as the `Unit.type` column is defined. */
  type: string;
  area: number;
  bedrooms: number;
  bathrooms: number;
  parkingSpots: number;
  price: number;
  count: number;
  /**
   * AVAILABLE or RESERVED only. OCCUPIED is never set here: the tenant
   * normalizer's rule is that a unit is occupied only when a real Ownership
   * backs it, and these projects deliberately create none.
   */
  status: UnitStatus;
}

interface CatalogueProject {
  codeSuffix: string;
  name: string;
  city: string;
  district: string;
  description: string;
  readiness: ProjectReadiness;
  amenities: string[];
  coverImage: string;
  gallery: string[];
  building: { name: string; number: string; floors: number };
  units: CatalogueUnitSpec[];
}

const CATALOGUE: CatalogueProject[] = [
  {
    codeSuffix: 'P2',
    name: 'مشروع فلل الأصايل',
    city: 'الرياض',
    district: 'حي العارض',
    description:
      'فلل سكنية مستقلة بواجهات نجدية معاصرة ومداخل خاصة، ضمن حيّ متكامل الخدمات على مقربة من المدارس والمراكز التجارية شمال الرياض.',
    readiness: ProjectReadiness.READY,
    amenities: ['حديقة خاصة', 'مواقف مظللة', 'أمن ٢٤ ساعة', 'مسار مشاة'],
    coverImage: '/projects/p7-cover.jpg',
    gallery: ['/projects/p7-g1.jpg', '/projects/p7-g2.jpg', '/projects/p7-g3.jpg'],
    building: { name: 'المرحلة الأولى', number: 'A', floors: 2 },
    units: [
      { type: 'فيلا 5 غرف', area: 400, bedrooms: 5, bathrooms: 4, parkingSpots: 2, price: 2_650_000, count: 3, status: UnitStatus.AVAILABLE },
      { type: 'فيلا 6 غرف', area: 455, bedrooms: 6, bathrooms: 5, parkingSpots: 2, price: 2_950_000, count: 2, status: UnitStatus.RESERVED },
    ],
  },
  {
    codeSuffix: 'P3',
    name: 'مشروع وارفة',
    city: 'الرياض',
    district: 'حي وارفة',
    description:
      'مجتمع سكني متكامل بحدائق ومسارات ومرافق رياضية، ووحدات بواجهات حجرية هادئة تناسب العائلات الباحثة عن حيّ مخطط بالكامل.',
    readiness: ProjectReadiness.UNDER_CONSTRUCTION,
    amenities: ['حدائق مركزية', 'ملاعب رياضية', 'مسارات دراجات', 'مسجد الحي'],
    coverImage: '/projects/p10-cover.jpg',
    gallery: ['/projects/p10-g1.jpg', '/projects/p10-g2.jpg', '/projects/p10-g3.jpg'],
    building: { name: 'المرحلة الأولى', number: 'A', floors: 2 },
    units: [
      { type: 'فيلا 5 غرف', area: 380, bedrooms: 5, bathrooms: 4, parkingSpots: 2, price: 2_980_000, count: 3, status: UnitStatus.AVAILABLE },
      { type: 'فيلا 4 غرف', area: 330, bedrooms: 4, bathrooms: 4, parkingSpots: 2, price: 2_640_000, count: 2, status: UnitStatus.AVAILABLE },
    ],
  },
  {
    codeSuffix: 'P4',
    name: 'مشروع رحاب الربى',
    city: 'الرياض',
    district: 'حي الربى',
    description:
      'شقق سكنية ضمن مجتمع متكامل على امتداد الوادي، بإطلالات مفتوحة ومساحات خضراء ومسارات مشي تربط المباني بمرافق الحي.',
    readiness: ProjectReadiness.UNDER_CONSTRUCTION,
    amenities: ['إطلالة على الوادي', 'مواقف مغطاة', 'مساحات خضراء', 'أمن ٢٤ ساعة'],
    coverImage: '/projects/p9-cover.jpg',
    gallery: ['/projects/p9-g1.jpg', '/projects/p9-g2.jpg'],
    building: { name: 'المبنى أ', number: 'A', floors: 6 },
    units: [
      { type: 'شقة 3 غرف', area: 175, bedrooms: 3, bathrooms: 2, parkingSpots: 1, price: 1_250_000, count: 4, status: UnitStatus.AVAILABLE },
      { type: 'شقة غرفتين', area: 132, bedrooms: 2, bathrooms: 2, parkingSpots: 1, price: 980_000, count: 4, status: UnitStatus.RESERVED },
    ],
  },
  {
    codeSuffix: 'P5',
    name: 'مشروع عمائر الجوهرة',
    city: 'الرياض',
    district: 'حي الجوهرة',
    description:
      'شقق مسلّمة في عمائر سكنية بمواقف مخصّصة ومصاعد، الخيار الأنسب لأوّل تملّك ضمن حيّ قائم وخدمات جاهزة.',
    readiness: ProjectReadiness.READY,
    amenities: ['مصاعد', 'مواقف مخصّصة', 'قرب الخدمات'],
    coverImage: '/projects/p11-cover.jpg',
    gallery: [],
    building: { name: 'العمارة ١', number: 'A', floors: 8 },
    units: [
      { type: 'شقة 3 غرف', area: 140, bedrooms: 3, bathrooms: 2, parkingSpots: 1, price: 980_000, count: 5, status: UnitStatus.AVAILABLE },
      { type: 'شقة غرفتين', area: 112, bedrooms: 2, bathrooms: 1, parkingSpots: 1, price: 815_000, count: 3, status: UnitStatus.AVAILABLE },
    ],
  },
  {
    codeSuffix: 'P6',
    name: 'مشروع سنا الجبيلة',
    city: 'الرياض',
    district: 'حي الجبيلة',
    description:
      'تاون هاوس متلاصق بطابقين على ممرّات مشجّرة، يوازن بين مساحة العائلة وقرب الجيرة في حيّ هادئ غرب الرياض.',
    readiness: ProjectReadiness.READY,
    amenities: ['ممرات مشجّرة', 'موقف خاص', 'ساحة أطفال', 'أمن ٢٤ ساعة'],
    coverImage: '/projects/p8-cover.jpg',
    gallery: ['/projects/p8-g1.jpg', '/projects/p8-g2.jpg', '/projects/p8-g3.jpg'],
    building: { name: 'المرحلة الأولى', number: 'A', floors: 2 },
    units: [
      { type: 'تاون هاوس 4 غرف', area: 265, bedrooms: 4, bathrooms: 3, parkingSpots: 1, price: 1_750_000, count: 4, status: UnitStatus.AVAILABLE },
      { type: 'تاون هاوس 3 غرف', area: 225, bedrooms: 3, bathrooms: 3, parkingSpots: 1, price: 1_520_000, count: 2, status: UnitStatus.RESERVED },
    ],
  },
];

/** Every identity this tenant owns. `email` is the login. */
const IDENTITIES = {
  company: { email: `company@${DOMAIN}`, name: 'شركة سكن العقارية (عرض)', phone: '+966500000101' },
  pm: { email: `pm@${DOMAIN}`, name: 'مدير المشروع (عرض)', phone: '+966500000102' },
  technician: { email: `technician@${DOMAIN}`, name: 'فني الصيانة (عرض)', phone: '+966500000103' },
  technician2: { email: `technician2@${DOMAIN}`, name: 'فنية الكهرباء (عرض)', phone: '+966500000105' },
  homeowner: { email: `homeowner@${DOMAIN}`, name: 'مالك الوحدة (عرض)', phone: '+966500000104' },
  seeker: { email: `seeker@${DOMAIN}`, name: 'باحث عن سكن (عرض)', phone: '+966500000106' },
} as const;

const ALL_EMAILS = Object.values(IDENTITIES).map((i) => i.email);

/**
 * The demo tenant's six logins, exported so that anything which operates on
 * "the demo accounts" - the seed itself, and `unlock-demo-accounts.ts` - is
 * provably working from the SAME list. A script with its own hand-typed copy
 * could drift and touch an account nobody meant to touch.
 */
export const DEMO_ACCOUNT_EMAILS: readonly string[] = ALL_EMAILS;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 86_400_000);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000);
}

// ---------------------------------------------------------------------------
// Password input - env var, or an interactive prompt with echo suppressed.
// ---------------------------------------------------------------------------

const MIN_DEMO_PASSWORD_LENGTH = 12;

async function promptHidden(question: string): Promise<string> {
  const muted = new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });

  const rl = readline.createInterface({ input: process.stdin, output: muted, terminal: true });
  process.stdout.write(question);
  return new Promise((resolve) => {
    rl.question('', (answer) => {
      process.stdout.write('\n');
      rl.close();
      resolve(answer);
    });
  });
}

async function resolvePassword(): Promise<string | null> {
  const fromEnv = env.demo.password;
  if (fromEnv) {
    if (fromEnv.length < MIN_DEMO_PASSWORD_LENGTH) {
      throw new Error(
        `DEMO_SEED_PASSWORD must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters. (The value itself is never printed.)`,
      );
    }
    return fromEnv;
  }

  if (!process.stdin.isTTY) {
    /**
     * No password, no terminal — a CI top-up. This is NOT an error any more:
     * a password is needed only to CREATE an account, and on an existing
     * tenant there is nothing to create. If a run does turn out to need one,
     * `upsertUser` fails at that exact point with a message that names the
     * account, rather than this refusing up front on a run that never needed
     * a password at all.
     */
    return null;
  }

  const first = await promptHidden('Demo account password (input hidden): ');
  const second = await promptHidden('Confirm password: ');
  if (first !== second) throw new Error('The two entries did not match.');
  if (first.length < MIN_DEMO_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_DEMO_PASSWORD_LENGTH} characters.`);
  }
  return first;
}

// ---------------------------------------------------------------------------
// Reset - strictly scoped to the demo tenant. Never a bare deleteMany().
// ---------------------------------------------------------------------------

export async function resetDemoTenant(db: PrismaClient = prisma): Promise<Record<string, number>> {
  const company = await db.company.findUnique({ where: { commercialRegistration: CR } });
  const users = await db.user.findMany({ where: { email: { in: ALL_EMAILS } }, select: { id: true } });
  const userIds = users.map((u) => u.id);

  if (!company && userIds.length === 0) return {};

  const projects = company
    ? await db.project.findMany({ where: { companyId: company.id }, select: { id: true } })
    : [];
  const projectIds = projects.map((p) => p.id);

  const buildings = await db.building.findMany({
    where: { projectId: { in: projectIds } },
    select: { id: true },
  });
  const buildingIds = buildings.map((b) => b.id);

  const units = await db.unit.findMany({
    where: { buildingId: { in: buildingIds } },
    select: { id: true },
  });
  const unitIds = units.map((u) => u.id);

  const reports = await db.report.findMany({
    where: { OR: [{ projectId: { in: projectIds } }, { homeownerId: { in: userIds } }] },
    select: { id: true },
  });
  const reportIds = reports.map((r) => r.id);

  const visits = await db.visit.findMany({
    where: { OR: [{ projectId: { in: projectIds } }, { userId: { in: userIds } }] },
    select: { id: true },
  });
  const visitIds = visits.map((v) => v.id);

  const technicians = await db.technician.findMany({
    where: { OR: [{ projectId: { in: projectIds } }, { userId: { in: userIds } }] },
    select: { id: true },
  });
  const technicianIds = technicians.map((t) => t.id);

  const counts: Record<string, number> = {};
  const record = async (key: string, run: Promise<{ count: number }>) => {
    counts[key] = (await run).count;
  };

  // Deepest dependants first. Every filter below is an explicit id list built
  // from the demo company / demo users above - there is no unscoped delete.
  await record('reportReviews', db.reportReview.deleteMany({ where: { reportId: { in: reportIds } } }));
  await record('reportRepairs', db.reportRepair.deleteMany({ where: { reportId: { in: reportIds } } }));
  await record('reportTimelineEvents', db.reportTimelineEvent.deleteMany({ where: { reportId: { in: reportIds } } }));
  await record('reportMedia', db.reportMedia.deleteMany({ where: { reportId: { in: reportIds } } }));
  await record('reports', db.report.deleteMany({ where: { id: { in: reportIds } } }));
  await record('reportAnalyses', db.reportAnalysis.deleteMany({ where: { userId: { in: userIds } } }));

  await record('visitFeedback', db.visitFeedback.deleteMany({ where: { visitId: { in: visitIds } } }));
  await record('visitNotes', db.visitNote.deleteMany({ where: { visitId: { in: visitIds } } }));
  await record('visitIssues', db.visitIssue.deleteMany({ where: { visitId: { in: visitIds } } }));
  await record('visits', db.visit.deleteMany({ where: { id: { in: visitIds } } }));
  await record('searchJourneys', db.searchJourney.deleteMany({ where: { userId: { in: userIds } } }));
  await record('savedProjects', db.savedProject.deleteMany({ where: { userId: { in: userIds } } }));

  await record('warranties', db.warranty.deleteMany({ where: { unitId: { in: unitIds } } }));
  await record('homeownerActivations', db.homeownerActivation.deleteMany({ where: { unitId: { in: unitIds } } }));
  await record('ownerships', db.ownership.deleteMany({ where: { unitId: { in: unitIds } } }));

  await record('technicians', db.technician.deleteMany({ where: { id: { in: technicianIds } } }));
  await record('projectManagers', db.projectManager.deleteMany({ where: { userId: { in: userIds } } }));

  await record('units', db.unit.deleteMany({ where: { id: { in: unitIds } } }));
  await record('buildings', db.building.deleteMany({ where: { id: { in: buildingIds } } }));
  await record('projectMedia', db.projectMedia.deleteMany({ where: { projectId: { in: projectIds } } }));
  await record('projects', db.project.deleteMany({ where: { id: { in: projectIds } } }));
  if (company) {
    await record('contractorOrganizations', db.contractorOrganization.deleteMany({ where: { companyId: company.id } }));
  }

  await record('notifications', db.notification.deleteMany({ where: { userId: { in: userIds } } }));
  await record('auditLogs', db.auditLog.deleteMany({ where: { userId: { in: userIds } } }));
  await record('refreshTokens', db.refreshToken.deleteMany({ where: { userId: { in: userIds } } }));
  await record('passwordResetTokens', db.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }));
  await record('invitationTokens', db.invitationToken.deleteMany({ where: { userId: { in: userIds } } }));

  await record('users', db.user.deleteMany({ where: { id: { in: userIds } } }));
  if (company) {
    await record('companies', db.company.deleteMany({ where: { id: company.id } }));
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

interface SeedSummary {
  companyId: string;
  projectId: string;
  accounts: Array<{ role: string; email: string }>;
  units: number;
  reports: number;
  reportsAlreadyPresent: boolean;
  catalogueProjects: number;
  catalogueUnits: number;
}

export async function seedDemoTenant(
  password: string | null,
  db: PrismaClient = prisma,
): Promise<SeedSummary> {
  // Hashed once, and only when a password was actually supplied. `null` means
  // "top-up only": every account that already exists keeps the credential it
  // already has.
  const passwordHash = password === null ? null : await bcrypt.hash(password, 10);

  const company = await db.company.upsert({
    where: { commercialRegistration: CR },
    update: { name: `${IDENTITIES.company.name}`, status: CompanyStatus.ACTIVE },
    create: {
      name: IDENTITIES.company.name,
      commercialRegistration: CR,
      status: CompanyStatus.ACTIVE,
    },
  });

  async function upsertUser(
    identity: { email: string; name: string; phone: string },
    role: UserRole,
    companyId: string | null,
  ) {
    /**
     * PASSWORDS ARE NEVER REWRITTEN (production-safety change, 2026-07-31).
     *
     * This used to set `passwordHash` on the update branch, so every run
     * rotated the credentials of all six demo accounts. That is acceptable
     * when the seed OWNS a throwaway tenant; it is not acceptable when the
     * seed is run against production to top up its catalogue, because it
     * silently invalidates logins people are already using. An existing
     * account now keeps the hash it already has, and a password is written
     * only on the create path.
     *
     * The SEC-007 lockout counters are still cleared, and that is deliberately
     * NOT the same thing. `login` checks `lockedUntil` BEFORE it compares the
     * password (auth/auth.service.ts), so a locked account rejects even a
     * correct password with `ACCOUNT_LOCKED`. Clearing it restores access to
     * the credential the account already had — it never grants access to a
     * new one. An account sitting at 3 of 5 failed attempts is two typos from
     * a 15-minute lock in the middle of a demo.
     */
    const existing = await db.user.findUnique({ where: { email: identity.email } });

    if (existing) {
      return db.user.update({
        where: { email: identity.email },
        data: {
          name: identity.name,
          phone: identity.phone,
          role,
          companyId,
          status: 'ACTIVE',
          // Lockout state only. `passwordHash` is deliberately absent.
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
    }

    if (passwordHash === null) {
      throw new Error(
        `Cannot create the demo account ${identity.email}: no DEMO_SEED_PASSWORD was supplied. ` +
          'A password is required only when an account has to be CREATED. Set DEMO_SEED_PASSWORD ' +
          'and re-run. (The value itself is never printed.)',
      );
    }

    return db.user.create({
      data: {
        name: identity.name,
        email: identity.email,
        phone: identity.phone,
        role,
        companyId,
        passwordHash,
      },
    });
  }

  const companyUser = await upsertUser(IDENTITIES.company, UserRole.COMPANY, company.id);
  const pmUser = await upsertUser(IDENTITIES.pm, UserRole.PROJECT_MANAGER, null);
  const techUser = await upsertUser(IDENTITIES.technician, UserRole.TECHNICIAN, null);
  const tech2User = await upsertUser(IDENTITIES.technician2, UserRole.TECHNICIAN, null);
  const homeownerUser = await upsertUser(IDENTITIES.homeowner, UserRole.HOMEOWNER, null);
  const seekerUser = await upsertUser(IDENTITIES.seeker, UserRole.HOME_SEEKER, null);

  const contractor = await db.contractorOrganization.findFirst({
    where: { companyId: company.id, name: 'مقاولات سكن (عرض)' },
  });
  const contractorOrg =
    contractor ??
    (await db.contractorOrganization.create({
      data: {
        companyId: company.id,
        name: 'مقاولات سكن (عرض)',
        phone: '+966500000200',
        email: `contractor@${DOMAIN}`,
        isActive: true,
      },
    }));

  const existingProject = await db.project.findUnique({ where: { code: PROJECT_CODE } });
  const project = existingProject
    ? await db.project.update({
        where: { id: existingProject.id },
        data: {
          status: ProjectStatus.ACTIVE,
          isActive: true,
          readiness: ProjectReadiness.READY,
          amenities: ['مسبح', 'صالة رياضية', 'حديقة', 'مواقف مغطاة', 'أمن ٢٤ ساعة'],
          // Static public asset, not a Supabase object - `coverImageKey` stays
          // null so nothing tries to sign or delete it as stored media.
          coverImageUrl: DEMO_COVER_URL,
        },
      })
    : await db.project.create({
        data: {
          companyId: company.id,
          name: 'مشروع نسائم الرياض (عرض)',
          code: PROJECT_CODE,
          city: 'الرياض',
          district: 'حي النرجس',
          description:
            'مجمع سكني متكامل من ثلاثة مبانٍ في شمال الرياض، يضم شققاً بمساحات متنوعة ومرافق خدمية كاملة.',
          status: ProjectStatus.ACTIVE,
          isActive: true,
          readiness: ProjectReadiness.READY,
          amenities: ['مسبح', 'صالة رياضية', 'حديقة', 'مواقف مغطاة', 'أمن ٢٤ ساعة'],
          coverImageUrl: DEMO_COVER_URL,
          primaryContractorId: contractorOrg.id,
        },
      });

  // --- Project gallery -----------------------------------------------------
  // Replace-in-place rather than append: re-running the seed must not grow the
  // gallery. Scoped to THIS project id only - no other project's media is read
  // or written.
  await db.projectMedia.deleteMany({ where: { projectId: project.id } });
  await db.projectMedia.createMany({
    data: DEMO_GALLERY_URLS.map((url, index) => ({
      projectId: project.id,
      url,
      // Real photography for this project, not a stand-in - so the honest
      // "لا تتوفر صورة حقيقية للمشروع بعد" empty state correctly stops showing.
      isPlaceholder: false,
      sortOrder: index,
    })),
  });

  // --- Buildings and units -------------------------------------------------
  // Two buildings, 12 units, a realistic mix of occupied and vacant.
  const buildingSpecs = [
    { name: 'المبنى أ', number: 'A', floors: 3 },
    { name: 'المبنى ب', number: 'B', floors: 3 },
  ];

  const buildings = [];
  for (const spec of buildingSpecs) {
    const existing = await db.building.findUnique({
      where: { projectId_number: { projectId: project.id, number: spec.number } },
    });
    buildings.push(
      existing ??
        (await db.building.create({
          data: {
            projectId: project.id,
            name: spec.name,
            number: spec.number,
            floors: spec.floors,
            status: 'ACTIVE',
            isActive: true,
          },
        })),
    );
  }

  const unitPlan: Array<{
    buildingIndex: number;
    number: string;
    floor: number;
    type: string;
    area: number;
    bedrooms: number;
    bathrooms: number;
    parkingSpots: number;
    price: number;
    status: UnitStatus;
  }> = [];

  for (let b = 0; b < buildings.length; b += 1) {
    for (let floor = 1; floor <= 3; floor += 1) {
      for (let idx = 1; idx <= 2; idx += 1) {
        const number = `${buildings[b].number}${floor}0${idx}`;
        const large = idx === 1;
        unitPlan.push({
          buildingIndex: b,
          number,
          floor,
          type: large ? 'شقة 3 غرف' : 'شقة غرفتين',
          area: large ? 165 : 128,
          bedrooms: large ? 3 : 2,
          bathrooms: large ? 3 : 2,
          parkingSpots: large ? 2 : 1,
          price: large ? 890_000 : 720_000,
          // A unit is OCCUPIED only if a real ownership backs it, and this seed
          // creates exactly ONE (A101, the demo homeowner's). Marking four
          // units occupied by position gave the Company workspace four occupied
          // units with three owners missing. `normalizeDemoTenant` re-asserts
          // this rule on every run, including for units that already exist.
          status: UnitStatus.AVAILABLE,
        });
      }
    }
  }

  const units = [];
  for (const plan of unitPlan) {
    const building = buildings[plan.buildingIndex];
    const existing = await db.unit.findUnique({
      where: { buildingId_number: { buildingId: building.id, number: plan.number } },
    });
    units.push(
      existing ??
        (await db.unit.create({
          data: {
            buildingId: building.id,
            number: plan.number,
            floor: plan.floor,
            type: plan.type,
            area: plan.area,
            bedrooms: plan.bedrooms,
            bathrooms: plan.bathrooms,
            parkingSpots: plan.parkingSpots,
            price: plan.price,
            status: plan.status,
          },
        })),
    );
  }

  const homeownerUnit = units[0]; // A101 - the polished, occupied demo unit.

  // --- Project manager and technicians -------------------------------------
  await db.projectManager.upsert({
    where: { userId: pmUser.id },
    update: { projectId: project.id, status: ProjectManagerStatus.ACTIVATED },
    create: { userId: pmUser.id, projectId: project.id, status: ProjectManagerStatus.ACTIVATED },
  });

  const technician = await db.technician.upsert({
    where: { userId: techUser.id },
    update: { projectId: project.id, status: TechnicianStatus.AVAILABLE, specialty: SPECIALTY_PLUMBING },
    create: {
      userId: techUser.id,
      projectId: project.id,
      status: TechnicianStatus.AVAILABLE,
      specialty: SPECIALTY_PLUMBING,
    },
  });

  const technician2 = await db.technician.upsert({
    where: { userId: tech2User.id },
    update: { projectId: project.id, status: TechnicianStatus.AVAILABLE, specialty: SPECIALTY_ELECTRICAL },
    create: {
      userId: tech2User.id,
      projectId: project.id,
      status: TechnicianStatus.AVAILABLE,
      specialty: SPECIALTY_ELECTRICAL,
    },
  });

  // --- Ownership, activation and warranty ----------------------------------
  const handoverDate = daysAgo(210);

  let ownership = await db.ownership.findFirst({
    where: { unitId: homeownerUnit.id, userId: homeownerUser.id, status: 'ACTIVE' },
  });
  if (!ownership) {
    ownership = await db.ownership.create({
      data: {
        unitId: homeownerUnit.id,
        userId: homeownerUser.id,
        startDate: handoverDate,
        status: 'ACTIVE',
      },
    });
  }

  const existingActivation = await db.homeownerActivation.findFirst({
    where: { unitId: homeownerUnit.id, userId: homeownerUser.id },
  });
  if (!existingActivation) {
    await db.homeownerActivation.create({
      data: {
        unitId: homeownerUnit.id,
        userId: homeownerUser.id,
        // A hash of a value this script does not keep: the demo homeowner
        // signs in with the password, not by redeeming a code. No usable
        // activation secret is created or stored.
        codeHash: `${LABEL}-consumed-${homeownerUnit.id}`,
        status: 'ACTIVATED',
        expiresAt: daysAgo(180),
        activatedAt: handoverDate,
      },
    });
  }

  await db.warranty.upsert({
    where: { unitId: homeownerUnit.id },
    update: { startDate: handoverDate, endDate: new Date(handoverDate.getTime() + 365 * 86_400_000) },
    create: {
      unitId: homeownerUnit.id,
      startDate: handoverDate,
      endDate: new Date(handoverDate.getTime() + 365 * 86_400_000),
      coverage: 'STANDARD',
    },
  });

  // --- Home seeker: a real saved project and a real completed visit ---------
  await db.savedProject.upsert({
    where: { userId_projectId: { userId: seekerUser.id, projectId: project.id } },
    update: {},
    create: { userId: seekerUser.id, projectId: project.id },
  });

  const vacantUnit = units.find((u) => u.status === UnitStatus.AVAILABLE)!;
  let journey = await db.searchJourney.findFirst({ where: { userId: seekerUser.id } });
  if (!journey) {
    journey = await db.searchJourney.create({
      data: { userId: seekerUser.id, status: SearchJourneyStatus.VISITING },
    });
  }

  const existingVisits = await db.visit.count({ where: { userId: seekerUser.id } });
  if (existingVisits === 0) {
    await db.visit.create({
      data: {
        userId: seekerUser.id,
        projectId: project.id,
        unitId: vacantUnit.id,
        searchJourneyId: journey.id,
        date: daysAgo(6),
        time: '17:00',
        status: VisitStatus.COMPLETED,
        checkedInAt: daysAgo(6),
        checkedOutAt: new Date(daysAgo(6).getTime() + 45 * 60_000),
      },
    });
    // An upcoming visit, so H5 has something live to walk through.
    await db.visit.create({
      data: {
        userId: seekerUser.id,
        projectId: project.id,
        unitId: units.find((u) => u.status === UnitStatus.AVAILABLE && u.id !== vacantUnit.id)!.id,
        searchJourneyId: journey.id,
        date: new Date(Date.now() + 2 * 86_400_000),
        time: '19:00',
        status: VisitStatus.CONFIRMED,
      },
    });
  }

  // --- Demo-tenant consistency (runs on EVERY seed, new or existing) --------
  await normalizeDemoTenant(db, {
    projectId: project.id,
    unitIds: units.map((u) => u.id),
    generalTechnicianId: technician.id,
    electricalTechnicianId: technician2.id,
  });

  // --- The browsable catalogue ---------------------------------------------
  // BEFORE the early return below: that branch is the re-run path, and seeding
  // the catalogue after it would mean an existing tenant — the normal case for
  // a production top-up — never received these projects at all.
  const catalogue = await seedCatalogue(db, company.id, contractorOrg.id);

  // --- Canonical reports ---------------------------------------------------
  const existingReports = await db.report.count({ where: { homeownerId: homeownerUser.id } });
  if (existingReports > 0) {
    return {
      companyId: company.id,
      projectId: project.id,
      accounts: accountList(),
      units: units.length,
      reports: existingReports,
      reportsAlreadyPresent: true,
      catalogueProjects: catalogue.projects,
      catalogueUnits: catalogue.units,
    };
  }

  const reportBase = {
    homeownerId: homeownerUser.id,
    ownershipId: ownership.id,
    unitId: homeownerUnit.id,
    buildingId: buildings[0].id,
    projectId: project.id,
  };

  const warrantyRow = await db.warranty.findUnique({ where: { unitId: homeownerUnit.id } });

  async function createReport(input: {
    category: ReportCategory;
    priority: ReportPriority;
    problemText: string;
    homeownerNote?: string;
    createdAt: Date;
    status: ReportStatus;
    assignedTechnicianId?: string;
    assignedAt?: Date;
  }) {
    const snapshot = evaluateReportWarranty({
      category: input.category,
      warranty: warrantyRow,
      now: input.createdAt,
    });

    const routed = !!input.assignedTechnicianId;
    return db.report.create({
      data: {
        ...reportBase,
        category: input.category,
        categoryConfirmedByUser: true,
        problemText: input.problemText,
        homeownerNote: input.homeownerNote ?? null,
        priority: input.priority,
        prioritySource: ReportPrioritySource.MANUAL_DEFAULT,
        warrantyVerdict: snapshot.verdict,
        warrantyReasonCode: snapshot.reasonCode,
        warrantyCategoryKey: snapshot.warrantyCategoryKey,
        warrantyRulesVersion: snapshot.rulesVersion,
        warrantyEvaluatedAt: snapshot.evaluatedAt,
        warrantyPeriodStart: snapshot.periodStart,
        warrantyPeriodEnd: snapshot.periodEnd,
        status: input.status,
        routingState: routed ? ReportRoutingState.ROUTED : ReportRoutingState.PENDING,
        routingReasonCode: routed ? 'SPECIALTY_MATCH' : 'NO_ACTIVE_TECHNICIAN_IN_PROJECT',
        routingAttemptCount: 1,
        lastRoutingAttemptAt: input.createdAt,
        assignedTechnicianId: input.assignedTechnicianId ?? null,
        originalTechnicianId: input.assignedTechnicianId ?? null,
        assignedAt: input.assignedAt ?? (routed ? input.createdAt : null),
        slaStartDueAt: computeSlaStartDueAt(input.priority, input.createdAt),
        slaRulesVersion: REPORT_SLA_RULES_VERSION,
        createdAt: input.createdAt,
      },
    });
  }

  async function timeline(
    reportId: string,
    events: Array<{ type: ReportTimelineEventType; actorType: ReportActorType; actorId?: string; at: Date; metadata?: Prisma.InputJsonValue }>,
  ) {
    for (const event of events) {
      await db.reportTimelineEvent.create({
        data: {
          reportId,
          type: event.type,
          actorType: event.actorType,
          actorId: event.actorId ?? null,
          metadata: event.metadata,
          createdAt: event.at,
        },
      });
    }
  }

  // 1. CLOSED - a full, finished journey with a real repair, approval and 5★ review.
  const closedCreatedAt = daysAgo(24);
  const closedStartedAt = daysAgo(23);
  const closedSubmittedAt = daysAgo(22);
  const closedApprovedAt = daysAgo(21);
  const closed = await createReport({
    category: ReportCategory.PLUMBING,
    priority: ReportPriority.HIGH,
    problemText: 'تسرّب مياه أسفل حوض المطبخ مع بلل مستمر في الخزانة السفلية.',
    homeownerNote: 'التسرّب يزداد عند تشغيل الماء الساخن.',
    createdAt: closedCreatedAt,
    status: ReportStatus.CLOSED,
    assignedTechnicianId: technician.id,
    assignedAt: closedCreatedAt,
  });
  await db.report.update({ where: { id: closed.id }, data: { closedAt: closedApprovedAt } });

  const closedRepair = await db.reportRepair.create({
    data: {
      reportId: closed.id,
      technicianId: technician.id,
      status: ReportRepairStatus.APPROVED,
      startedAt: closedStartedAt,
      submittedAt: closedSubmittedAt,
      homeownerDecisionAt: closedApprovedAt,
      technicianNote: 'تم استبدال وصلة الصرف المتضررة وإحكام التوصيلات، واختبار التشغيل لمدة ١٥ دقيقة دون تسرّب.',
      durationMinutes: Math.round((closedApprovedAt.getTime() - closedStartedAt.getTime()) / 60_000),
    },
  });

  await db.reportReview.create({
    data: {
      reportId: closed.id,
      reportRepairId: closedRepair.id,
      technicianId: technician.id,
      homeownerId: homeownerUser.id,
      rating: 5,
      comment: 'حضر في الموعد وأنهى الإصلاح بسرعة ونظافة. شكراً.',
      createdAt: closedApprovedAt,
    },
  });

  await timeline(closed.id, [
    { type: ReportTimelineEventType.REPORT_CREATED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: closedCreatedAt },
    { type: ReportTimelineEventType.TECHNICIAN_ASSIGNED, actorType: ReportActorType.SYSTEM, at: closedCreatedAt, metadata: { technicianId: technician.id, reasonCode: 'SPECIALTY_MATCH' } },
    { type: ReportTimelineEventType.REPAIR_STARTED, actorType: ReportActorType.TECHNICIAN, actorId: techUser.id, at: closedStartedAt },
    { type: ReportTimelineEventType.REPAIR_SUBMITTED, actorType: ReportActorType.TECHNICIAN, actorId: techUser.id, at: closedSubmittedAt },
    { type: ReportTimelineEventType.HOMEOWNER_APPROVED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: closedApprovedAt },
    { type: ReportTimelineEventType.REVIEW_SUBMITTED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: closedApprovedAt, metadata: { rating: 5 } },
    { type: ReportTimelineEventType.REPORT_CLOSED, actorType: ReportActorType.SYSTEM, at: closedApprovedAt },
  ]);

  // 2. AWAITING_OWNER_APPROVAL - work submitted, waiting on the homeowner.
  const awaitingCreatedAt = daysAgo(4);
  const awaitingStartedAt = daysAgo(3);
  const awaitingSubmittedAt = hoursAgo(20);
  const awaiting = await createReport({
    category: ReportCategory.ELECTRICAL,
    priority: ReportPriority.HIGH,
    problemText: 'انقطاع الكهرباء المتكرر عن مقابس غرفة المعيشة.',
    createdAt: awaitingCreatedAt,
    status: ReportStatus.AWAITING_OWNER_APPROVAL,
    assignedTechnicianId: technician2.id,
    assignedAt: awaitingCreatedAt,
  });
  await db.reportRepair.create({
    data: {
      reportId: awaiting.id,
      technicianId: technician2.id,
      status: ReportRepairStatus.SUBMITTED,
      startedAt: awaitingStartedAt,
      submittedAt: awaitingSubmittedAt,
      technicianNote: 'تم استبدال قاطع التيار المتضرر وإعادة ربط الخط الرئيسي للغرفة.',
    },
  });
  await timeline(awaiting.id, [
    { type: ReportTimelineEventType.REPORT_CREATED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: awaitingCreatedAt },
    { type: ReportTimelineEventType.TECHNICIAN_ASSIGNED, actorType: ReportActorType.SYSTEM, at: awaitingCreatedAt, metadata: { technicianId: technician2.id, reasonCode: 'SPECIALTY_MATCH' } },
    { type: ReportTimelineEventType.REPAIR_STARTED, actorType: ReportActorType.TECHNICIAN, actorId: tech2User.id, at: awaitingStartedAt },
    { type: ReportTimelineEventType.REPAIR_SUBMITTED, actorType: ReportActorType.TECHNICIAN, actorId: tech2User.id, at: awaitingSubmittedAt },
  ]);

  // 3. IN_PROGRESS - the technician's live task.
  const inProgressCreatedAt = hoursAgo(30);
  const inProgressStartedAt = hoursAgo(6);
  const inProgress = await createReport({
    category: ReportCategory.OTHER,
    priority: ReportPriority.MEDIUM,
    problemText: 'مكيّف غرفة النوم الرئيسية لا يبرّد بكفاءة ويصدر صوتاً عالياً.',
    createdAt: inProgressCreatedAt,
    status: ReportStatus.IN_PROGRESS,
    assignedTechnicianId: technician.id,
    assignedAt: inProgressCreatedAt,
  });
  await db.reportRepair.create({
    data: {
      reportId: inProgress.id,
      technicianId: technician.id,
      status: ReportRepairStatus.IN_PROGRESS,
      startedAt: inProgressStartedAt,
    },
  });
  await timeline(inProgress.id, [
    { type: ReportTimelineEventType.REPORT_CREATED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: inProgressCreatedAt },
    { type: ReportTimelineEventType.TECHNICIAN_ASSIGNED, actorType: ReportActorType.SYSTEM, at: inProgressCreatedAt, metadata: { technicianId: technician.id, reasonCode: 'GENERAL_MAINTENANCE_FALLBACK' } },
    { type: ReportTimelineEventType.REPAIR_STARTED, actorType: ReportActorType.TECHNICIAN, actorId: techUser.id, at: inProgressStartedAt },
  ]);

  // 4. ROUTED, and deliberately past its 4-hour HIGH-priority SLA target, so
  //    PM1's SLA-breach alert has a REAL row behind it rather than a mock.
  const breachedCreatedAt = hoursAgo(9);
  const breached = await createReport({
    category: ReportCategory.PLUMBING,
    priority: ReportPriority.HIGH,
    problemText: 'انسداد في تصريف الحمام الرئيسي مع ارتجاع للمياه.',
    createdAt: breachedCreatedAt,
    status: ReportStatus.ROUTED,
    assignedTechnicianId: technician.id,
    assignedAt: breachedCreatedAt,
  });
  await timeline(breached.id, [
    { type: ReportTimelineEventType.REPORT_CREATED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: breachedCreatedAt },
    { type: ReportTimelineEventType.TECHNICIAN_ASSIGNED, actorType: ReportActorType.SYSTEM, at: breachedCreatedAt, metadata: { technicianId: technician.id, reasonCode: 'SPECIALTY_MATCH' } },
  ]);

  // 5. A recent LOW-priority report, routed and calm - so the queue is not
  //    uniformly on fire.
  const calmCreatedAt = hoursAgo(3);
  const calm = await createReport({
    category: ReportCategory.PAINT,
    priority: ReportPriority.LOW,
    problemText: 'تقشّر بسيط في دهان جدار الممر بجانب المدخل.',
    createdAt: calmCreatedAt,
    status: ReportStatus.ROUTED,
    assignedTechnicianId: technician.id,
    assignedAt: calmCreatedAt,
  });
  await timeline(calm.id, [
    { type: ReportTimelineEventType.REPORT_CREATED, actorType: ReportActorType.HOMEOWNER, actorId: homeownerUser.id, at: calmCreatedAt },
    { type: ReportTimelineEventType.TECHNICIAN_ASSIGNED, actorType: ReportActorType.SYSTEM, at: calmCreatedAt, metadata: { technicianId: technician.id, reasonCode: 'GENERAL_MAINTENANCE_FALLBACK' } },
  ]);

  void companyUser;
  void ReportMediaStage;

  return {
    companyId: company.id,
    projectId: project.id,
    accounts: accountList(),
    units: units.length,
    reports: 5,
    reportsAlreadyPresent: false,
    catalogueProjects: catalogue.projects,
    catalogueUnits: catalogue.units,
  };
}

/**
 * The additional browsable projects (`CATALOGUE`).
 *
 * Idempotent in the same style as the rest of this file: each project is found
 * by its globally-unique `code` and updated in place, its gallery is REPLACED
 * rather than appended (a re-run must not grow it), and buildings and units are
 * found by their own unique keys before being created. Running the seed twice
 * produces identical rows.
 *
 * Scope: writes only to projects coded `${LABEL}-P2..P6` and rows beneath them.
 * `${LABEL}-P1` is never read or written here, and neither is any row outside
 * this company.
 *
 * These projects deliberately carry no project manager, technicians,
 * ownerships, warranties or reports. They exist to be BROWSED, and inventing a
 * homeowner or a maintenance history for a project nobody has bought into
 * would put fabricated operational data in front of the company and PM
 * dashboards.
 */
async function seedCatalogue(
  db: PrismaClient,
  companyId: string,
  primaryContractorId: string,
): Promise<{ projects: number; units: number }> {
  let unitCount = 0;

  for (const spec of CATALOGUE) {
    const code = `${LABEL}-${spec.codeSuffix}`;
    const data = {
      companyId,
      name: spec.name,
      city: spec.city,
      district: spec.district,
      description: spec.description,
      status: ProjectStatus.ACTIVE,
      isActive: true,
      readiness: spec.readiness,
      amenities: spec.amenities,
      // Static public asset served by the frontend, not a Supabase object, so
      // `coverImageKey` stays null and nothing tries to sign or delete it.
      coverImageUrl: spec.coverImage,
      primaryContractorId,
    };

    const existing = await db.project.findUnique({ where: { code } });
    const project = existing
      ? await db.project.update({ where: { id: existing.id }, data })
      : await db.project.create({ data: { ...data, code } });

    // Replace-in-place, scoped to THIS project id only.
    await db.projectMedia.deleteMany({ where: { projectId: project.id } });
    if (spec.gallery.length > 0) {
      await db.projectMedia.createMany({
        data: spec.gallery.map((url, index) => ({
          projectId: project.id,
          url,
          // Genuine project photography, not a stand-in — so the honest
          // "no real photo yet" empty state correctly stops showing.
          isPlaceholder: false,
          sortOrder: index,
        })),
      });
    }

    const existingBuilding = await db.building.findUnique({
      where: { projectId_number: { projectId: project.id, number: spec.building.number } },
    });
    const building =
      existingBuilding ??
      (await db.building.create({
        data: {
          projectId: project.id,
          name: spec.building.name,
          number: spec.building.number,
          floors: spec.building.floors,
          status: 'ACTIVE',
          isActive: true,
        },
      }));

    let ordinal = 0;
    for (const unit of spec.units) {
      for (let i = 0; i < unit.count; i += 1) {
        ordinal += 1;
        const floor = Math.min(spec.building.floors, Math.ceil(ordinal / 2));
        const number = `${spec.building.number}${floor}${String(ordinal).padStart(2, '0')}`;
        const found = await db.unit.findUnique({
          where: { buildingId_number: { buildingId: building.id, number } },
        });
        if (!found) {
          await db.unit.create({
            data: {
              buildingId: building.id,
              number,
              floor,
              type: unit.type,
              area: unit.area,
              bedrooms: unit.bedrooms,
              bathrooms: unit.bathrooms,
              parkingSpots: unit.parkingSpots,
              price: unit.price,
              status: unit.status,
            },
          });
        }
        unitCount += 1;
      }
    }
  }

  return { projects: CATALOGUE.length, units: unitCount };
}

function accountList() {
  return [
    { role: 'Company / developer', email: IDENTITIES.company.email },
    { role: 'Project manager', email: IDENTITIES.pm.email },
    { role: 'Technician (general maintenance)', email: IDENTITIES.technician.email },
    { role: 'Technician (electrical)', email: IDENTITIES.technician2.email },
    { role: 'Active homeowner', email: IDENTITIES.homeowner.email },
    { role: 'Home seeker / prospect', email: IDENTITIES.seeker.email },
  ];
}

// ---------------------------------------------------------------------------
// Demo-tenant consistency.
//
// The seed creates its fixtures ONCE and then skips them, so a tenant that has
// been used - reports filed through the app, units changed - drifts away from
// what the seed intends and nothing ever pulls it back. This pass runs on every
// seed, new tenant or existing, and repairs exactly three classes of
// inconsistency that a live walkthrough exposes. It is strictly scoped to the
// SAKN-DEMO project passed in, and it is idempotent: a second run changes
// nothing.
//
//   1. OCCUPANCY vs OWNERSHIP. Units were seeded OCCUPIED by position
//      (building A, floors 1-2 = four units) while only ONE ownership row is
//      ever created. The Company workspace therefore reported four occupied
//      units, three of which had no owner - the KPI and the unit grid
//      contradicting each other on the same screen. Occupancy is now DERIVED:
//      a unit is OCCUPIED if and only if it has an ACTIVE ownership.
//
//   2. MIXED-LANGUAGE CONTENT. Reports filed through the app during testing
//      carry text like "يوجد crack في الجدار." An Arabic product demo should
//      not show a Latin word mid-sentence. Only the SAKN-DEMO tenant's own
//      rows are touched, and only the known Latin technical words are
//      translated - nothing is invented and no other field is written.
//
//   3. TRADE MISMATCH. `REPORT_CATEGORY_TO_SPECIALTY` maps CRACKS (and DOORS,
//      WINDOWS, FLOORING, CEILINGS, OTHER) to صيانة عامة. The tenant had no
//      general-maintenance technician, so `selectTechnician` fell all the way
//      through to ANY_ELIGIBLE_FALLBACK and put crack reports on the
//      ELECTRICAL technician. `فني الصيانة (عرض)` - whose name already says
//      general maintenance - now carries that specialty, and existing reports
//      are re-pointed to the technician the routing engine would choose today,
//      with the honest reason code.
// ---------------------------------------------------------------------------

/** Latin technical words that leaked into Arabic demo copy, with their Arabic equivalents. */
const DEMO_TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bcracks?\b/gi, 'شق'],
  [/\bleak(age|s)?\b/gi, 'تسرّب'],
  [/\bwall\b/gi, 'الجدار'],
  [/\bAC\b/g, 'المكيّف'],
  [/\bpaint\b/gi, 'الدهان'],
];

/** Returns the corrected string, or `null` when nothing needed correcting. */
export function correctDemoText(value: string | null | undefined): string | null {
  if (!value) return null;
  let out = value;
  for (const [pattern, replacement] of DEMO_TEXT_REPLACEMENTS) out = out.replace(pattern, replacement);
  // Collapse the double spacing a substitution can leave behind.
  out = out.replace(/[ \t]{2,}/g, ' ').trim();
  return out === value ? null : out;
}

export async function normalizeDemoTenant(
  db: PrismaClient,
  scope: {
    projectId: string;
    unitIds: string[];
    generalTechnicianId: string;
    electricalTechnicianId: string;
  },
): Promise<{ occupancyFixed: number; textFixed: number; reassigned: number }> {
  /* 1 ── occupancy follows ownership -------------------------------------- */
  const activeOwnerships = await db.ownership.findMany({
    where: { unitId: { in: scope.unitIds }, status: OwnershipStatus.ACTIVE },
    select: { unitId: true },
  });
  const ownedUnitIds = new Set(activeOwnerships.map((o) => o.unitId));

  // Occupied without an owner -> AVAILABLE.
  const falselyOccupied = await db.unit.updateMany({
    where: {
      id: { in: scope.unitIds.filter((id) => !ownedUnitIds.has(id)) },
      status: UnitStatus.OCCUPIED,
    },
    data: { status: UnitStatus.AVAILABLE },
  });
  // Owned but not marked occupied -> OCCUPIED.
  const falselyVacant = await db.unit.updateMany({
    where: { id: { in: [...ownedUnitIds] }, status: { not: UnitStatus.OCCUPIED } },
    data: { status: UnitStatus.OCCUPIED },
  });

  /* 2 ── Arabic-only demo copy -------------------------------------------- */
  const reports = await db.report.findMany({
    where: { projectId: scope.projectId },
    select: { id: true, category: true, problemText: true, homeownerNote: true, aiProblemText: true, aiExplanation: true, assignedTechnicianId: true },
  });

  let textFixed = 0;
  for (const report of reports) {
    const data: Record<string, string> = {};
    const problemText = correctDemoText(report.problemText);
    const homeownerNote = correctDemoText(report.homeownerNote);
    const aiProblemText = correctDemoText(report.aiProblemText);
    const aiExplanation = correctDemoText(report.aiExplanation);
    if (problemText) data.problemText = problemText;
    if (homeownerNote) data.homeownerNote = homeownerNote;
    if (aiProblemText) data.aiProblemText = aiProblemText;
    if (aiExplanation) data.aiExplanation = aiExplanation;
    if (Object.keys(data).length === 0) continue;
    await db.report.update({ where: { id: report.id }, data });
    textFixed += 1;
  }

  /* 3 ── the assigned trade matches the category -------------------------- */
  // `فني الصيانة (عرض)` becomes the tenant's general-maintenance technician,
  // which is what CRACKS/DOORS/WINDOWS/FLOORING/CEILINGS/OTHER route to.
  await db.technician.update({
    where: { id: scope.generalTechnicianId },
    data: { specialty: SPECIALTY_GENERAL },
  });

  let reassigned = 0;
  for (const report of reports) {
    if (!report.assignedTechnicianId) continue;
    const wanted =
      report.category === ReportCategory.ELECTRICAL
        ? scope.electricalTechnicianId
        : scope.generalTechnicianId;
    if (report.assignedTechnicianId === wanted) continue;
    await db.report.update({
      where: { id: report.id },
      data: {
        assignedTechnicianId: wanted,
        routingReasonCode:
          report.category === ReportCategory.ELECTRICAL ? 'SPECIALTY_MATCH' : 'GENERAL_MAINTENANCE_FALLBACK',
      },
    });
    reassigned += 1;
  }

  return {
    occupancyFixed: falselyOccupied.count + falselyVacant.count,
    textFixed,
    reassigned,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const reset = process.argv.includes('--reset');
  const reseed = process.argv.includes('--reseed');

  if (env.isProduction && !process.argv.includes('--i-know-this-is-production')) {
    throw new Error(
      'Refusing to run against a production environment without --i-know-this-is-production.',
    );
  }

  console.log(`Demo tenant label: ${LABEL}   (company CR: ${CR})`);

  if (reset || reseed) {
    const counts = await resetDemoTenant();
    const removed = Object.entries(counts).filter(([, n]) => n > 0);
    if (removed.length === 0) {
      console.log('Nothing to remove - no demo tenant present.');
    } else {
      console.log('Removed (demo tenant only):');
      for (const [table, n] of removed) console.log(`  ${table}: ${n}`);
    }
    if (reset && !reseed) return;
  }

  const password = await resolvePassword();
  const summary = await seedDemoTenant(password);

  console.log('\nDemo tenant ready.');
  console.log(`  company:  ${summary.companyId}`);
  console.log(`  project:  ${summary.projectId}`);
  console.log(`  units:    ${summary.units}`);
  console.log(
    `  catalogue: ${summary.catalogueProjects} browsable projects, ${summary.catalogueUnits} units`,
  );
  console.log(
    `  reports:  ${summary.reports}${summary.reportsAlreadyPresent ? ' (already present - not duplicated)' : ''}`,
  );
  console.log(
    '\nAccounts. Existing accounts KEPT their current password — this seed never' +
      '\nrewrites one. A password is set only when an account has to be created,' +
      '\nand it is never printed:',
  );
  for (const account of summary.accounts) {
    console.log(`  ${account.role.padEnd(24)} ${account.email}`);
  }
  console.log(
    '\nRotate or delete these accounts after the demo. The password appears in no file, no log and no document.',
  );
}

if (require.main === module) {
  main()
    .catch((err) => {
      // Print the message only - never the argv or the environment, either of
      // which could carry the password.
      console.error(`\nDemo seed failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
