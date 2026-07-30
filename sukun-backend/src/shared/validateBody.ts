import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from './errors';

// Controllers never contain business logic (12_Backend_Implementation_Guide.md);
// validation happens before the service is ever called. Shared across all modules.
export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join(', ');
      throw new ValidationError(message);
    }
    req.body = result.data;
    next();
  };
}
