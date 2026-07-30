import { Response } from 'express';

// Standard response envelope - 08_API_Specification.md #STANDARD RESPONSES

export function sendSuccess<T>(res: Response, data: T, httpStatus = 200): void {
  res.status(httpStatus).json({
    success: true,
    requestId: res.locals.requestId,
    data,
  });
}

export function sendError(
  res: Response,
  httpStatus: number,
  errorCode: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  res.status(httpStatus).json({
    success: false,
    requestId: res.locals.requestId,
    errorCode,
    message,
    // Omitted entirely unless an error opted in (Task 8, see AppError.details) -
    // every pre-existing error response keeps its exact previous shape.
    ...(details ? { details } : {}),
  });
}
