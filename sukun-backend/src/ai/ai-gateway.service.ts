import { randomUUID } from 'crypto';
import { InspectionPriority, InspectionReportStatus, RepairStatus, WarrantyReportStatus } from '@prisma/client';
import { inspectionReportRepository } from '../inspection-reports/inspection-report.repository';
import { repairRepository } from '../repairs/repair.repository';
import { warrantyRepository } from '../warranty/warranty.repository';
import { aiResultRepository } from './ai-result.repository';
import { runDetectionLayer } from './layers/detection.layer';
import { runClassificationLayer, CLASSIFICATION_MODEL } from './layers/classification.layer';
import { runRepairSuggestionLayer } from './layers/repair-suggestion.layer';
import { runRepairValidationLayer } from './layers/repair-validation.layer';
import { AIUnavailableError, clampConfidence } from './ai-gateway.types';
import { writeAuditLog } from '../shared/audit.service';
import { logger } from '../shared/logger';

// INS-032/033/034/035, AI-012/013/014
const MAX_ATTEMPTS = 5;
const RETRY_INTERVAL_MS = 30_000;
const TIMEOUT_MS = 60_000;
const LOW_CONFIDENCE_THRESHOLD = 50; // AI-012

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('AI request timed out')), ms);
  });
  // Whichever side settles first, clear the timer so it never outlives this call.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function recordManualReview(
  reportId: string,
  requestId: string,
  reason: string,
  processingTimeMs: number,
  attempt: number,
  extra?: Record<string, unknown>,
): Promise<void> {
  // INS-025: if AI cannot identify the defect, Status = WAITING_MANUAL_REVIEW.
  // AI-005: every AI response (including this "gave up" outcome) is logged.
  await aiResultRepository.create({
    type: 'INSPECTION',
    inspectionReportId: reportId,
    requestId,
    model: 'n/a',
    version: 'n/a',
    confidence: 0,
    prediction: 'MANUAL_REVIEW_REQUIRED',
    processingTimeMs,
    metadata: { reason, attempt, ...extra },
  });

  await inspectionReportRepository.updateAfterAnalysis(reportId, {
    status: InspectionReportStatus.WAITING_MANUAL_REVIEW,
  });

  await writeAuditLog({
    userId: null,
    action: 'AI_ANALYSIS_MANUAL_REVIEW',
    entity: 'InspectionReport',
    entityId: reportId,
    ipAddress: null,
    metadata: { requestId, reason, attempt },
  });
}

// Fire-and-forget background job (see ai-gateway.port.ts) - no persistent
// queue backend is configured (pg-boss needs a real DATABASE_URL we don't
// have yet), so retries/timeouts are enforced in-process rather than via a
// durable job scheduler. Documented limitation - see Task 008 report.
export async function analyzeInspectionReport(reportId: string): Promise<void> {
  const report = await inspectionReportRepository.findById(reportId);
  if (!report || report.status !== InspectionReportStatus.AI_PROCESSING) {
    return; // Idempotency guard: already processed, or moved on some other way.
  }

  const imageUrls = report.images.map((img) => img.file.url);
  const context = { location: report.location, notes: report.notes ?? undefined };
  const requestId = randomUUID();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const detection = await withTimeout(runDetectionLayer(imageUrls), TIMEOUT_MS);

      if (detection === null) {
        // Permanent condition (service not configured) - not worth retrying.
        await recordManualReview(
          report.id,
          requestId,
          'DETECTION_SERVICE_NOT_CONFIGURED',
          Date.now() - startedAt,
          attempt,
        );
        return;
      }

      const classification = await withTimeout(
        runClassificationLayer(detection.detections, context),
        TIMEOUT_MS,
      );
      const repairSuggestion = await withTimeout(
        runRepairSuggestionLayer(classification, detection.detections, context),
        TIMEOUT_MS,
      );

      const processingTimeMs = Date.now() - startedAt;
      const confidence = clampConfidence(repairSuggestion.confidence);

      if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        await recordManualReview(report.id, requestId, 'LOW_CONFIDENCE', processingTimeMs, attempt, {
          modelVersion: detection.modelVersion,
          classification,
          repairSuggestion,
        });
        return;
      }

      await aiResultRepository.create({
        type: 'INSPECTION',
        inspectionReportId: report.id,
        requestId,
        model: CLASSIFICATION_MODEL,
        version: detection.modelVersion,
        confidence,
        prediction: classification.defectType,
        priority: classification.priority as InspectionPriority,
        suggestedRepair: repairSuggestion.suggestedRepair,
        processingTimeMs,
        metadata: { description: repairSuggestion.description, attempt },
      });

      await inspectionReportRepository.updateAfterAnalysis(report.id, {
        status: InspectionReportStatus.ASSIGNED,
        priority: classification.priority as InspectionPriority,
      });

      await writeAuditLog({
        userId: null,
        action: 'AI_ANALYSIS_COMPLETED',
        entity: 'InspectionReport',
        entityId: report.id,
        ipAddress: null,
        metadata: { requestId, attempt },
      });
      return;
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        // Permanent (no API key configured) - retrying achieves nothing.
        await recordManualReview(
          report.id,
          requestId,
          'AI_UNAVAILABLE',
          Date.now() - startedAt,
          attempt,
        );
        return;
      }

      logger.warn('AI Gateway attempt failed', {
        reportId: report.id,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      // INS-036: every retry creates an audit log.
      await writeAuditLog({
        userId: null,
        action: 'AI_ANALYSIS_RETRY',
        entity: 'InspectionReport',
        entityId: report.id,
        ipAddress: null,
        metadata: { requestId, attempt, error: err instanceof Error ? err.message : String(err) },
      });

      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_INTERVAL_MS);
      } else {
        // INS-007/state machine: after max attempts, fall back to manual review.
        await recordManualReview(report.id, requestId, 'MAX_RETRIES_EXCEEDED', 0, attempt);
      }
    }
  }
}

// REP-006/007/021: repair validation compares Before/After images. Unlike
// Inspection analysis, AI here is purely informational (AI-002: "AI never
// approves") - the repair always proceeds to WAITING_CUSTOMER_APPROVAL
// regardless of what the AI concludes; only the recorded AIResult varies.
// REP-023's "manager review" for low scores is satisfied by that AIResult
// being visible later (PM Dashboard, Task 015), not by blocking the flow.
export async function validateRepair(repairId: string): Promise<void> {
  const repair = await repairRepository.findById(repairId);
  if (!repair || repair.status !== RepairStatus.WAITING_VALIDATION) {
    return; // Idempotency guard.
  }

  const before = repair.images.find((img) => img.type === 'BEFORE')?.file;
  const after = repair.images.find((img) => img.type === 'AFTER')?.file;
  const requestId = randomUUID();

  const proceedToApproval = async (
    prediction: string,
    confidence: number,
    metadata: Record<string, unknown>,
    processingTimeMs: number,
  ) => {
    await aiResultRepository.create({
      type: 'REPAIR_VALIDATION',
      repairId,
      requestId,
      model: 'gpt-4o-mini',
      version: 'n/a',
      confidence,
      prediction,
      processingTimeMs,
      metadata,
    });
    await repairRepository.updateStatus(repairId, RepairStatus.WAITING_CUSTOMER_APPROVAL);
    await writeAuditLog({
      userId: null,
      action: 'REPAIR_VALIDATION_COMPLETED',
      entity: 'Repair',
      entityId: repairId,
      ipAddress: null,
      metadata: { requestId, prediction, confidence },
    });
  };

  if (!before || !after) {
    // Shouldn't happen - repair.service.ts requires both before calling this.
    await proceedToApproval('MISSING_IMAGES', 0, { reason: 'before/after image missing' }, 0);
    return;
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const result = await withTimeout(
        runRepairValidationLayer(before, after, {}),
        TIMEOUT_MS,
      );
      await proceedToApproval(
        result.isResolved ? 'RESOLVED' : 'NOT_RESOLVED',
        clampConfidence(result.confidence),
        { notes: result.notes, attempt },
        Date.now() - startedAt,
      );
      return;
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        await proceedToApproval('AI_UNAVAILABLE', 0, { attempt }, Date.now() - startedAt);
        return;
      }

      logger.warn('Repair validation attempt failed', {
        repairId,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_INTERVAL_MS);
      } else {
        await proceedToApproval('MAX_RETRIES_EXCEEDED', 0, { attempt }, 0);
      }
    }
  }
}

// WAR-009: warranty validation (AI analysis) precedes technician assignment.
// Mirrors analyzeInspectionReport's pipeline/retry shape - same Detection ->
// Classification -> Repair Suggestion layers apply identically to a
// post-ownership warranty defect as to a pre-ownership inspection one.
export async function analyzeWarrantyReport(warrantyReportId: string): Promise<void> {
  const report = await warrantyRepository.findReportById(warrantyReportId);
  if (!report || report.status !== WarrantyReportStatus.AI_ANALYSIS) {
    return; // Idempotency guard.
  }

  const imageUrls = report.images.map((img) => img.file.url);
  const context = { location: report.location, notes: report.notes ?? undefined };
  const requestId = randomUUID();

  const recordManualReviewForWarranty = async (
    reason: string,
    processingTimeMs: number,
    attempt: number,
    extra?: Record<string, unknown>,
  ) => {
    await aiResultRepository.create({
      type: 'WARRANTY',
      warrantyReportId: report.id,
      requestId,
      model: 'n/a',
      version: 'n/a',
      confidence: 0,
      prediction: 'MANUAL_REVIEW_REQUIRED',
      processingTimeMs,
      metadata: { reason, attempt, ...extra },
    });
    await warrantyRepository.updateReportAfterAnalysis(report.id, {
      status: WarrantyReportStatus.WAITING_MANUAL_REVIEW,
    });
    await writeAuditLog({
      userId: null,
      action: 'WARRANTY_ANALYSIS_MANUAL_REVIEW',
      entity: 'WarrantyReport',
      entityId: report.id,
      ipAddress: null,
      metadata: { requestId, reason, attempt },
    });
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const startedAt = Date.now();
    try {
      const detection = await withTimeout(runDetectionLayer(imageUrls), TIMEOUT_MS);

      if (detection === null) {
        await recordManualReviewForWarranty(
          'DETECTION_SERVICE_NOT_CONFIGURED',
          Date.now() - startedAt,
          attempt,
        );
        return;
      }

      const classification = await withTimeout(
        runClassificationLayer(detection.detections, context),
        TIMEOUT_MS,
      );
      const repairSuggestion = await withTimeout(
        runRepairSuggestionLayer(classification, detection.detections, context),
        TIMEOUT_MS,
      );

      const processingTimeMs = Date.now() - startedAt;
      const confidence = clampConfidence(repairSuggestion.confidence);

      if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        await recordManualReviewForWarranty('LOW_CONFIDENCE', processingTimeMs, attempt, {
          modelVersion: detection.modelVersion,
          classification,
          repairSuggestion,
        });
        return;
      }

      await aiResultRepository.create({
        type: 'WARRANTY',
        warrantyReportId: report.id,
        requestId,
        model: CLASSIFICATION_MODEL,
        version: detection.modelVersion,
        confidence,
        prediction: classification.defectType,
        priority: classification.priority as InspectionPriority,
        suggestedRepair: repairSuggestion.suggestedRepair,
        processingTimeMs,
        metadata: { description: repairSuggestion.description, attempt },
      });

      await warrantyRepository.updateReportAfterAnalysis(report.id, {
        status: WarrantyReportStatus.ASSIGNED,
        priority: classification.priority,
      });

      await writeAuditLog({
        userId: null,
        action: 'WARRANTY_ANALYSIS_COMPLETED',
        entity: 'WarrantyReport',
        entityId: report.id,
        ipAddress: null,
        metadata: { requestId, attempt },
      });
      return;
    } catch (err) {
      if (err instanceof AIUnavailableError) {
        await recordManualReviewForWarranty('AI_UNAVAILABLE', Date.now() - startedAt, attempt);
        return;
      }

      logger.warn('Warranty analysis attempt failed', {
        warrantyReportId: report.id,
        attempt,
        error: err instanceof Error ? err.message : String(err),
      });

      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_INTERVAL_MS);
      } else {
        await recordManualReviewForWarranty('MAX_RETRIES_EXCEEDED', 0, attempt);
      }
    }
  }
}
