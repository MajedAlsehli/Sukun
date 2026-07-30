import { NextFunction, Response } from 'express';
import { AuthorizationError } from './errors';
import { UserRole } from './roles';
import { AuthenticatedRequest } from './auth.middleware';

// SYS-009: Authorization follows Authentication, precedes Business Rules
// PER-005: unauthorized access returns 403 ACCESS_DENIED
export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AuthorizationError('You do not have permission to perform this action.');
    }
    next();
  };
}
