/**
 * Payments endpoint Zod validation schemas
 */
import { z } from 'zod';
import { nonEmptySanitizedString } from './sanitize';

/** GET — receipt query params */
export const receiptQuerySchema = z.object({
  action: z.literal('receipt'),
  applicationId: nonEmptySanitizedString,
});
