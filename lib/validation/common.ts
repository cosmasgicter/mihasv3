/**
 * Common reusable Zod validation schemas
 */
import { z } from 'zod';

/** Validates a string as UUID v4 format */
export const uuidParamSchema = z.string().uuid('Must be a valid UUID');

/** Validates pagination query parameters */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive('Page must be a positive integer').default(1),
  pageSize: z.coerce.number().int().positive('Page size must be a positive integer').max(100, 'Page size must not exceed 100').default(20),
});
