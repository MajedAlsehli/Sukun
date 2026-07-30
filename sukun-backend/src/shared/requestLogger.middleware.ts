import { NextFunction, Request, Response } from 'express';
import { logger } from './logger';
import { AuthenticatedRequest } from './auth.middleware';

// 12_Backend_Implementation_Guide.md #LOGGING
// Every request: Request ID, Execution Time, User, Endpoint, Status
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('request', {
      requestId: res.locals.requestId,
      userId: (req as AuthenticatedRequest).user?.id ?? null,
      method: req.method,
      endpoint: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
