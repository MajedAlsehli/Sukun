import { companyRepository } from './company.repository';
import { projectRepository } from '../projects/project.repository';
import { mapInBatches } from '../shared/batch';
import { computeProjectHealth } from '../projects/project-health';
import { toActivityEntryDto } from '../shared/activity.mapper';
import { AuthorizationError } from '../shared/errors';
import { UserRole } from '../shared/roles';

export interface Requester {
  id: string;
  role: UserRole;
  companyId: string | null;
}

function requireLinkedCompany(requester: Requester): string {
  if (requester.role !== UserRole.COMPANY || !requester.companyId) {
    throw new AuthorizationError('This account is not linked to a company.');
  }
  return requester.companyId;
}

export const companyService = {
  // GET /api/company/overview (decisions.md B3/E8) - server-computed KPIs,
  // real data only. Satisfaction stays honestly null (no rating model exists).
  async overview(requester: Requester) {
    const companyId = requireLinkedCompany(requester);
    const kpis = await companyRepository.kpis(companyId);
    const occupiedPercent = kpis.unitsCount > 0 ? Math.round((kpis.occupiedCount / kpis.unitsCount) * 100) : 0;
    const vacantCount = kpis.unitsCount - kpis.occupiedCount;

    return {
      projectsCount: kpis.projectsCount,
      buildingsCount: kpis.buildingsCount,
      unitsCount: kpis.unitsCount,
      occupiedCount: kpis.occupiedCount,
      occupiedPercent,
      vacantCount,
      homeownersCount: kpis.homeownersCount,
      openReportsCount: kpis.openReportsCount,
      closedReportsCount: kpis.closedReportsCount,
      // No rating/review model exists anywhere in the schema (decisions.md
      // E8) - honest null, never a fabricated average.
      satisfaction: null as number | null,
    };
  },

  // GET /api/company/projects/summary (RE1 "Projects section") - one card's
  // worth of real data per project, health server-computed per project.
  async projectsSummary(requester: Requester) {
    const companyId = requireLinkedCompany(requester);
    const projects = await companyRepository.projectsSummary(companyId);

    // Task 10 (decisions.md K4): BOUNDED fan-out. This used to be
    // `Promise.all(projects.map(...))`, and each iteration itself issued five
    // parallel queries - so a company with twenty projects asked for a hundred
    // simultaneous connections from one request, against a pooler with a
    // documented client ceiling. Three projects at a time, same discipline
    // J15 applied to the PM aggregates.
    const items = await mapInBatches(
      projects,
      async (p) => {
        const [unitsCount, health] = await Promise.all([
          projectRepository.countUnits(p.id),
          computeProjectHealth(p.id),
        ]);
        return {
          id: p.id,
          name: p.name,
          city: p.city,
          status: p.status,
          isActive: p.isActive,
          health,
          buildingsCount: p._count.buildings,
          unitsCount,
          managerName: p.projectManager?.user.name ?? null,
          primaryContractorName: p.primaryContractor?.name ?? null,
          createdAt: p.createdAt,
        };
      },
    );

    return { items };
  },

  // GET /api/company/activity (RE1 "Recent activity") - real audit data only.
  async activity(requester: Requester, limit = 20) {
    const companyId = requireLinkedCompany(requester);
    const entries = await companyRepository.activity(companyId, limit);
    return { items: entries.map(toActivityEntryDto) };
  },
};
