import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

export function validateRequest(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        const parsedQuery = schemas.query.parse(req.query);
        Object.assign(req.query, parsedQuery);
      }
      if (schemas.params) {
        const parsedParams = schemas.params.parse(req.params);
        Object.assign(req.params, parsedParams);
      }
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          AppError.validationError(
            'Request validation failed',
            err.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          ),
        );
        return;
      }
      next(err);
    }
  };
}
