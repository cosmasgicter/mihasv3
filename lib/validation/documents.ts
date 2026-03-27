/**
 * Documents endpoint Zod validation schemas
 */
import { z } from 'zod';
import { nonEmptySanitizedString, optionalSanitizedString } from './sanitize';

/** POST — upload document */
export const uploadDocumentBodySchema = z.object({
  file: z.string().min(1, 'File data is required'),
  fileName: nonEmptySanitizedString,
  fileType: optionalSanitizedString,
  contentType: optionalSanitizedString,
  userId: optionalSanitizedString,
  applicationId: optionalSanitizedString,
  applicationNumber: optionalSanitizedString,
  documentType: optionalSanitizedString,
});

/** POST — extract (OCR) */
export const extractDocumentBodySchema = z.object({
  documentUrl: z.string().url('Invalid document URL'),
  documentType: optionalSanitizedString,
  applicationId: optionalSanitizedString,
});

/** DELETE/POST — delete document */
export const deleteDocumentBodySchema = z.object({
  documentId: nonEmptySanitizedString,
});

/** GET/POST — signed URL */
export const signedUrlBodySchema = z.object({
  documentId: nonEmptySanitizedString,
});

/** POST — register slip */
export const registerSlipBodySchema = z.object({
  applicationNumber: nonEmptySanitizedString,
  path: nonEmptySanitizedString,
  publicUrl: optionalSanitizedString,
  documentName: optionalSanitizedString,
});

/** POST — resolve reference */
export const resolveReferenceBodySchema = z.object({
  reference: nonEmptySanitizedString,
});

/** Validates a file path string, rejecting path traversal patterns */
export const documentPathSchema = z.string().trim().refine(
  (s) =>
    !s.includes('../') &&
    !s.includes('..\\') &&
    !s.includes('%00') &&
    !s.includes('\0'),
  'Path contains disallowed traversal or null byte patterns'
);
