import { VisitIssueCategory, VisitSuitability } from '@prisma/client';
import { visitRepository } from './visit.repository';
import {
  toVisitDetailDto,
  toVisitDto,
  toVisitFeedbackDto,
  toVisitIssueDto,
  toVisitListItemDto,
  toVisitNoteDto,
} from './visit.mapper';
import {
  assertFeedbackEligible,
  assertInProgress,
  assertReschedulable,
  assertValidTransition,
  isReadOnly,
  VisitStatus,
} from './visit.types';
import { unitRepository } from '../units/unit.repository';
import { buildingRepository } from '../buildings/building.repository';
import { projectRepository } from '../projects/project.repository';
import { isOperationallyActive } from '../projects/project.types';
import { searchJourneyRepository } from '../search-journeys/search-journey.repository';
import { searchJourneyService } from '../search-journeys/search-journey.service';
import { PRE_VISITING_STATUSES, SearchJourneyStatus } from '../search-journeys/search-journey.types';
import { UnitStatus } from '../units/unit.types';
import { notificationService } from '../notifications/notification.service';
import { BusinessError, NotFoundError, ValidationError } from '../shared/errors';
import { writeAuditLog } from '../shared/audit.service';
import crypto from 'crypto';
import { visitMediaStorage, extensionForMimeType } from './visit-media-storage';
import { decodeAndValidateImage } from '../reports/report-media-storage';
import {
  CreateVisitDto,
  CreateVisitFeedbackDto,
  CreateVisitIssueDto,
  CreateVisitNoteDto,
  PhotoUploadDto,
  RescheduleVisitDto,
} from './visit.dto';

interface RequestContext {
  ipAddress: string | null;
}

function requireOwnVisit(visit: { userId: string } | null, requesterId: string) {
  if (!visit) {
    throw new NotFoundError('Visit not found', 'VISIT_NOT_FOUND');
  }
  if (visit.userId !== requesterId) {
    // 14_Permissions_Matrix.md: "View Visit: Owner Only" - hide existence from non-owners.
    throw new NotFoundError('Visit not found', 'VISIT_NOT_FOUND');
  }
}

export const visitService = {
  // POST /api/visits - Flow 3 (Property Visit Booking)
  async create(dto: CreateVisitDto, requesterId: string, ctx: RequestContext) {
    const unit = await unitRepository.findById(dto.unitId);
    if (!unit) {
      throw new NotFoundError('Unit not found', 'UNIT_NOT_FOUND');
    }

    const building = await buildingRepository.findById(unit.buildingId);
    if (!building || building.projectId !== dto.projectId) {
      throw new BusinessError('Unit does not belong to the given project', 'UNIT_PROJECT_MISMATCH');
    }

    if (unit.status !== UnitStatus.AVAILABLE) {
      throw new BusinessError('Unit is not available for visits', 'UNIT_NOT_AVAILABLE');
    }

    // Task 6 (decisions.md G2): booking requires a real, currently-
    // discoverable project - reuses the same status/isActive/company-status
    // rule Discovery itself uses, so a project hidden from Discovery can
    // never be newly booked either.
    const projectFields = await projectRepository.findDiscoverabilityFields(dto.projectId);
    if (
      !projectFields ||
      !isOperationallyActive(projectFields.status, projectFields.isActive) ||
      projectFields.company.status !== 'ACTIVE'
    ) {
      throw new BusinessError('This project is not currently available for visits', 'PROJECT_NOT_DISCOVERABLE');
    }

    const conflict = await visitRepository.findConflicting(dto.unitId, dto.date, dto.time);
    if (conflict) {
      throw new BusinessError('This unit is already booked for that date and time', 'VISIT_SLOT_ALREADY_BOOKED');
    }

    const journey = await searchJourneyRepository.findActiveByUserId(requesterId);
    if (!journey) {
      throw new BusinessError('No active search journey found', 'NO_ACTIVE_SEARCH_JOURNEY');
    }

    const visit = await visitRepository.create({
      userId: requesterId,
      projectId: dto.projectId,
      unitId: dto.unitId,
      searchJourneyId: journey.id,
      date: dto.date,
      time: dto.time,
    });

    // First visit in this journey advances it; later ones are no-ops here (VIS-007).
    if (PRE_VISITING_STATUSES.includes(journey.status)) {
      await searchJourneyService.advanceStatus(journey.id, SearchJourneyStatus.VISITING, ctx);
    }

    await writeAuditLog({
      userId: requesterId,
      action: 'VISIT_BOOKED',
      entity: 'Visit',
      entityId: visit.id,
      ipAddress: ctx.ipAddress,
    });

    // NOT-001: visit booking sends a notification.
    await notificationService.send(
      requesterId,
      'Visit booked',
      `Your visit for ${dto.date.toDateString()} at ${dto.time} has been booked.`,
    );

    return toVisitDto(visit);
  },

  async list(requesterId: string) {
    const visits = await visitRepository.findAllByUser(requesterId);
    return visits.map(toVisitListItemDto);
  },

  async getById(visitId: string, requesterId: string) {
    const visit = await visitRepository.findByIdWithDetails(visitId);
    requireOwnVisit(visit, requesterId);
    return toVisitDetailDto(visit!);
  },

  // POST /api/visits/{id}/checkin
  async checkIn(visitId: string, requesterId: string, ctx: RequestContext) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertValidTransition(visit!.status, VisitStatus.CHECKED_IN);

    const updated = await visitRepository.updateStatus(visitId, VisitStatus.CHECKED_IN, {
      checkedInAt: new Date(),
    });

    await writeAuditLog({
      userId: requesterId,
      action: 'VISIT_CHECKED_IN',
      entity: 'Visit',
      entityId: visitId,
      ipAddress: ctx.ipAddress,
    });

    return toVisitDto(updated);
  },

  // POST /api/visits/{id}/checkout - VIS-009: check-in must precede check-out
  // (enforced by the state machine: only CHECKED_IN -> CHECKED_OUT is valid).
  async checkOut(visitId: string, requesterId: string, ctx: RequestContext) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertValidTransition(visit!.status, VisitStatus.CHECKED_OUT);

    const updated = await visitRepository.updateStatus(visitId, VisitStatus.CHECKED_OUT, {
      checkedOutAt: new Date(),
    });

    await writeAuditLog({
      userId: requesterId,
      action: 'VISIT_CHECKED_OUT',
      entity: 'Visit',
      entityId: visitId,
      ipAddress: ctx.ipAddress,
    });

    return toVisitDto(updated);
  },

  async cancel(visitId: string, requesterId: string, ctx: RequestContext) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);

    if (isReadOnly(visit!.status)) {
      throw new BusinessError('This visit can no longer be cancelled', 'VISIT_READ_ONLY');
    }
    assertValidTransition(visit!.status, VisitStatus.CANCELLED);

    const updated = await visitRepository.updateStatus(visitId, VisitStatus.CANCELLED);

    await writeAuditLog({
      userId: requesterId,
      action: 'VISIT_CANCELLED',
      entity: 'Visit',
      entityId: visitId,
      ipAddress: ctx.ipAddress,
    });

    return toVisitDto(updated);
  },

  // PATCH /api/visits/{id} - reschedule (decisions.md G9). Confirm/cancel
  // keep their existing dedicated endpoints - see decisions.md G9.
  async reschedule(visitId: string, dto: RescheduleVisitDto, requesterId: string, ctx: RequestContext) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertReschedulable(visit!.status);

    const conflict = await visitRepository.findConflicting(visit!.unitId, dto.date, dto.time, visitId);
    if (conflict) {
      throw new BusinessError('This unit is already booked for that date and time', 'VISIT_SLOT_ALREADY_BOOKED');
    }

    const updated = await visitRepository.reschedule(visitId, dto.date, dto.time);

    await writeAuditLog({
      userId: requesterId,
      action: 'VISIT_RESCHEDULED',
      entity: 'Visit',
      entityId: visitId,
      ipAddress: ctx.ipAddress,
      metadata: {
        previousDate: visit!.date.toISOString(),
        previousTime: visit!.time,
        newDate: dto.date.toISOString(),
        newTime: dto.time,
      },
    });

    return toVisitDto(updated);
  },

  // POST /api/visits/{id}/notes (decisions.md G10) - visit+user-scoped only,
  // structurally incapable of becoming a report (A9).
  async addNote(visitId: string, dto: CreateVisitNoteDto, requesterId: string) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertInProgress(visit!.status);

    const photo = await uploadOptionalPhoto(visitId, 'notes', dto.photo);

    const note = await visitRepository.createNote({
      visitId,
      userId: requesterId,
      text: dto.text,
      photoUrl: photo.url ?? undefined,
      photoStorageKey: photo.storageKey ?? undefined,
    });

    return toVisitNoteDto(note);
  },

  // POST /api/visits/{id}/issues (decisions.md G10)
  async addIssue(visitId: string, dto: CreateVisitIssueDto, requesterId: string) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertInProgress(visit!.status);

    const photo = await uploadOptionalPhoto(visitId, 'issues', dto.photo);

    const issue = await visitRepository.createIssue({
      visitId,
      userId: requesterId,
      category: dto.category as VisitIssueCategory,
      description: dto.description,
      photoUrl: photo.url ?? undefined,
      photoStorageKey: photo.storageKey ?? undefined,
    });

    return toVisitIssueDto(issue);
  },

  // POST /api/visits/{id}/feedback (decisions.md G11) - one real row per
  // visit; friendly pre-check ahead of the real @@unique([visitId]) constraint.
  async submitFeedback(visitId: string, dto: CreateVisitFeedbackDto, requesterId: string) {
    const visit = await visitRepository.findById(visitId);
    requireOwnVisit(visit, requesterId);
    assertFeedbackEligible(visit!.status);

    const existing = await visitRepository.findFeedbackByVisitId(visitId);
    if (existing) {
      throw new BusinessError('Feedback has already been submitted for this visit', 'FEEDBACK_ALREADY_SUBMITTED');
    }

    const feedback = await visitRepository.createFeedback({
      visitId,
      userId: requesterId,
      rating: dto.rating,
      comment: dto.comment,
      suitability: dto.suitability as VisitSuitability | undefined,
    });

    return toVisitFeedbackDto(feedback);
  },
};

// Task 6 (decisions.md G12): photo is optional on both notes/issues - a
// text-only note/issue must succeed regardless of storage configuration;
// only an actually-requested photo upload can fail with
// MEDIA_STORAGE_NOT_CONFIGURED, never a silently-dropped/fake URL.
//
// Task 10 hardening (decisions.md K3), three real gaps closed here:
//
//   1. NO CONTENT VALIDATION. This accepted any base64 blob with any declared
//      mimeType - a renamed executable went straight into the bucket. It now
//      goes through the SAME `decodeAndValidateImage` the canonical report
//      media path uses (MIME whitelist + magic-number check + 8 MB cap),
//      reused rather than reimplemented.
//   2. COLLIDING KEYS. The key was `visits/{id}/{kind}/{Date.now()}.{ext}` -
//      two photos in the same millisecond overwrote each other. Now a uuid.
//   3. PUBLIC OBJECT. The photo landed in the public bucket, so anyone with
//      the URL could read someone else's property photo. It is now a private
//      object, returned as a short-lived signed URL.
async function uploadOptionalPhoto(
  visitId: string,
  kind: 'notes' | 'issues',
  photo: PhotoUploadDto | undefined,
): Promise<{ url: string | null; storageKey: string | null }> {
  if (!photo) return { url: null, storageKey: null };

  const { buffer, mimeType } = decodeAndValidateImage(photo);

  const key = `visits/${visitId}/${kind}/${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`;
  const { storageKey } = await visitMediaStorage.upload(key, buffer, mimeType);

  // The object is private: hand back a freshly-signed URL for the response the
  // uploader is about to receive. It expires; the key does not.
  const signed = await visitMediaStorage.signedUrls([storageKey]).catch(() => new Map<string, string>());
  return { url: signed.get(storageKey) ?? null, storageKey };
}
