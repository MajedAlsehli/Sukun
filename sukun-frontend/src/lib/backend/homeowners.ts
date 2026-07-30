/**
 * `/api/homeowners/{activate,me}`, typed — H6 activation and H7 My Home.
 *
 * Verified against `sakn-backend/src/homeowners`:
 *   homeowner.routes.ts      — `POST /activate` (rate-limited, unauthenticated)
 *                              and `GET /me` (bearer + HOMEOWNER only)
 *   homeowner.dto.ts         — `activateHomeownerSchema` = { code, password }
 *   homeowner.controller.ts  — activate sets the refresh cookie and returns a
 *                              full session
 *   homeowner.mapper.ts      — MyHomeDto
 *
 * Two things follow from the Backend's own design and are honoured here:
 *
 *  - **Activation returns a real session.** The controller calls
 *    `setRefreshCookie(...)` and answers with the same `SessionResponseDto`
 *    login does, already carrying the promoted `role: "homeowner_active"`.
 *    So the frontend never sets a local "activated" flag in real mode — it
 *    adopts the server's session verbatim (decisions.md A1/D2).
 *  - **`GET /me` is HOMEOWNER-only.** A `homeowner_prospect` or
 *    `homeowner_pending` principal gets `403 ACCESS_DENIED`, and a promoted
 *    homeowner with no active ownership gets a `404`. Both are real states the
 *    screen must render honestly, never a fixture.
 */

import { apiClient } from "./client";
import type { SessionResponseDto } from "./auth";
import type { RequestScope } from "./discovery";

export interface ActivateHomeownerRequest {
  code: string;
  /**
   * Required by `activateHomeownerSchema` — activation is also the moment the
   * customer sets their password (Decision 013). There is no separate
   * set-password endpoint, and the Backend rejects a body without it.
   */
  password: string;
}

/** `homeowner.mapper.ts#MyHomeReportsSummaryDto` */
export interface MyHomeReportsSummaryDto {
  available: boolean;
  openCount: number;
  boundary: "PENDING_TASK_8" | "ACTIVE";
}

/** `homeowner.mapper.ts#MyHomeWarrantySummaryDto` */
export interface MyHomeWarrantySummaryDto {
  isActive: boolean;
  endDate: string;
  daysRemaining: number | null;
}

/** `homeowner.mapper.ts#MyHomeDto` */
export interface MyHomeDto {
  ownershipId: string;
  /** @deprecated identical to `handoverDate`; kept because the DTO still carries it. */
  startDate: string;
  /** The authoritative handover/move-in moment (decisions.md H1). */
  handoverDate: string;
  unit: {
    id: string;
    number: string;
    floor: number;
    type: string;
    status: string;
    area: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    parkingSpots: number | null;
  };
  building: { id: string; name: string; number: string };
  project: { id: string; name: string; city: string; developerName: string };
  /** Real cover media only — `url: null` means "no image", never a stand-in photo. */
  coverImage: { url: string | null; isPlaceholder: boolean };
  warranty: MyHomeWarrantySummaryDto | null;
  reportsSummary: MyHomeReportsSummaryDto;
}

export const backendHomeowners = {
  /**
   * `POST /api/homeowners/activate`.
   *
   * `skipAuthRefresh` is set deliberately: this route is behind the auth rate
   * limiter and is reachable without a session, so a 401 from it is a direct,
   * expected outcome and must not be mistaken for "your live session died"
   * (which would fire the client's shared refresh + session-expired hook).
   */
  activate(body: ActivateHomeownerRequest, scope: RequestScope = {}): Promise<SessionResponseDto> {
    return apiClient.post<SessionResponseDto>("/homeowners/activate", body, {
      signal: scope.signal,
      skipAuthRefresh: true,
    });
  },

  /** `GET /api/homeowners/me` — the active ownership, its unit, project, warranty and report counts. */
  getMyHome(scope: RequestScope = {}): Promise<MyHomeDto> {
    return apiClient.get<MyHomeDto>("/homeowners/me", { signal: scope.signal });
  },
};
