/**
 * Validation module — re-exports all Zod schemas and middleware.
 */

// Sanitization primitives
export { sanitizedString, optionalSanitizedString, nonEmptySanitizedString } from './sanitize';

// Zambian-specific validators
export { nrcSchema, zambianPhoneSchema, eczGradeSchema, optionalNrcSchema, optionalZambianPhoneSchema, optionalEczGradeSchema } from './zambian';

// Auth schemas
export { emailSchema, passwordSchema, loginBodySchema, registerBodySchema, passwordResetRequestBodySchema, passwordResetBodySchema, profileUpdateBodySchema, checkEmailQuerySchema } from './auth';

// Application schemas
export {
  createApplicationBodySchema,
  reviewApplicationBodySchema,
  updateApplicationBodySchema,
  trackApplicationQuerySchema,
  scheduleInterviewBodySchema,
  patchUpdateStatusSchema,
  patchUpdatePaymentStatusSchema,
  patchSendNotificationSchema,
  patchScheduleInterviewSchema,
  patchRescheduleInterviewSchema,
  patchCancelInterviewSchema,
  patchSyncGradesSchema,
} from './applications';

// Admin schemas
export {
  adminRegisterBodySchema,
  adminSetPasswordBodySchema,
  updateRoleBodySchema,
  createSettingBodySchema,
  updateSettingBodySchema,
  importSettingsBodySchema,
  migrateBodySchema,
  bulkEmailBodySchema,
  bulkStatusBodySchema,
} from './admin';

// Document schemas
export { uploadDocumentBodySchema, extractDocumentBodySchema, deleteDocumentBodySchema, signedUrlBodySchema, registerSlipBodySchema, resolveReferenceBodySchema } from './documents';

// Payment schemas
export { receiptQuerySchema } from './payments';

// Catalog schemas
export {
  catalogTypeQuerySchema,
  createProgramBodySchema,
  updateProgramBodySchema,
  deleteCatalogEntityQuerySchema,
  createInstitutionBodySchema,
  updateInstitutionBodySchema,
  createIntakeBodySchema,
  updateIntakeBodySchema,
} from './catalog';

// Session schemas
export { revokeSessionBodySchema, revokeAllSessionsBodySchema, pollQuerySchema } from './sessions';

// Notification schemas
export { markReadBodySchema, deleteNotificationBodySchema, checkDuplicateBodySchema, createNotificationBodySchema, sendNotificationBodySchema, updatePreferencesBodySchema } from './notifications';

// Email schemas
export { sendEmailBodySchema } from './email';

// Middleware
export { validateBody, validateQuery } from './middleware';
