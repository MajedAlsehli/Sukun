/**
 * Visits: Backend DTO -> the view model H5 (`VisitExperienceScreen`) reads.
 *
 *   VisitDetailDto            (lib/backend/visits.ts)
 *     -> VisitViewModel       (this file)
 *     -> unchanged VisitExperienceScreen
 *
 * The frozen screen models a visit as three phases (`active` -> `rating` ->
 * `done`) and a local event log. The Backend models six statuses and three real
 * child collections. Mapping between them happens here, once:
 *
 *   SCHEDULED / CONFIRMED          -> phase "active",  live: false (not started)
 *   CHECKED_IN                     -> phase "active",  live: true  (زيارة جارية)
 *   CHECKED_OUT / COMPLETED        -> phase "rating" unless feedback exists,
 *                                     then "done"
 *   CANCELLED                      -> phase "done", cancelled: true
 *
 * **Visit notes and issues are never reports.** They map into the screen's own
 * timeline events and nothing else; there is no path from this file to
 * `lib/adapters/reports.ts`.
 */

import type {
  VisitDetailDto,
  VisitIssueCategory,
  VisitIssueDto,
  VisitListItemDto,
  VisitNoteDto,
  VisitStatusDto,
  VisitSuitability,
} from "@/lib/backend/visits";

export type VisitPhase = "active" | "rating" | "done";
export type VisitEventType = "start" | "note" | "like" | "issue" | "finish";

export interface VisitEventViewModel {
  type: VisitEventType;
  label: string;
  detail: string;
  /** Minutes since the first event, for the timeline's own clock. */
  min: number;
  /** Signed URL for a private photo, or `null`. */
  photoUrl: string | null;
  createdAt: string;
}

export interface VisitViewModel {
  id: string;
  projectId: string;
  unitId: string;
  projectName: string;
  projectCity: string;
  unitNumber: string;
  date: string;
  time: string;
  status: VisitStatusDto;
  phase: VisitPhase;
  /** `true` only while CHECKED_IN — the one window notes and issues are accepted in. */
  live: boolean;
  cancelled: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canSubmitFeedback: boolean;
  events: VisitEventViewModel[];
  notesCount: number;
  issuesCount: number;
  feedback: { rating: number; comment: string | null; suitability: string | null } | null;
  rescheduleCount: number;
}

/** `visit.types.ts#assertReschedulable` — valid only before check-in. */
export function canReschedule(status: VisitStatusDto): boolean {
  return status === "SCHEDULED" || status === "CONFIRMED";
}

/** The forward transitions table's `-> CANCELLED` edges. */
export function canCancel(status: VisitStatusDto): boolean {
  return status === "SCHEDULED" || status === "CONFIRMED";
}

export function canCheckIn(status: VisitStatusDto): boolean {
  return status === "CONFIRMED";
}

export function canCheckOut(status: VisitStatusDto): boolean {
  return status === "CHECKED_IN";
}

/** `visit.types.ts#assertFeedbackEligible`. */
export function canSubmitFeedback(status: VisitStatusDto, hasFeedback: boolean): boolean {
  if (hasFeedback) return false;
  return status === "CHECKED_OUT" || status === "COMPLETED";
}

/** `visit.types.ts#assertInProgress` — notes/issues are captured only while live. */
export function isLive(status: VisitStatusDto): boolean {
  return status === "CHECKED_IN";
}

export function phaseOf(status: VisitStatusDto, hasFeedback: boolean): VisitPhase {
  if (status === "CANCELLED") return "done";
  if (status === "CHECKED_OUT" || status === "COMPLETED") return hasFeedback ? "done" : "rating";
  return "active";
}

/** The Arabic labels the frozen timeline renders for each real issue category. */
export const ISSUE_CATEGORY_LABELS: Record<VisitIssueCategory, string> = {
  FINISHING: "تشطيب",
  ELECTRICAL: "كهرباء",
  PLUMBING: "سباكة",
  PLAN_MISMATCH: "اختلاف بالمخطط",
  OTHER: "أخرى",
};

/** The inverse — the screen's own five chips map onto the Backend enum. */
export const ISSUE_CATEGORY_VALUES: Record<string, VisitIssueCategory> = {
  تشطيب: "FINISHING",
  كهرباء: "ELECTRICAL",
  سباكة: "PLUMBING",
  "اختلاف بالمخطط": "PLAN_MISMATCH",
  أخرى: "OTHER",
};

export const SUITABILITY_VALUES: Record<string, VisitSuitability> = {
  نعم: "YES",
  "إلى حدٍّ ما": "SOMEWHAT",
  لا: "NO",
};

function noteEvent(note: VisitNoteDto, min: number): VisitEventViewModel {
  return {
    type: "note",
    label: "أضفت ملاحظة",
    detail: note.text?.trim() || "ملاحظة مصوّرة",
    min,
    photoUrl: note.photoUrl,
    createdAt: note.createdAt,
  };
}

function issueEvent(issue: VisitIssueDto, min: number): VisitEventViewModel {
  const label = ISSUE_CATEGORY_LABELS[issue.category as VisitIssueCategory] ?? issue.category;
  return {
    type: "issue",
    label: "أبلغت عن ملاحظة",
    detail: issue.description?.trim() ? `${label} · ${issue.description.trim()}` : label,
    min,
    photoUrl: issue.photoUrl,
    createdAt: issue.createdAt,
  };
}

/**
 * Builds the screen's event log from real rows only. The `start` event is the
 * real `checkedInAt`; `finish` is the real `checkedOutAt`. Neither is synthesized
 * when the corresponding timestamp is absent — an un-started visit has no
 * "started" row.
 */
export function toVisitEvents(dto: VisitDetailDto): VisitEventViewModel[] {
  const events: VisitEventViewModel[] = [];

  if (dto.checkedInAt) {
    events.push({
      type: "start",
      label: "بدأت الزيارة",
      detail: "",
      min: 0,
      photoUrl: null,
      createdAt: dto.checkedInAt,
    });
  }

  const timed = [
    ...dto.notes.map((n) => ({ at: n.createdAt, build: (m: number) => noteEvent(n, m) })),
    ...dto.issues.map((i) => ({ at: i.createdAt, build: (m: number) => issueEvent(i, m) })),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const origin = dto.checkedInAt ? Date.parse(dto.checkedInAt) : Date.parse(dto.createdAt);
  for (const entry of timed) {
    const minutes = Math.max(0, Math.round((Date.parse(entry.at) - origin) / 60000));
    events.push(entry.build(minutes));
  }

  if (dto.checkedOutAt) {
    events.push({
      type: "finish",
      label: "أنهيت الزيارة",
      detail: "",
      min: Math.max(0, Math.round((Date.parse(dto.checkedOutAt) - origin) / 60000)),
      photoUrl: null,
      createdAt: dto.checkedOutAt,
    });
  }

  return events;
}

export function toVisitViewModel(dto: VisitDetailDto): VisitViewModel {
  const hasFeedback = dto.feedback !== null;
  return {
    id: dto.id,
    projectId: dto.projectId,
    unitId: dto.unitId,
    projectName: dto.projectName,
    projectCity: dto.projectCity,
    unitNumber: dto.unitNumber,
    date: dto.date,
    time: dto.time,
    status: dto.status,
    phase: phaseOf(dto.status, hasFeedback),
    live: isLive(dto.status),
    cancelled: dto.status === "CANCELLED",
    canReschedule: canReschedule(dto.status),
    canCancel: canCancel(dto.status),
    canCheckIn: canCheckIn(dto.status),
    canCheckOut: canCheckOut(dto.status),
    canSubmitFeedback: canSubmitFeedback(dto.status, hasFeedback),
    events: toVisitEvents(dto),
    notesCount: dto.notes.length,
    issuesCount: dto.issues.length,
    feedback: dto.feedback
      ? {
          rating: dto.feedback.rating,
          comment: dto.feedback.comment,
          suitability: dto.feedback.suitability,
        }
      : null,
    rescheduleCount: dto.rescheduleCount,
  };
}

export interface VisitListItemViewModel {
  id: string;
  projectId: string;
  projectName: string;
  unitNumber: string;
  date: string;
  time: string;
  status: VisitStatusDto;
  /** The three tabs H3's "زياراتي" renders. */
  bucket: "upcoming" | "completed" | "cancelled";
}

export function toVisitListItemViewModel(dto: VisitListItemDto): VisitListItemViewModel {
  return {
    id: dto.id,
    projectId: dto.projectId,
    projectName: dto.projectName,
    unitNumber: dto.unitNumber,
    date: dto.date,
    time: dto.time,
    status: dto.status,
    bucket:
      dto.status === "CANCELLED"
        ? "cancelled"
        : dto.status === "CHECKED_OUT" || dto.status === "COMPLETED"
          ? "completed"
          : "upcoming",
  };
}
