/** `backend/src/buildings` (Task 004, running) — RE3's building inline-edit. */
import { authorizedRequest } from "@/lib/api";
import type { PublicBuildingSummary } from "@/lib/projects";

export interface UpdateBuildingInput {
  name?: string;
  number?: string;
  floors?: number;
}

export function updateBuilding(id: string, input: UpdateBuildingInput): Promise<PublicBuildingSummary> {
  return authorizedRequest<PublicBuildingSummary>("PATCH", `/buildings/${id}`, input);
}
