/**
 * Placeholders for the Backend domains Tasks 2 and 3 will wire.
 *
 * Task 1 deliberately implements **no domain data**. What is declared here is
 * only the shape of the boundary each later task must fill in, so the two tasks
 * inherit a decided structure instead of inventing one per screen:
 *
 *     Backend DTO  ->  lib/backend/<domain>.ts   (typed request/response, one
 *                                                 function per real endpoint)
 *        ->          lib/adapters/<domain>.ts    (DTO -> view model, all field
 *                                                 renames and null-handling)
 *        ->          lib/hooks/use<Domain>.ts    (loading / empty / error state,
 *                                                 abort, cache invalidation)
 *        ->          unchanged visual component
 *
 * Every endpoint listed below was verified to exist in `sakn-backend/src` and in
 * `docs/integration/integration-matrix.md`. None of them is called yet.
 *
 * **Real mode has no fixture fallback.** A domain module added here must never
 * route through `lib/demo/mockFetch.ts#withDemoFallback` when
 * `NEXT_PUBLIC_DEMO_MODE` is not `"true"`: loading is loading, empty is empty,
 * an error renders the screen's existing error presentation.
 */

/** Task 2 — home seeker (H3/H4/H5) and homeowner (H6/H7/H8/H9/H10) journeys. */
export const TASK_2_DOMAINS = {
  discovery: [
    "GET /discovery/projects",
    "GET /discovery/projects/{id}",
    "GET /discovery/recommendations",
    "POST /discovery/saved/{projectId}",
    "DELETE /discovery/saved/{projectId}",
  ],
  visits: [
    "GET /visits",
    "POST /visits",
    "GET /visits/{id}",
    "PATCH /visits/{id}",
    "POST /visits/{id}/checkin",
    "POST /visits/{id}/checkout",
    "POST /visits/{id}/cancel",
    "POST /visits/{id}/notes",
    "POST /visits/{id}/issues",
    "POST /visits/{id}/feedback",
  ],
  homeowner: ["POST /homeowners/activate", "GET /homeowners/me"],
  warranty: ["GET /warranty?unitId="],
  reports: [
    "POST /reports/media",
    "POST /reports/analyze",
    "POST /reports/warranty-check",
    "POST /reports",
    "GET /reports",
    "GET /reports/{id}",
    "GET /reports/{id}/timeline",
    "POST /reports/{id}/approve",
    "POST /reports/{id}/reopen",
    "GET /reports/providers",
  ],
} as const;

/** Task 3 — Company (RE1–RE5), project manager (PM1–PM3) and technician (C1–C3) journeys. */
export const TASK_3_DOMAINS = {
  company: ["GET /company/overview", "GET /company/projects/summary", "GET /company/activity"],
  projects: [
    "GET /projects",
    "GET /projects/{id}",
    "POST /projects",
    "PATCH /projects/{id}",
    "PATCH /projects/{id}/status",
    "PATCH /projects/{id}/archive",
    "PATCH /projects/{id}/manager",
    "PATCH /projects/{id}/contractor",
    "POST /projects/{id}/cover",
    "GET /projects/{id}/workspace",
    "GET /projects/{id}/buildings",
    "GET /projects/{id}/units",
    "GET /projects/{id}/homeowners",
  ],
  buildings: ["PATCH /buildings/{id}", "PATCH /buildings/{id}/status", "PATCH /buildings/{id}/archive"],
  pickers: ["GET /managers?q=", "GET /contractors?q="],
  homeowners: [
    "GET /homeowners",
    "GET /homeowners/{id}",
    "GET /homeowners/by-unit/{unitNumber}",
    "POST /homeowners",
    "PATCH /homeowners/{id}",
    "POST /homeowners/{id}/resend-invitation",
    "POST /homeowners/{id}/transfer",
    "PATCH /homeowners/{id}/status",
    "GET /homeowners/export",
    "GET /units/vacant",
  ],
  technicians: [
    "GET /technicians",
    "GET /technicians/summary",
    "GET /technicians/{id}",
    "POST /technicians",
    "PATCH /technicians/{id}",
    "POST /technicians/{id}/resend-invitation",
    "POST /technicians/{id}/transfer",
    "PATCH /technicians/{id}/status",
    "GET /technicians/{id}/reviews",
  ],
  pm: [
    "GET /pm/overview",
    "GET /pm/alerts",
    "GET /pm/activity",
    "GET /pm/reports",
    "GET /pm/contractors",
    "GET /pm/contractors/{id}/performance",
    "GET /pm/contractors/{id}/insight",
    "POST /pm/copilot/summary",
    "POST /pm/copilot/chat",
  ],
  technicianTasks: [
    "GET /technician/tasks",
    "GET /technician/tasks/summary",
    "GET /technician/repairs/history",
    "POST /reports/{id}/start",
    "POST /reports/{id}/submit-repair",
  ],
} as const;

/**
 * The shape every later domain adapter should satisfy: one function per real
 * endpoint, taking an `AbortSignal`, returning a validated view model, throwing
 * `ApiError`/`NetworkError` on failure — never returning fixture data.
 */
export interface DomainAdapter<TQuery, TViewModel> {
  load(query: TQuery, options?: { signal?: AbortSignal }): Promise<TViewModel>;
}
