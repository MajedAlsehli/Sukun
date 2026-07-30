import { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'crypto';

// SYS-016: every API response includes a Request ID
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
