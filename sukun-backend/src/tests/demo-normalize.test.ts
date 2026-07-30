import { correctDemoText, normalizeDemoTenant } from '../scripts/demo-seed';

// ---------------------------------------------------------------------------
// The demo tenant's consistency pass.
//
// Three inconsistencies a live walkthrough exposed, each asserted here against
// a Prisma double so the properties hold independently of any database's
// current contents — plus the two properties that make it safe to run against
// a real tenant: it is idempotent, and it is scoped.
// ---------------------------------------------------------------------------

describe('correctDemoText', () => {
  it('translates the Latin words that leaked into Arabic demo copy', () => {
    expect(correctDemoText('يوجد crack في الجدار.')).toBe('يوجد شق في الجدار.');
    expect(correctDemoText('هناك leak تحت المغسلة')).toBe('هناك تسرّب تحت المغسلة');
  });

  it('returns null when there is nothing to correct — so nothing is written', () => {
    expect(correctDemoText('يوجد شق في الجدار.')).toBeNull();
    expect(correctDemoText('')).toBeNull();
    expect(correctDemoText(null)).toBeNull();
  });

  it('is idempotent — correcting a corrected string is a no-op', () => {
    const once = correctDemoText('يوجد crack في الجدار.');
    expect(once).not.toBeNull();
    expect(correctDemoText(once)).toBeNull();
  });

  it('leaves an Arabic word that merely contains Latin-looking letters alone', () => {
    expect(correctDemoText('تسرّب مياه أسفل حوض المطبخ.')).toBeNull();
  });
});

type UnitRow = { id: string; status: string };
type ReportRow = {
  id: string;
  category: string;
  problemText: string;
  homeownerNote: string | null;
  aiProblemText: string | null;
  aiExplanation: string | null;
  assignedTechnicianId: string | null;
  routingReasonCode?: string;
};

const GENERAL = 'tech-general';
const ELECTRICAL = 'tech-electrical';

function makeDb(opts: {
  units: UnitRow[];
  ownedUnitIds: string[];
  reports: ReportRow[];
  otherProjectReports?: ReportRow[];
}) {
  const units = opts.units.map((u) => ({ ...u }));
  const reports = opts.reports.map((r) => ({ ...r }));
  const foreign = (opts.otherProjectReports ?? []).map((r) => ({ ...r }));
  const technicianUpdates: Array<{ where: unknown; data: unknown }> = [];

  const db = {
    ownership: {
      findMany: jest.fn(async () => opts.ownedUnitIds.map((unitId) => ({ unitId }))),
    },
    unit: {
      updateMany: jest.fn(
        async ({ where, data }: { where: { id: { in: string[] }; status?: unknown }; data: { status: string } }) => {
          let count = 0;
          for (const u of units) {
            if (!where.id.in.includes(u.id)) continue;
            const s = where.status as { not?: string } | string | undefined;
            if (typeof s === 'string' && u.status !== s) continue;
            if (s && typeof s === 'object' && 'not' in s && u.status === s.not) continue;
            if (u.status === data.status) continue;
            u.status = data.status;
            count += 1;
          }
          return { count };
        },
      ),
    },
    report: {
      // Scoped by projectId: the double only ever returns this project's rows.
      findMany: jest.fn(async () => reports.map((r) => ({ ...r }))),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = reports.find((r) => r.id === where.id);
        if (!row) throw new Error(`report ${where.id} is outside the scoped set`);
        Object.assign(row, data);
        return row;
      }),
    },
    technician: {
      update: jest.fn(async (args: { where: unknown; data: unknown }) => {
        technicianUpdates.push(args);
        return { id: GENERAL };
      }),
    },
  };

  return { db, units, reports, foreign, technicianUpdates };
}

const SCOPE = {
  projectId: 'project-1',
  unitIds: ['u1', 'u2', 'u3', 'u4'],
  generalTechnicianId: GENERAL,
  electricalTechnicianId: ELECTRICAL,
};

function reportRow(over: Partial<ReportRow> = {}): ReportRow {
  return {
    id: 'r1',
    category: 'CRACKS',
    problemText: 'يوجد شق في الجدار.',
    homeownerNote: null,
    aiProblemText: null,
    aiExplanation: null,
    assignedTechnicianId: GENERAL,
    ...over,
  };
}

describe('normalizeDemoTenant — occupancy follows ownership', () => {
  it('clears OCCUPIED on a unit that has no active ownership', async () => {
    const { db, units } = makeDb({
      units: [
        { id: 'u1', status: 'OCCUPIED' },
        { id: 'u2', status: 'OCCUPIED' },
        { id: 'u3', status: 'OCCUPIED' },
        { id: 'u4', status: 'AVAILABLE' },
      ],
      ownedUnitIds: ['u1'],
      reports: [],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);

    expect(units.find((u) => u.id === 'u1')!.status).toBe('OCCUPIED');
    expect(units.find((u) => u.id === 'u2')!.status).toBe('AVAILABLE');
    expect(units.find((u) => u.id === 'u3')!.status).toBe('AVAILABLE');
    expect(units.find((u) => u.id === 'u4')!.status).toBe('AVAILABLE');
    expect(result.occupancyFixed).toBe(2);
  });

  it('marks an owned unit OCCUPIED — the inverse inconsistency', async () => {
    const { db, units } = makeDb({
      units: [{ id: 'u1', status: 'AVAILABLE' }],
      ownedUnitIds: ['u1'],
      reports: [],
    });

    await normalizeDemoTenant(db as never, SCOPE);
    expect(units[0].status).toBe('OCCUPIED');
  });

  it('leaves an already-consistent tenant completely untouched', async () => {
    const { db } = makeDb({
      units: [
        { id: 'u1', status: 'OCCUPIED' },
        { id: 'u2', status: 'AVAILABLE' },
      ],
      ownedUnitIds: ['u1'],
      reports: [],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);
    expect(result).toEqual({ occupancyFixed: 0, textFixed: 0, reassigned: 0 });
  });
});

describe('normalizeDemoTenant — Arabic demo copy', () => {
  it('corrects mixed-language report text', async () => {
    const { db, reports } = makeDb({
      units: [],
      ownedUnitIds: [],
      reports: [
        reportRow({ id: 'r1', problemText: 'يوجد crack في الجدار.' }),
        reportRow({ id: 'r2', aiExplanation: 'تم تحديد وجود crack في الجدار.' }),
      ],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);

    expect(reports.find((r) => r.id === 'r1')!.problemText).toBe('يوجد شق في الجدار.');
    expect(reports.find((r) => r.id === 'r2')!.aiExplanation).toBe('تم تحديد وجود شق في الجدار.');
    expect(result.textFixed).toBe(2);
  });

  it('does not write a report whose text is already clean', async () => {
    const { db } = makeDb({
      units: [],
      ownedUnitIds: [],
      reports: [reportRow({ problemText: 'تسرّب مياه أسفل حوض المطبخ.' })],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);
    expect(result.textFixed).toBe(0);
    expect(db.report.update).not.toHaveBeenCalled();
  });
});

describe('normalizeDemoTenant — the assigned trade matches the category', () => {
  it('moves a CRACKS report off the electrical technician', async () => {
    const { db, reports } = makeDb({
      units: [],
      ownedUnitIds: [],
      reports: [reportRow({ id: 'r1', category: 'CRACKS', assignedTechnicianId: ELECTRICAL })],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);

    expect(reports[0].assignedTechnicianId).toBe(GENERAL);
    expect(reports[0].routingReasonCode).toBe('GENERAL_MAINTENANCE_FALLBACK');
    expect(result.reassigned).toBe(1);
  });

  it('keeps an ELECTRICAL report on the electrical technician, as a specialty match', async () => {
    const { db, reports } = makeDb({
      units: [],
      ownedUnitIds: [],
      reports: [
        reportRow({ id: 'r1', category: 'ELECTRICAL', assignedTechnicianId: ELECTRICAL }),
        reportRow({ id: 'r2', category: 'ELECTRICAL', assignedTechnicianId: GENERAL }),
      ],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);

    expect(reports.find((r) => r.id === 'r1')!.assignedTechnicianId).toBe(ELECTRICAL);
    expect(reports.find((r) => r.id === 'r2')!.assignedTechnicianId).toBe(ELECTRICAL);
    expect(reports.find((r) => r.id === 'r2')!.routingReasonCode).toBe('SPECIALTY_MATCH');
    expect(result.reassigned).toBe(1);
  });

  it('gives the demo tenant a general-maintenance technician, which CRACKS routes to', async () => {
    const { db, technicianUpdates } = makeDb({ units: [], ownedUnitIds: [], reports: [] });

    await normalizeDemoTenant(db as never, SCOPE);

    expect(technicianUpdates).toHaveLength(1);
    expect(technicianUpdates[0]).toEqual({
      where: { id: GENERAL },
      data: { specialty: 'صيانة عامة' },
    });
  });

  it('never touches an UNASSIGNED report', async () => {
    const { db, reports } = makeDb({
      units: [],
      ownedUnitIds: [],
      reports: [reportRow({ id: 'r1', category: 'CRACKS', assignedTechnicianId: null })],
    });

    const result = await normalizeDemoTenant(db as never, SCOPE);
    expect(reports[0].assignedTechnicianId).toBeNull();
    expect(result.reassigned).toBe(0);
  });
});

describe('normalizeDemoTenant — safe to rerun', () => {
  it('is idempotent: a second pass changes nothing', async () => {
    const { db } = makeDb({
      units: [
        { id: 'u1', status: 'OCCUPIED' },
        { id: 'u2', status: 'OCCUPIED' },
      ],
      ownedUnitIds: ['u1'],
      reports: [
        reportRow({ id: 'r1', problemText: 'يوجد crack في الجدار.', category: 'CRACKS', assignedTechnicianId: ELECTRICAL }),
      ],
    });

    const first = await normalizeDemoTenant(db as never, SCOPE);
    expect(first).toEqual({ occupancyFixed: 1, textFixed: 1, reassigned: 1 });

    const second = await normalizeDemoTenant(db as never, SCOPE);
    expect(second).toEqual({ occupancyFixed: 0, textFixed: 0, reassigned: 0 });
  });

  it('scopes every unit write to the ids it was given', async () => {
    const { db } = makeDb({
      units: [{ id: 'u1', status: 'OCCUPIED' }],
      ownedUnitIds: [],
      reports: [],
    });

    await normalizeDemoTenant(db as never, SCOPE);

    for (const call of db.unit.updateMany.mock.calls as unknown as Array<[{ where: { id: { in: string[] } } }]>) {
      for (const id of call[0].where.id.in) {
        expect(SCOPE.unitIds).toContain(id);
      }
    }
  });
});
