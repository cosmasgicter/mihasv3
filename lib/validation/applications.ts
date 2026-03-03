/**
 * Applications endpoint Zod validation schemas
 */
import { z } from 'zod';
import { sanitizedString, nonEmptySanitizedString, optionalSanitizedString } from './sanitize';
import { eczGradeSchema } from './zambian';

const applicationStatusSchema = z.enum([
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'pending_documents',
]);

const institutionSchema = z.enum(['MIHAS', 'KATC']);

/** POST — create application */
export const createApplicationBodySchema = z.object({
  application_number: nonEmptySanitizedString,
  public_tracking_code: optionalSanitizedString,
  full_name: nonEmptySanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  date_of_birth: nonEmptySanitizedString,
  sex: nonEmptySanitizedString,
  phone: nonEmptySanitizedString,
  email: z.string().email('Invalid email'),
  residence_town: nonEmptySanitizedString,
  nationality: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
  program: nonEmptySanitizedString,
  intake: nonEmptySanitizedString,
  institution: institutionSchema,
  status: applicationStatusSchema.optional(),
});

/** POST — review application */
export const reviewApplicationBodySchema = z.object({
  application_id: nonEmptySanitizedString,
  status: applicationStatusSchema,
  notes: optionalSanitizedString,
});

/** PUT — update application by ID (grades, personal info, etc.) */
export const updateApplicationBodySchema = z.object({
  full_name: optionalSanitizedString,
  phone: optionalSanitizedString,
  email: z.string().email().optional(),
  residence_town: optionalSanitizedString,
  nationality: optionalSanitizedString,
  nrc_number: optionalSanitizedString,
  passport_number: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
  status: applicationStatusSchema.optional(),
  grades: z.array(z.object({
    subject_id: z.string(),
    grade: eczGradeSchema,
  })).optional(),
}).partial();

/** GET — track application (public, unauthenticated) */
export const trackApplicationQuerySchema = z.object({
  action: z.literal('track'),
  code: sanitizedString,
});

/** POST — schedule interview */
export const scheduleInterviewBodySchema = z.object({
  application_id: nonEmptySanitizedString,
  interview_date: nonEmptySanitizedString,
  interview_time: optionalSanitizedString,
  location: optionalSanitizedString,
  notes: optionalSanitizedString,
});
