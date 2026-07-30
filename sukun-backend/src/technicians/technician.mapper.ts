import { Technician, User } from '@prisma/client';

// Honest delivery-status vocabulary (never claim delivery that didn't
// happen). 'not_configured' is the only value reachable today - no Push/
// Email/SMS provider credentials exist anywhere in this environment
// (config/env.ts, .env.example). 'queued'/'sent'/'failed' are reserved for
// once a real provider is wired (notification.service.ts).
export type InvitationDeliveryStatus = 'not_configured' | 'queued' | 'sent' | 'failed';

export interface TechnicianInvitationInfo {
  expiresAt: Date;
  recipientEmail: string;
  deliveryStatus: InvitationDeliveryStatus;
  // DEV/TEST ONLY - never present when NODE_ENV=production. See
  // technician.service.ts#register: production must never expose the raw
  // token or a token-bearing URL merely because no delivery provider exists.
  invitationPreview?: string;
}

export interface TechnicianDto {
  id: string;
  projectId: string;
  name: string;
  email: string;
  phone: string;
  specialty: string | null;
  status: string;
  assignedRepairsCount: number;
  createdAt: Date;
  // Present only on the register() response - non-secret metadata the
  // authenticated Company that just created this technician may see.
  invitation?: TechnicianInvitationInfo;
}

type TechnicianWithUser = Technician & { user: User; _count?: { repairs: number } };

export function toTechnicianDto(
  entity: TechnicianWithUser,
  invitation?: TechnicianInvitationInfo,
): TechnicianDto {
  return {
    id: entity.id,
    projectId: entity.projectId,
    name: entity.user.name,
    email: entity.user.email,
    phone: entity.user.phone,
    specialty: entity.specialty,
    status: entity.status,
    assignedRepairsCount: entity._count?.repairs ?? 0,
    createdAt: entity.createdAt,
    invitation,
  };
}

// ---------------------------------------------------------------------
// Task 5 (RE5): company-wide technician management DTOs.
// ---------------------------------------------------------------------

/**
 * Task 8 (decisions.md I14): the legacy pre-ownership (`Repair`/
 * `InspectionReport`) numbers, kept visible but explicitly separate so they can
 * never be silently summed with the canonical post-ownership ones.
 */
export interface TechnicianLegacyStatsDto {
  openRepairsCount: number;
  completedRepairsCount: number;
  averageRepairDurationDays: number | null;
}

export interface TechnicianSummaryDto {
  totalTechnicians: number;
  availableCount: number;
  busyCount: number;
  // Task 8 (decisions.md I14/I15): canonical post-ownership numbers. F12's
  // honest-null `averageRating` is finally backed by a real ReportReview model -
  // still null (never 0) when a company has no reviews yet.
  openRepairsCount: number;
  completedRepairsCount: number;
  averageRating: number | null;
  reviewsCount: number;
  averageRepairDurationMinutes: number | null;
  /** @deprecated Task 8 reports duration in minutes; kept for compatibility. */
  averageRepairDurationDays: number | null;
  legacy: TechnicianLegacyStatsDto;
}

export interface TechnicianReviewItemDto {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  homeownerName: string;
  reportId: string;
  reportNumber: number;
  category: string;
}

export interface TechnicianProfileDto extends TechnicianDto {
  projectName: string;
  managerName: string | null;
  // Canonical post-ownership statistics (decisions.md I14).
  openRepairsCount: number;
  completedRepairsCount: number;
  averageRepairDurationMinutes: number | null;
  averageRating: number | null;
  reviewsCount: number;
  legacy: TechnicianLegacyStatsDto;
}

export interface TechnicianReviewsDto {
  items: TechnicianReviewItemDto[];
  averageRating: number | null;
  total: number;
}
