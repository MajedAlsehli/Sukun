/** `backend/src/units` (Task 005, running) — RE3's unit grid (reads only). */
import { authorizedRequest } from "@/lib/api";

export type UnitStatus = "available" | "reserved" | "delivered" | "occupied";

export interface PublicUnit {
  id: string;
  buildingId: string;
  number: string;
  floor: number;
  type: string;
  area: number;
  beds: number;
  baths: number;
  parking: number;
  status: UnitStatus;
  createdAt: string;
  updatedAt: string;
}

/** `GET /projects/{id}/units?buildingId&q&occupancy` — AF-013's 3-group UI filter ('reserved' also matches 'delivered' server-side). */
export function listProjectUnits(
  projectId: string,
  filter?: { buildingId?: string; q?: string; occupancy?: "available" | "occupied" | "reserved" },
): Promise<PublicUnit[]> {
  const params = new URLSearchParams();
  if (filter?.buildingId) params.set("buildingId", filter.buildingId);
  if (filter?.q) params.set("q", filter.q);
  if (filter?.occupancy) params.set("occupancy", filter.occupancy);
  const qs = params.toString();
  return authorizedRequest<PublicUnit[]>("GET", `/projects/${projectId}/units${qs ? `?${qs}` : ""}`);
}
