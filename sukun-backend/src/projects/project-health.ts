import { ReportPriority, ReportStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ACTIVE_REPORT_STATUSES } from '../reports/report.types';

// Task 4 (decisions.md E8): server-computed, grounded only in data that
// already exists - never a fabricated number. A brand-new project with zero
// reports honestly reads EXCELLENT, not a guessed "good" score.
//
// Task 8 (decisions.md I14) redefines what "reports" means here. Before Task 8
// the only post-ownership entity was `WarrantyReport`, so this summed
// InspectionReport (PRE-ownership, sales journey) + WarrantyReport into one
// number. Now that a real canonical post-ownership `Report` exists:
//
//   * `openReportsCount` and the health status mean CANONICAL POST-OWNERSHIP
//     reports only - the thing RE1/RE3 are actually about;
//   * the pre-ownership InspectionReport count and any legacy WarrantyReport
//     rows keep their own explicitly-named fields under `legacy`, so the two
//     are visible but never silently summed;
//   * legacy WarrantyReport rows that the backfill has already mirrored into a
//     canonical Report are excluded from the legacy count, so a backfilled row
//     is counted exactly once.
export type ProjectHealthStatus = 'EXCELLENT' | 'NEEDS_ATTENTION' | 'CRITICAL';

const HEALTH_LABEL_AR: Record<ProjectHealthStatus, string> = {
  EXCELLENT: 'ممتاز',
  NEEDS_ATTENTION: 'يحتاج متابعة',
  CRITICAL: 'حرج',
};

export interface ProjectHealthLegacyCounts {
  openInspectionReportsCount: number;
  openWarrantyReportsCount: number;
}

export interface ProjectHealth {
  status: ProjectHealthStatus;
  label: string;
  /** Canonical post-ownership open reports (Task 8, decisions.md I14). */
  openReportsCount: number;
  /** Canonical open reports at HIGH priority - what drives the CRITICAL badge. */
  criticalReportsCount: number;
  legacy: ProjectHealthLegacyCounts;
}

export async function computeProjectHealth(projectId: string): Promise<ProjectHealth> {
  const unitFilter = { unit: { building: { projectId } } };

  const [openCanonical, criticalCanonical, openInspection, openLegacyWarranty] = await Promise.all([
    prisma.report.count({ where: { projectId, status: { in: ACTIVE_REPORT_STATUSES } } }),
    prisma.report.count({
      where: { projectId, status: { in: ACTIVE_REPORT_STATUSES }, priority: ReportPriority.HIGH },
    }),
    prisma.inspectionReport.count({ where: { ...unitFilter, status: { not: 'CLOSED' } } }),
    prisma.warrantyReport.count({
      where: { ...unitFilter, status: { not: 'CLOSED' }, canonicalReport: { is: null } },
    }),
  ]);

  const status: ProjectHealthStatus =
    criticalCanonical > 0 ? 'CRITICAL' : openCanonical > 0 ? 'NEEDS_ATTENTION' : 'EXCELLENT';

  return {
    status,
    label: HEALTH_LABEL_AR[status],
    openReportsCount: openCanonical,
    criticalReportsCount: criticalCanonical,
    legacy: {
      openInspectionReportsCount: openInspection,
      openWarrantyReportsCount: openLegacyWarranty,
    },
  };
}

export { ReportStatus };
