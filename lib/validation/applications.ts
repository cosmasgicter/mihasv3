/**
 * Applications endpoint Zod validation schemas
 */
import { z } from 'zod';
import { sanitizedString, nonEmptySanitizedString, optionalSanitizedString } from './sanitize';
import { eczGradeSchema } from './zambian';

const applicationStatusSchema = z.enum([
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'pending_documents',
]);
const paymentStatusSchema = z.enum(['pending_review', 'verified', 'rejected']);
const interviewModeSchema = z.enum(['in-person', 'in_person', 'virtual', 'phone']);

const institutionSchema = nonEmptySanitizedString;

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
  country: optionalSanitizedString,
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
  country: optionalSanitizedString,
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

export const patchUpdateStatusSchema = z.object({
  status: applicationStatusSchema,
  notes: optionalSanitizedString,
});

export const patchUpdatePaymentStatusSchema = z.object({
  paymentStatus: paymentStatusSchema,
  verificationNotes: optionalSanitizedString,
});

export const patchSendNotificationSchema = z.object({
  title: nonEmptySanitizedString,
  message: nonEmptySanitizedString,
});

export const patchScheduleInterviewSchema = z.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema,
  location: nonEmptySanitizedString,
  notes: optionalSanitizedString,
});

export const patchRescheduleInterviewSchema = z.object({
  scheduledAt: nonEmptySanitizedString,
  mode: interviewModeSchema.optional(),
  location: optionalSanitizedString,
  notes: optionalSanitizedString,
});

export const patchCancelInterviewSchema = z.object({
  notes: optionalSanitizedString,
});

export const patchSyncGradesSchema = z.object({
  grades: z.array(z.object({
    subject_id: nonEmptySanitizedString,
    grade: eczGradeSchema,
  })),
});

/** PATCH — save draft with optimistic concurrency version check */
export const patchSaveDraftSchema = z.object({
  version: z.number().int().positive('Version must be a positive integer'),
  data: z.record(z.string(), z.unknown()),
});
