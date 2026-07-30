/**
 * Task 8 (docs/integration/decisions.md I3) - legacy `WarrantyReport`
 * compatibility backfill.
 *
 *   npm run task8:backfill-legacy-reports        # apply
 *   npm run task8:backfill-legacy-reports -- --dry-run
 *
 * WHAT IT DOES
 *   Creates a canonical `Report` mirror for every `WarrantyReport` row that
 *   does not already have one, so the superseded legacy post-ownership entity
 *   is visible through `/api/reports/*` alongside everything H8 files.
 *
 * WHAT IT NEVER DOES
 *   - never writes to, updates, or deletes a WarrantyReport / WarrantyImage /
 *     Repair / RepairImage / InspectionReport row;
 *   - never invents a warranty verdict for a historical row (the rules in
 *     force when it was filed are unknowable, so the verdict is recorded as
 *     NOT_EVALUATED_LEGACY - decisions.md I4's "never recompute historical
 *     verdicts" applies to imports too);
 *   - never routes or assigns a mirrored report (they carry no
 *     assignedTechnicianId; automatic routing only ever acts on reports in
 *     ROUTING_PENDING, and legacy rows that map to that status are picked up by
 *     the normal retry sweep like any other);
 *   - never fabricates history: exactly one LEGACY_IMPORTED timeline event is
 *     written, carrying the source id/reference/status.
 *
 * IDEMPOTENCY
 *   `Report.legacyWarrantyReportId` is unique. A second run finds every source
 *   row already mirrored and writes nothing. Deliberately NOT wired into
 *   application boot or into any migration's SQL - it is an explicit operator
 *   action.
 *
 * NOTE ON THIS ENVIRONMENT
 *   The live database held 0 WarrantyReport rows when Task 8 was implemented
 *   (counts recorded in decisions.md I3), so this is a verified no-op here. It
 *   is written, tested, and run anyway because the same code has to be correct
 *   against a populated production database.
 */
import {
  ReportActorType,
  ReportCategory,
  ReportOrigin,
  ReportPriority,
  ReportPrioritySource,
  ReportRoutingState,
  ReportStatus,
  ReportTimelineEventType,
  ReportWarrantyVerdict,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { WARRANTY_RULES_VERSION } from '../warranty/warranty.rules';
import {
  LEGACY_WARRANTY_STATUS_TO_REPORT_STATUS,
  REPORT_CATEGORIES,
  REPORT_SLA_RULES_VERSION,
} from '../reports/report.types';

const BATCH_SIZE = 100;

/**
 * Legacy `WarrantyReport.category` is free text (no enum ever existed for it).
 * Only an exact, case-insensitive match on a canonical enum member is accepted;
 * anything else becomes OTHER rather than being guessed at.
 */
export function mapLegacyCategory(raw: string | null | undefined): ReportCategory {
  const normalized = (raw ?? '').trim().toUpperCase();
  return REPORT_CATEGORIES.find((c) => c === normalized) ?? ReportCategory.OTHER;
}

/** Legacy priority is the 4-value InspectionPriority scale; CRITICAL folds into HIGH. */
export function mapLegacyPriority(raw: string | null | undefined): ReportPriority {
  switch (raw) {
    case 'LOW':
      return ReportPriority.LOW;
    case 'HIGH':
    case 'CRITICAL':
      return ReportPriority.HIGH;
    default:
      return ReportPriority.MEDIUM;
  }
}

export function mapLegacyStatus(raw: string): ReportStatus {
  return LEGACY_WARRANTY_STATUS_TO_REPORT_STATUS[raw] ?? ReportStatus.ROUTING_PENDING;
}

export async function backfillLegacyWarrantyReports(options: { dryRun?: boolean } = {}) {
  const dryRun = !!options.dryRun;
  let scanned = 0;
  let created = 0;
  let skippedAlreadyMirrored = 0;
  let skippedNoOwnership = 0;

  // Cursor pagination over a stable key, not offset pagination: successfully
  // mirrored rows drop out of the `canonicalReport is null` filter as we go,
  // and a skipped row must not be re-read forever. Advancing an id cursor
  // handles both without an infinite loop.
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.warrantyReport.findMany({
      where: { canonicalReport: { is: null } },
      include: { unit: { include: { building: true } } },
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const legacy of batch) {
      scanned += 1;

      // The canonical Report requires a real ownership snapshot (invariant 15).
      // Prefer the ownership that was active for this homeowner on this unit;
      // fall back to any ownership row linking the two. A legacy row with no
      // ownership at all is skipped and reported, never invented around.
      const ownership = await prisma.ownership.findFirst({
        where: { unitId: legacy.unitId, userId: legacy.homeownerId },
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
      });
      if (!ownership) {
        skippedNoOwnership += 1;
        // eslint-disable-next-line no-console
        console.warn(
          `SKIPPED WarrantyReport ${legacy.id} (${legacy.referenceNumber}): no Ownership row links homeowner ${legacy.homeownerId} to unit ${legacy.unitId}`,
        );
        continue;
      }

      if (dryRun) {
        created += 1;
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          const report = await tx.report.create({
            data: {
              homeownerId: legacy.homeownerId,
              ownershipId: ownership.id,
              unitId: legacy.unitId,
              buildingId: legacy.unit.buildingId,
              projectId: legacy.unit.building.projectId,
              category: mapLegacyCategory(legacy.category),
              categoryConfirmedByUser: false,
              problemText: legacy.notes?.trim() || legacy.location || legacy.category,
              homeownerNote: legacy.notes ?? null,
              priority: mapLegacyPriority(legacy.priority),
              prioritySource: ReportPrioritySource.MANUAL_DEFAULT,
              // Honest: no verdict is recomputed for a historical row.
              warrantyVerdict: ReportWarrantyVerdict.NOT_EVALUATED_LEGACY,
              warrantyReasonCode: 'LEGACY_IMPORT_NOT_EVALUATED',
              warrantyCategoryKey: null,
              warrantyRulesVersion: WARRANTY_RULES_VERSION,
              warrantyEvaluatedAt: legacy.createdAt,
              warrantyPeriodStart: null,
              warrantyPeriodEnd: null,
              status: mapLegacyStatus(legacy.status),
              routingState: ReportRoutingState.PENDING,
              routingReasonCode: 'LEGACY_IMPORT',
              // No SLA is retro-applied to a historical row.
              slaStartDueAt: null,
              slaRulesVersion: REPORT_SLA_RULES_VERSION,
              origin: ReportOrigin.LEGACY_WARRANTY_REPORT,
              legacyWarrantyReportId: legacy.id,
              createdAt: legacy.createdAt,
              closedAt: legacy.status === 'CLOSED' ? legacy.updatedAt : null,
            },
          });

          await tx.reportTimelineEvent.create({
            data: {
              reportId: report.id,
              type: ReportTimelineEventType.LEGACY_IMPORTED,
              actorType: ReportActorType.SYSTEM,
              metadata: {
                sourceModel: 'WarrantyReport',
                sourceId: legacy.id,
                sourceReferenceNumber: legacy.referenceNumber,
                sourceStatus: legacy.status,
                sourceCategory: legacy.category,
              },
              createdAt: legacy.createdAt,
            },
          });
        });
        created += 1;
      } catch (err) {
        // A unique-violation here means a concurrent run already mirrored it -
        // exactly the idempotency guarantee working.
        skippedAlreadyMirrored += 1;
        // eslint-disable-next-line no-console
        console.warn(
          `SKIPPED WarrantyReport ${legacy.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return { scanned, created, skippedAlreadyMirrored, skippedNoOwnership, dryRun };
}

/* istanbul ignore next - CLI entrypoint, exercised manually and documented above. */
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  backfillLegacyWarrantyReports({ dryRun })
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(result, null, 2));
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
