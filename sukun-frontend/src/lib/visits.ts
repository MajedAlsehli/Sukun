/** `backend/src/visits` (Task 006, running) — booking/confirm/cancel/checkin/checkout. */
import { authorizedRequest } from "@/lib/api";

export type VisitStatus = "scheduled" | "confirmed" | "checked_in" | "checked_out" | "completed" | "cancelled";

export interface PublicVisit {
  id: string;
  userId: string;
  unitId: string;
  date: string;
  time: string;
  status: VisitStatus;
  createdAt: string;
  updatedAt: string;
}

/** `GET /visits` — the caller's own visits only, no filters (09_API_Mapping.md §2). */
export function listVisits(): Promise<PublicVisit[]> {
  return authorizedRequest<PublicVisit[]>("GET", "/visits");
}

/** `POST /visits` — VIS-001/002/008 enforced server-side. */
export function bookVisit(input: { unitId: string; date: string; time: string }): Promise<PublicVisit> {
  return authorizedRequest<PublicVisit>("POST", "/visits", input);
}

export function getVisit(id: string): Promise<PublicVisit> {
  return authorizedRequest<PublicVisit>("GET", `/visits/${id}`);
}

/** `PATCH /visits/{id}` — confirm/cancel only (ED-026); reschedule is out of scope. */
export function updateVisitStatus(id: string, status: "confirmed" | "cancelled"): Promise<PublicVisit> {
  return authorizedRequest<PublicVisit>("PATCH", `/visits/${id}`, { status });
}

export function checkinVisit(id: string): Promise<PublicVisit> {
  return authorizedRequest<PublicVisit>("POST", `/visits/${id}/checkin`);
}

/** Lands the visit directly on `completed` (ED-023) — no resting `checked_out` value. */
export function checkoutVisit(id: string): Promise<PublicVisit> {
  return authorizedRequest<PublicVisit>("POST", `/visits/${id}/checkout`);
}
