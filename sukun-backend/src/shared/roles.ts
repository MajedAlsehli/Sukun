import { UserRole } from '@prisma/client';

export { UserRole };

// 04_User_Roles.md - VISITOR is unauthenticated and never persisted as a User row.
export const ALL_ROLES: UserRole[] = [
  UserRole.HOME_SEEKER,
  UserRole.HOMEOWNER,
  UserRole.TECHNICIAN,
  UserRole.PROJECT_MANAGER,
  UserRole.COMPANY,
];
