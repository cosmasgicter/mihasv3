/**
 * Zambian-specific Zod validation schemas
 *
 * Validates NRC numbers, +260 phone numbers, and ECZ grades (1-9).
 * Used across API endpoints for Zambian data format enforcement.
 */
import { z } from 'zod';

/**
 * NRC (National Registration Card) format: 6 digits / 2 digits / 1 digit
 * Example: 123456/78/9
 * Includes sanitization: trim + null byte rejection.
 */
export const nrcSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string()
      .refine((s) => !s.includes('\0'), 'Null bytes not allowed')
      .refine((s) => /^\d{6}\/\d{2}\/\d$/.test(s), 'Invalid NRC format. Expected: 123456/78/9')
  );

/**
 * Zambian phone number: +260 followed by exactly 9 digits
 * Example: +260971234567
 * Includes sanitization: trim + null byte rejection.
 */
export const zambianPhoneSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string()
      .refine((s) => !s.includes('\0'), 'Null bytes not allowed')
      .refine((s) => /^\+260\d{9}$/.test(s), 'Must be +260 followed by 9 digits')
  );

/**
 * ECZ (Examinations Council of Zambia) grade: integer 1-9
 * 1-6 = pass, 7-9 = fail
 */
export const eczGradeSchema = z.number().int('Grade must be a whole number').min(1, 'Grade minimum is 1').max(9, 'Grade maximum is 9');

/**
 * Optional NRC — allows empty string or valid NRC
 */
export const optionalNrcSchema = z.union([
  z.literal(''),
  nrcSchema,
]).optional();

/**
 * Optional Zambian phone — allows empty string or valid phone
 */
export const optionalZambianPhoneSchema = z.union([
  z.literal(''),
  zambianPhoneSchema,
]).optional();

/**
 * Optional ECZ grade
 */
export const optionalEczGradeSchema = eczGradeSchema.optional();
