/**
 * Zod validation middleware for Vercel serverless functions.
 *
 * Parses request body or query against a Zod schema.
 * On failure, sends HTTP 400 with field-level error messages via sendError().
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { sendError, HttpStatus } from '../errorHandler';

/**
 * Format Zod errors into a field-level error map.
 */
function formatZodErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}

/**
 * Validate request body against a Zod schema.
 * Returns the parsed data on success, or sends a 400 response and returns null.
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  req: VercelRequest,
  res: VercelResponse
): z.infer<T> | null {
  const result = schema.safeParse(req.body || {});
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fieldErrors,
    });
    return null;
  }
  return result.data;
}

/**
 * Validate request query parameters against a Zod schema.
 * Returns the parsed data on success, or sends a 400 response and returns null.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  req: VercelRequest,
  res: VercelResponse
): z.infer<T> | null {
  const result = schema.safeParse(req.query || {});
  if (!result.success) {
    const fieldErrors = formatZodErrors(result.error);
    res.status(HttpStatus.BAD_REQUEST).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      fieldErrors,
    });
    return null;
  }
  return result.data;
}
