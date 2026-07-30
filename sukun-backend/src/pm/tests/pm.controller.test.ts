import { Response } from 'express';
import { pmController } from '../pm.controller';
import { pmService } from '../pm.service';
import { AuthenticatedRequest } from '../../shared/auth.middleware';

jest.mock('../pm.service', () => ({
  pmService: {
    overview: jest.fn().mockResolvedValue({ ok: true }),
    alerts: jest.fn().mockResolvedValue({ ok: true }),
    activity: jest.fn().mockResolvedValue({ ok: true }),
    reports: jest.fn().mockResolvedValue({ ok: true }),
    contractors: jest.fn().mockResolvedValue({ ok: true }),
    contractorPerformance: jest.fn().mockResolvedValue({ ok: true }),
    contractorInsight: jest.fn().mockResolvedValue({ ok: true }),
    copilotSummary: jest.fn().mockResolvedValue({ ok: true }),
    copilotChat: jest.fn().mockResolvedValue({ ok: true }),
  },
}));

const service = pmService as jest.Mocked<typeof pmService>;

/**
 * Task 9 regression tests for a real defect the browser pass caught and no
 * mocked service test could have.
 *
 * `validateQuery` puts the PARSED, coerced query on `res.locals.query`; it never
 * writes back to `req.query`, whose values are always strings. The PM controller
 * originally read `req.query`, so `pageSize` reached Prisma as the STRING "25"
 * and `page` as `undefined` -> `take: "25"`, `skip: NaN` -> every PM report list
 * answered 500.
 *
 * These tests pin the contract: the controller reads the validated query, and
 * ignores whatever raw strings sit on `req.query`.
 */
function ctx(locals: Record<string, unknown>, rawQuery: Record<string, unknown> = {}) {
  const req = {
    user: { id: 'pm-user', role: 'PROJECT_MANAGER', companyId: null },
    query: rawQuery,
    params: { technicianId: 'tech-1' },
    body: {},
  } as unknown as AuthenticatedRequest;
  const res = {
    locals: { requestId: 'req-1', ...locals },
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return { req, res };
}

beforeEach(() => jest.clearAllMocks());

describe('PM controller reads the VALIDATED query (decisions.md J8)', () => {
  it('passes the coerced numeric pagination through to the service, not the raw strings', async () => {
    const validated = { page: 1, pageSize: 25, status: ['ROUTED'] };
    // The raw query still holds strings, exactly as Express delivers them.
    const { req, res } = ctx({ query: validated }, { pageSize: '25', status: 'ROUTED' });

    await pmController.reports(req, res);

    expect(service.reports).toHaveBeenCalledWith(expect.anything(), validated);
    const passed = service.reports.mock.calls[0][1] as { page: number; pageSize: number };
    expect(typeof passed.pageSize).toBe('number');
    expect(typeof passed.page).toBe('number');
  });

  it('reads projectId from the validated query on overview', async () => {
    const { req, res } = ctx({ query: { projectId: 'proj-1' } }, { projectId: 'ignored-raw' });
    await pmController.overview(req, res);
    expect(service.overview).toHaveBeenCalledWith(expect.anything(), 'proj-1');
  });

  it('reads projectId from the validated query on alerts', async () => {
    const { req, res } = ctx({ query: { projectId: 'proj-1' } }, { projectId: 'ignored-raw' });
    await pmController.alerts(req, res);
    expect(service.alerts).toHaveBeenCalledWith(expect.anything(), 'proj-1');
  });

  it('reads projectId from the validated query on contractors', async () => {
    const { req, res } = ctx({ query: { projectId: 'proj-1' } }, { projectId: 'ignored-raw' });
    await pmController.contractors(req, res);
    expect(service.contractors).toHaveBeenCalledWith(expect.anything(), 'proj-1');
  });

  it('passes a coerced numeric limit through on activity', async () => {
    const { req, res } = ctx({ query: { limit: 12 } }, { limit: '12' });
    await pmController.activity(req, res);
    const passed = service.activity.mock.calls[0][1] as { limit?: number };
    expect(typeof passed.limit).toBe('number');
    expect(passed.limit).toBe(12);
  });

  it('builds the principal from the authenticated user, never from the query', async () => {
    const { req, res } = ctx({ query: {} }, { userId: 'someone-else' });
    await pmController.overview(req, res);
    expect(service.overview).toHaveBeenCalledWith(
      { id: 'pm-user', role: 'PROJECT_MANAGER', companyId: null },
      undefined,
    );
  });
});
