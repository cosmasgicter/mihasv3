/**
 * Email endpoint Zod validation schemas
 */
import { z } from 'zod';
import { nonEmptySanitizedString, optionalSanitizedString } from './sanitize';

/** POST — send (queue) email */
export const sendEmailBodySchema = z.object({
  recipient_email: z.string().email('Invalid recipient email'),
  recipient_name: optionalSanitizedString,
  subject: nonEmptySanitizedString,
  body: nonEmptySanitizedString,
  template_name: optionalSanitizedString,
  template_data: z.record(z.string(), z.unknown()).optional(),
  priority: z.number().int().min(1).max(10).optional(),
});
