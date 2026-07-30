import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { ValidationError } from './errors';

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join(', ');
      throw new ValidationError(message);
    }
    res.locals.query = result.data;
    next();
  };
}
