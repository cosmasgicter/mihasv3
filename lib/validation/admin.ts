/**
 * Admin endpoint Zod validation schemas
 */
import { z } from 'zod';
import { sanitizedString, nonEmptySanitizedString, optionalSanitizedString } from './sanitize';
import { emailSchema, passwordSchema } from './auth';

const roleSchema = z.enum([
  'student',
  'reviewer',
  'admissions_officer',
  'registrar',
  'finance_officer',
  'academic_head',
  'admin',
  'super_admin',
]);

/** POST — admin register user */
export const adminRegisterBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nonEmptySanitizedString,
  lastName: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema.optional(),
});

/** POST — admin set password */
export const adminSetPasswordBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/** PUT/POST — update user role */
export const updateRoleBodySchema = z.object({
  userId: nonEmptySanitizedString,
  role: roleSchema,
});

/** PUT — update an existing user */
export const updateUserBodySchema = z.object({
  userId: nonEmptySanitizedString,
  email: emailSchema,
  full_name: nonEmptySanitizedString,
  phone: optionalSanitizedString,
  role: roleSchema,
});

/** GET/PUT — view effective permissions for a user */
export const userPermissionsBodySchema = z.object({
  userId: nonEmptySanitizedString,
  permissions: z.array(sanitizedString).optional(),
});

/** POST — create setting */
export const createSettingBodySchema = z.object({
  key: nonEmptySanitizedString,
  value: z.unknown().refine((v) => v !== undefined && v !== null, 'Value is required'),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z.boolean().optional(),
});

/** PUT — update setting */
export const updateSettingBodySchema = z.object({
  id: nonEmptySanitizedString.optional(),
  key: optionalSanitizedString,
  value: z.unknown().optional(),
  description: optionalSanitizedString,
  category: optionalSanitizedString,
  is_public: z.boolean().optional(),
});

/** POST — import settings */
export const importSettingsBodySchema = z.object({
  settings: z.array(z.object({
    key: nonEmptySanitizedString,
    value: z.unknown(),
    description: optionalSanitizedString,
    category: optionalSanitizedString,
    is_public: z.boolean().optional(),
  })),
});

/** POST — migrate (requires secret or super_admin) */
export const migrateBodySchema = z.object({
  secret: optionalSanitizedString,
});
