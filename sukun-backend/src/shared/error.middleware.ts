import { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import { sendError } from './response';
import { logger } from './logger';

// SYS-017/018: unexpected exceptions return a generic error, no stack traces exposed
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    sendError(res, err.httpStatus, err.errorCode, err.message, err.details);
    return;
  }

  logger.error('Unhandled error', {
    requestId: res.locals.requestId,
    error: err instanceof Error ? err.stack : err,
  });

  sendError(res, 500, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.');
}
