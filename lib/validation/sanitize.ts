/**
 * String sanitization utilities for Zod schemas
 *
 * Provides a reusable sanitized string base that trims whitespace
 * and rejects null bytes. Applied to all string inputs across the API.
 */
import { z } from 'zod';

/**
 * Base sanitized string: trims whitespace and rejects null bytes.
 * Use this as the foundation for all string schemas.
 */
export const sanitizedString = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string().refine((s) => !s.includes('\0'), 'Null bytes not allowed')
  );

/**
 * Optional sanitized string — allows undefined but sanitizes if present.
 */
export const optionalSanitizedString = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string().refine((s) => !s.includes('\0'), 'Null bytes not allowed')
  )
  .optional();

/**
 * Non-empty sanitized string — must have content after trimming.
 */
export const nonEmptySanitizedString = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string()
      .refine((s) => !s.includes('\0'), 'Null bytes not allowed')
      .refine((s) => s.length > 0, 'Must not be empty')
  );
