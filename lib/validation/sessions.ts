/**
 * Sessions endpoint Zod validation schemas
 */
import { z } from 'zod';
import { nonEmptySanitizedString } from './sanitize';

/** POST — revoke session */
export const revokeSessionBodySchema = z.object({
  sessionId: nonEmptySanitizedString,
});

/** POST — revoke all sessions */
export const revokeAllSessionsBodySchema = z.object({
  keepCurrent: z.boolean().optional(),
});

/** GET — poll query params */
export const pollQuerySchema = z.object({
  action: z.literal('poll'),
  lastEventId: z.string().optional(),
});
