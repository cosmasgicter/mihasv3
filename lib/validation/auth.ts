/**
 * Auth endpoint Zod validation schemas
 *
 * Covers: login, register, password-reset-request, password-reset,
 * profile update, check-email, and session/refresh query params.
 */
import { z } from 'zod';
import { nonEmptySanitizedString, optionalSanitizedString } from './sanitize';

/**
 * Email schema — RFC 5322 compliant via Zod's built-in email validator,
 * with sanitization (trim + null byte rejection).
 */
export const emailSchema = z
  .string()
  .transform((s) => s.trim())
  .pipe(
    z.string()
      .refine((s) => !s.includes('\0'), 'Null bytes not allowed')
      .refine((s) => z.string().email().safeParse(s).success, 'Invalid email format')
  );

/**
 * Password schema — 8+ chars, at least one uppercase, one lowercase, one digit.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((s) => /[A-Z]/.test(s), 'Password must contain at least one uppercase letter')
  .refine((s) => /[a-z]/.test(s), 'Password must contain at least one lowercase letter')
  .refine((s) => /\d/.test(s), 'Password must contain at least one digit');

/** Login action body */
export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

/** Register action body */
export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmptySanitizedString,
  lastName: nonEmptySanitizedString,
});

/** Password reset request body (forgot-password) */
export const passwordResetRequestBodySchema = z.object({
  email: emailSchema,
});

/** Password reset body (reset-password / password-reset) */
export const passwordResetBodySchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema,
});

/** Profile update body (PATCH) — all fields optional */
export const profileUpdateBodySchema = z.object({
  full_name: optionalSanitizedString,
  first_name: optionalSanitizedString,
  last_name: optionalSanitizedString,
  phone: optionalSanitizedString,
  date_of_birth: optionalSanitizedString,
  sex: optionalSanitizedString,
  residence_town: optionalSanitizedString,
  nationality: optionalSanitizedString,
  nrc_number: optionalSanitizedString,
  address: optionalSanitizedString,
  avatar_url: optionalSanitizedString,
  next_of_kin_name: optionalSanitizedString,
  next_of_kin_phone: optionalSanitizedString,
}).partial();

/** Check-email query params */
export const checkEmailQuerySchema = z.object({
  action: z.literal('check-email'),
  email: emailSchema,
});
