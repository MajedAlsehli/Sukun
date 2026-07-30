import { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response) => Promise<void>;

// Express 4 does not catch rejected promises from async handlers - route them
// into errorMiddleware instead of crashing the process.
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
