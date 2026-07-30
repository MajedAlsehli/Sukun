import { VisitIssue, VisitFeedback, VisitNote } from '@prisma/client';
import { VisitEntity } from './visit.types';

export interface VisitDto {
  id: string;
  userId: string;
  projectId: string;
  unitId: string;
  searchJourneyId: string;
  date: Date;
  time: string;
  status: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  rescheduleCount: number;
  lastRescheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function toVisitDto(entity: VisitEntity): VisitDto {
  return {
    id: entity.id,
    userId: entity.userId,
    projectId: entity.projectId,
    unitId: entity.unitId,
    searchJourneyId: entity.searchJourneyId,
    date: entity.date,
    time: entity.time,
    status: entity.status,
    checkedInAt: entity.checkedInAt,
    checkedOutAt: entity.checkedOutAt,
    rescheduleCount: entity.rescheduleCount,
    lastRescheduledAt: entity.lastRescheduledAt,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

// Task 6 (decisions.md G9): H5's list view needs the project/unit's display
// name, not just their ids - denormalized read-only fields, joined once by
// the repository (visit.repository.ts#findAllByUser), never stored on Visit.
export interface VisitListItemDto extends VisitDto {
  projectName: string;
  unitNumber: string;
}

type VisitWithListJoins = VisitEntity & {
  project: { name: string };
  unit: { number: string };
};

export function toVisitListItemDto(entity: VisitWithListJoins): VisitListItemDto {
  return { ...toVisitDto(entity), projectName: entity.project.name, unitNumber: entity.unit.number };
}

export interface VisitNoteDto {
  id: string;
  text: string | null;
  photoUrl: string | null;
  createdAt: Date;
}

export function toVisitNoteDto(entity: VisitNote): VisitNoteDto {
  return { id: entity.id, text: entity.text, photoUrl: entity.photoUrl, createdAt: entity.createdAt };
}

export interface VisitIssueDto {
  id: string;
  category: string;
  description: string | null;
  photoUrl: string | null;
  createdAt: Date;
}

export function toVisitIssueDto(entity: VisitIssue): VisitIssueDto {
  return {
    id: entity.id,
    category: entity.category,
    description: entity.description,
    photoUrl: entity.photoUrl,
    createdAt: entity.createdAt,
  };
}

export interface VisitFeedbackDto {
  id: string;
  rating: number;
  comment: string | null;
  suitability: string | null;
  createdAt: Date;
}

export function toVisitFeedbackDto(entity: VisitFeedback): VisitFeedbackDto {
  return {
    id: entity.id,
    rating: entity.rating,
    comment: entity.comment,
    suitability: entity.suitability,
    createdAt: entity.createdAt,
  };
}

// Task 6 (decisions.md G9/G10/G11): H5's detail screen - base visit +
// display names + real notes/issues/feedback, one shape.
export interface VisitDetailDto extends VisitDto {
  projectName: string;
  projectCity: string;
  unitNumber: string;
  notes: VisitNoteDto[];
  issues: VisitIssueDto[];
  feedback: VisitFeedbackDto | null;
}

type VisitWithDetailJoins = VisitEntity & {
  project: { name: string; city: string };
  unit: { number: string };
  notes: VisitNote[];
  issues: VisitIssue[];
  feedback: VisitFeedback | null;
};

export function toVisitDetailDto(entity: VisitWithDetailJoins): VisitDetailDto {
  return {
    ...toVisitDto(entity),
    projectName: entity.project.name,
    projectCity: entity.project.city,
    unitNumber: entity.unit.number,
    notes: entity.notes.map(toVisitNoteDto),
    issues: entity.issues.map(toVisitIssueDto),
    feedback: entity.feedback ? toVisitFeedbackDto(entity.feedback) : null,
  };
}
