import { z } from 'zod';
import { nonEmptySanitizedString, optionalSanitizedString } from './sanitize';

const numericStringOrNumber = z.union([z.string(), z.number()]);

const optionalNumber = numericStringOrNumber
  .transform((value) => Number(value))
  .refine((value) => Number.isFinite(value), 'Must be a valid number')
  .optional();

const optionalNullableNumber = z.union([numericStringOrNumber, z.null()])
  .transform((value) => (value === null ? null : Number(value)))
  .refine((value) => value === null || Number.isFinite(value), 'Must be a valid number')
  .optional();

const booleanLike = z.union([z.boolean(), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 'true');

export const catalogTypeQuerySchema = z.object({
  type: z.enum(['programs', 'intakes', 'subjects', 'institutions']).optional().default('programs'),
});

export const deleteCatalogEntityQuerySchema = z.object({
  id: nonEmptySanitizedString,
});

export const createProgramBodySchema = z.object({
  name: nonEmptySanitizedString,
  code: optionalSanitizedString,
  description: optionalSanitizedString,
  duration_months: optionalNumber,
  duration_years: optionalNumber,
  application_fee: optionalNullableNumber,
  tuition_fee: optionalNullableNumber,
  regulatory_body: optionalSanitizedString,
  institution_id: nonEmptySanitizedString,
}).superRefine((value, ctx) => {
  const durationMonths = value.duration_months ?? (value.duration_years ? value.duration_years * 12 : undefined);
  if (!durationMonths || durationMonths < 1 || durationMonths > 120) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'duration_months must be between 1 and 120',
      path: ['duration_months'],
    });
  }
});

export const updateProgramBodySchema = createProgramBodySchema.extend({
  id: nonEmptySanitizedString,
  is_active: booleanLike.optional(),
});

export const createInstitutionBodySchema = z.object({
  name: nonEmptySanitizedString,
  full_name: optionalSanitizedString,
  fullName: optionalSanitizedString,
  code: optionalSanitizedString,
  description: optionalSanitizedString,
});

export const updateInstitutionBodySchema = createInstitutionBodySchema.extend({
  id: nonEmptySanitizedString,
  is_active: booleanLike.optional(),
});

export const createIntakeBodySchema = z.object({
  name: nonEmptySanitizedString,
  year: numericStringOrNumber.transform((value) => Number(value)),
  semester: optionalSanitizedString.nullable().optional(),
  start_date: nonEmptySanitizedString,
  end_date: nonEmptySanitizedString,
  application_deadline: nonEmptySanitizedString,
  max_capacity: optionalNumber,
  total_capacity: optionalNumber,
}).superRefine((value, ctx) => {
  if (!Number.isFinite(value.year) || value.year < 2000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Valid year is required',
      path: ['year'],
    });
  }

  const maxCapacity = value.max_capacity ?? value.total_capacity;
  if (!maxCapacity || maxCapacity < 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'max_capacity must be at least 1',
      path: ['max_capacity'],
    });
  }
});

export const updateIntakeBodySchema = createIntakeBodySchema.extend({
  id: nonEmptySanitizedString,
  current_enrollment: optionalNumber,
  is_active: booleanLike.optional(),
});
