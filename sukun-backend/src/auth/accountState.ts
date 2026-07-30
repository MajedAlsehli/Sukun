import { UserRole } from '@prisma/client';
import { homeownerRepository } from '../homeowners/homeowner.repository';

/**
 * Derived frontend role/account-state resolver (Task 3 integration prompt,
 * decisions.md A1). The backend has no `homeowner_prospect`/`_pending`/
 * `_active` column anywhere - each is derived here, once, from
 * `User.role` + the most recent `HomeownerActivation` row, and every
 * session-producing response (login/register/refresh/me) goes through this
 * single resolver rather than re-deriving it per-endpoint.
 */
export type FrontendRole =
  | 'homeowner_prospect'
  | 'homeowner_pending'
  | 'homeowner_active'
  | 'technician'
  | 'pm'
  | 'company';

// Mirrors app/src/routes/paths.ts + defaultRoute.ts on the frontend. The two
// are necessarily duplicated (separate deployables) - keep them in sync by
// hand; see docs/integration/decisions.md.
const LANDING_ROUTES: Record<FrontendRole, string> = {
  homeowner_prospect: '/discover',
  homeowner_pending: '/activate',
  homeowner_active: '/home',
  technician: '/technician/tasks',
  pm: '/pm',
  company: '/company',
};

export interface ResolvedAccountState {
  frontendRole: FrontendRole;
  landingRoute: string;
}

async function resolveFrontendRole(user: { id: string; role: UserRole }): Promise<FrontendRole> {
  switch (user.role) {
    case UserRole.HOME_SEEKER: {
      // Multiple historical rows are possible (EDG-008 resend reissues a new
      // row's worth of state onto the same row via reissueCode - but repeated
      // company-side re-registration attempts against a still-pending unit
      // are rejected upstream, so in practice at most one PENDING row is ever
      // live per user). Take the most recent row and require it to still be
      // PENDING *and* unexpired - a PENDING-but-expired row (never resent) or
      // any ACTIVATED/EXPIRED row resolves to prospect, not pending. This is
      // a read-time exclusion, not a state mutation - no endpoint currently
      // transitions a stale row to EXPIRED, so nothing is "wrong" to correct.
      const activation = await homeownerRepository.findLatestActivationByUserId(user.id);
      if (activation && activation.status === 'PENDING' && activation.expiresAt > new Date()) {
        return 'homeowner_pending';
      }
      return 'homeowner_prospect';
    }
    case UserRole.HOMEOWNER:
      // Promoted only inside homeowner.service.ts#activate, atomically with
      // Ownership.status='ACTIVE' (see activateAtomically) - role alone is
      // authoritative for "has completed activation at least once." A later
      // Ownership.status='ENDED' (unit transfer/move-out, no endpoint exists
      // for this yet) is a data-availability concern for endpoints like
      // GET /homeowners/me (which already 404s with NO_ACTIVE_OWNERSHIP), not
      // a routing concern here - downgrading the role would hide a real
      // account, not fix anything.
      return 'homeowner_active';
    case UserRole.TECHNICIAN:
      return 'technician';
    case UserRole.PROJECT_MANAGER:
      return 'pm';
    case UserRole.COMPANY:
      return 'company';
  }
}

export async function resolveAccountState(user: {
  id: string;
  role: UserRole;
}): Promise<ResolvedAccountState> {
  const frontendRole = await resolveFrontendRole(user);
  return { frontendRole, landingRoute: LANDING_ROUTES[frontendRole] };
}
