/**
 * Bootstrap endpoint Zod validation schemas
 */
import { z } from 'zod';

/** POST — bootstrap request body */
export const bootstrapBodySchema = z.object({
  email: z.string().trim().email('Invalid email'),
  password: z.string().trim().min(1, 'Password is required'),
  secret: z.string().trim().optional(),
});
