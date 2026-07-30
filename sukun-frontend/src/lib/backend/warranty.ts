/**
 * `GET /api/warranty?unitId=`, typed — H10's Warranty Centre.
 *
 * Verified against `sakn-backend/src/warranty`:
 *   warranty.routes.ts  — one GET, `authMiddleware + requireRole(HOMEOWNER)`,
 *                         `unitId` is a REQUIRED query parameter
 *   warranty.mapper.ts  — WarrantyDto
 *   warranty.rules.ts   — WARRANTY_CATEGORY_RULES + computeAllCategoryStates
 *
 * **Every duration and every verdict on this screen is server-computed.** The
 * six categories, their durations, their period end dates, their remaining days
 * and their reason codes all arrive in `categories[]`, evaluated against server
 * time from `Warranty.startDate`. This frontend formats them; it does not
 * recompute, re-derive or second-guess them, and it carries no duration table
 * of its own for real mode.
 */

import { apiClient } from "./client";
import type { RequestScope } from "./discovery";

/** `warranty.rules.ts#WarrantyCategoryKey` — the six the reference screen models. */
export type WarrantyCategoryKey =
  | "STRUCTURE"
  | "PLUMBING"
  | "ELECTRICAL"
  | "DOORS_WINDOWS"
  | "PAINT_FINISHING"
  | "MISUSE_EXCLUSION";

/** `warranty.rules.ts#WarrantyReasonCode` */
export type WarrantyReasonCode = "ACTIVE" | "EXPIRED" | "EXCLUDED" | "NOT_CONFIGURED";

/** `warranty.rules.ts#WarrantyCategoryState` */
export interface WarrantyCategoryStateDto {
  key: WarrantyCategoryKey;
  /** `null` = no duration applies (always-excluded, or genuinely unconfigured). */
  durationMonths: number | null;
  excludedAlways: boolean;
  covered: boolean;
  periodEndDate: string | null;
  daysRemaining: number | null;
  reasonCode: WarrantyReasonCode;
}

/** `warranty.mapper.ts#WarrantyDto` */
export interface WarrantyDto {
  id: string;
  unitId: string;
  startDate: string;
  endDate: string;
  coverage: string;
  isActive: boolean;
  daysRemaining: number | null;
  /** Bumped whenever a duration changes, so a stale render is detectable. */
  rulesVersion: string;
  categories: WarrantyCategoryStateDto[];
}

export const backendWarranty = {
  /**
   * `GET /api/warranty?unitId=`.
   *
   * `unitId` comes from `GET /api/homeowners/me`'s `unit.id` — the caller's own
   * active ownership — never from a client-chosen value. The Backend re-checks
   * ownership regardless and 404s a unit that is not the principal's.
   */
  getByUnit(unitId: string, scope: RequestScope = {}): Promise<WarrantyDto> {
    return apiClient.get<WarrantyDto>("/warranty", {
      query: { unitId },
      signal: scope.signal,
    });
  },
};
