/**
 * Required-document upload contract — the one client-side authority.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task **7.2**
 * Requirements: R11.6 (upload controls rendered from a versioned requirements
 *               snapshot, not a hardcoded type list), R11.7 (type/size
 *               validation)
 * Findings:     **STU-13** — the wizard only uploaded two hardcoded document
 *               types, so a tenant-configured requirement was an invisible
 *               submission blocker.
 * Design:       §9.3 (Required Documents — "The wizard renders each server
 *               requirement, including custom tenant types.")
 *
 * Backend authority: `backend/apps/applications/required_documents.py`, served
 * by `GET /api/v1/applications/{id}/required-documents/`. This module only
 * *parses* that contract and applies the constraints the server published. It
 * holds no list of document types and invents no defaults: an unusable payload
 * becomes an explicit error state, never a fabricated requirement list.
 *
 * The platform fallbacks below exist solely to keep a control usable when the
 * server omits an optional constraint field; they mirror the backend policy and
 * are drift-guarded by `tests/unit/requiredDocumentsDrift.test.ts`.
 */

/** Mirror of the backend platform MIME allowlist (drift-guarded). */
export const PLATFORM_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
] as const

/** Mirror of the backend platform upload ceiling in bytes (drift-guarded). */
export const PLATFORM_MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/** Mirror of the backend MIME → extension table (drift-guarded). */
export const MIME_EXTENSIONS: Record<string, readonly string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

export type RequiredDocumentState = 'missing' | 'uploaded' | 'verified'
export type RequiredDocumentSource = 'tenant' | 'platform'

export interface RequiredDocumentEvidence {
  id: string
  documentType: string
  documentName: string | null
  verificationStatus: string
  fileSize: number | null
  mimeType: string | null
  uploadedAt: string | null
  /**
   * Immutable-version identity (task 7.3, R11.7-R11.8). `null` for a document
   * stored before the version model existed — the client renders the identity it
   * was given and never invents a version number.
   */
  version: number | null
  lifecycleState: string | null
  checksum: string | null
}

/**
 * A version that is no longer this requirement's evidence — superseded by a
 * replacement or removed (task 7.3, R11.8).
 *
 * The server publishes no checksum, URL, or file name here on purpose: a history
 * entry answers "what happened to this requirement", and the bytes of a
 * superseded document are not part of that answer.
 */
export interface RequiredDocumentVersion {
  id: string
  documentType: string
  version: number | null
  lifecycleState: string | null
  uploadedAt: string | null
  supersededAt: string | null
}

export interface RequiredDocumentRequirement {
  documentType: string
  label: string
  required: boolean
  description: string | null
  source: RequiredDocumentSource
  acceptsDocumentTypes: string[]
  acceptedMimeTypes: string[]
  acceptedExtensions: string[]
  maxSizeBytes: number
  state: RequiredDocumentState
  document: RequiredDocumentEvidence | null
  /** Preserved prior versions, newest first (task 7.3, R11.8). */
  history: RequiredDocumentVersion[]
}

export interface RequiredDocumentsContract {
  applicationId: string
  configurationVersion: string | null
  requirements: RequiredDocumentRequirement[]
  missingRequired: Array<{ documentType: string; label: string }>
  satisfied: boolean
  /**
   * The application's institution has opted in to OCR grade suggestions
   * (platform-simplification task 18.2, decision D4). `false` unless the server
   * says `true`: the wizard calls extract and polls only when this is set.
   */
  ocrAvailable: boolean
}

/**
 * The stable rejection vocabulary the contract defines, mirrored from
 * `backend/apps/applications/required_documents.py`. Drift-guarded by
 * `tests/unit/requiredDocumentsDrift.test.ts`: the client must never refuse a
 * file with a code the server does not also use, and must be able to render a
 * message for every code the server can return.
 */
export const UPLOAD_REJECTION_CODES = [
  'DOCUMENT_TYPE_NOT_REQUIRED',
  'EMPTY_FILE',
  'FILE_TOO_LARGE',
  'INVALID_FILE_TYPE',
  'UNSAFE_FILE_CONTENT',
] as const

/**
 * Codes only the client transport produces (frontend-only, no backend mirror),
 * plus the one server code whose meaning the client words itself. Kept out of
 * `UPLOAD_REJECTION_CODES` so the drift guard against the backend keeps its meaning.
 */
export const CLIENT_UPLOAD_ERROR_COPY: Readonly<Record<string, string>> = {
  UPLOAD_STALLED: 'The upload stopped. Check your connection and try again.',
  NETWORK_ERROR: 'We could not reach the server. Check your connection and try again.',
  DOCUMENT_UPLOAD_IN_PROGRESS: 'This upload is still being processed. Try again in a minute.',
}

/** The message to show for a failed upload: our wording for transport codes, else the server's. */
export function uploadFailureMessage(code: string, serverMessage: string): string {
  return CLIENT_UPLOAD_ERROR_COPY[code] ?? serverMessage
}

/** The subset a client can decide on its own, before any byte leaves the device. */
export type UploadRejectionCode = 'FILE_TOO_LARGE' | 'INVALID_FILE_TYPE' | 'EMPTY_FILE'

export interface UploadRejection {
  code: UploadRejectionCode
  message: string
}

export class RequiredDocumentsContractError extends Error {
  constructor(message = 'The document requirements for this application could not be read.') {
    super(message)
    this.name = 'RequiredDocumentsContractError'
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen: string[] = []
  for (const entry of value) {
    const text = asString(entry)
    if (text && !seen.includes(text)) seen.push(text)
  }
  return seen
}

function asPositiveInt(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null
}

function parseState(value: unknown): RequiredDocumentState {
  return value === 'verified' || value === 'uploaded' ? value : 'missing'
}

function extensionsFor(mimeTypes: string[]): string[] {
  const extensions: string[] = []
  for (const mime of mimeTypes) {
    for (const extension of MIME_EXTENSIONS[mime] ?? []) {
      if (!extensions.includes(extension)) extensions.push(extension)
    }
  }
  return extensions
}

function parseEvidence(raw: unknown): RequiredDocumentEvidence | null {
  const record = asRecord(raw)
  const id = record ? asString(record.id) : null
  if (!record || !id) return null
  return {
    id,
    documentType: asString(record.document_type) ?? '',
    documentName: asString(record.document_name),
    verificationStatus: asString(record.verification_status) ?? 'pending',
    fileSize: asPositiveInt(record.file_size),
    mimeType: asString(record.mime_type),
    uploadedAt: asString(record.uploaded_at),
    version: asPositiveInt(record.version),
    lifecycleState: asString(record.lifecycle_state),
    checksum: asString(record.checksum),
  }
}

/**
 * One preserved prior version.
 *
 * An entry with no id is dropped rather than rendered: "a version happened here
 * but we cannot name it" is not something to show a student, and it is the shape
 * a partially-published payload takes.
 */
function parseVersion(raw: unknown): RequiredDocumentVersion | null {
  const record = asRecord(raw)
  const id = record ? asString(record.id) : null
  if (!record || !id) return null
  return {
    id,
    documentType: asString(record.document_type) ?? '',
    version: asPositiveInt(record.version),
    lifecycleState: asString(record.lifecycle_state),
    uploadedAt: asString(record.uploaded_at),
    supersededAt: asString(record.superseded_at),
  }
}

function parseHistory(raw: unknown, currentId: string | null): RequiredDocumentVersion[] {
  if (!Array.isArray(raw)) return []
  const entries: RequiredDocumentVersion[] = []
  for (const candidate of raw) {
    const entry = parseVersion(candidate)
    // The current version is published in `document`; including it here too
    // would render one upload twice — once as evidence, once as its own history.
    if (!entry || entry.id === currentId || entries.some((row) => row.id === entry.id)) continue
    entries.push(entry)
  }
  return entries.sort((left, right) => (right.version ?? 0) - (left.version ?? 0))
}

function parseRequirement(raw: unknown): RequiredDocumentRequirement | null {
  const record = asRecord(raw)
  const documentType = record ? asString(record.document_type) : null
  if (!record || !documentType) return null
  const document = parseEvidence(record.document)

  const acceptedMimeTypes = asStringArray(record.accepted_mime_types).filter((mime) =>
    (PLATFORM_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime),
  )
  const effectiveMimeTypes =
    acceptedMimeTypes.length > 0 ? acceptedMimeTypes : [...PLATFORM_ACCEPTED_MIME_TYPES]
  const publishedExtensions = asStringArray(record.accepted_extensions)

  return {
    documentType,
    label: asString(record.label) ?? documentType,
    required: record.required === true,
    description: asString(record.description),
    source: record.source === 'tenant' ? 'tenant' : 'platform',
    acceptsDocumentTypes: (() => {
      const accepts = asStringArray(record.accepts_document_types)
      return accepts.length > 0 ? accepts : [documentType]
    })(),
    acceptedMimeTypes: effectiveMimeTypes,
    acceptedExtensions:
      publishedExtensions.length > 0 ? publishedExtensions : extensionsFor(effectiveMimeTypes),
    maxSizeBytes: Math.min(
      asPositiveInt(record.max_size_bytes) ?? PLATFORM_MAX_UPLOAD_BYTES,
      PLATFORM_MAX_UPLOAD_BYTES,
    ),
    state: parseState(record.state),
    document,
    history: parseHistory(record.history, document?.id ?? null),
  }
}

/**
 * Parse the server contract.
 *
 * Throws {@link RequiredDocumentsContractError} when the payload is not a
 * readable contract. The caller renders a retry affordance — it must never fall
 * back to a guessed requirement list, because "no requirements" is exactly the
 * fail-open behaviour STU-13 flagged.
 */
export function parseRequiredDocumentsContract(raw: unknown): RequiredDocumentsContract {
  const envelope = asRecord(raw)
  const payload = envelope && asRecord(envelope.data) ? asRecord(envelope.data)! : envelope
  if (!payload || !Array.isArray(payload.requirements)) {
    throw new RequiredDocumentsContractError()
  }

  const requirements: RequiredDocumentRequirement[] = []
  for (const entry of payload.requirements) {
    const requirement = parseRequirement(entry)
    if (requirement && !requirements.some((row) => row.documentType === requirement.documentType)) {
      requirements.push(requirement)
    }
  }

  const missingRequired = requirements
    .filter((requirement) => requirement.required && requirement.state === 'missing')
    .map((requirement) => ({ documentType: requirement.documentType, label: requirement.label }))

  return {
    applicationId: asString(payload.application_id) ?? '',
    configurationVersion: asString(payload.configuration_version),
    requirements,
    missingRequired,
    satisfied: missingRequired.length === 0,
    ocrAvailable: payload.ocr_available === true,
  }
}

/**
 * Format a size the way the *server* words an upload constraint.
 *
 * Deliberately not `@/lib/utils.formatFileSize` (the canonical general-purpose
 * formatter, which renders `2 MB` / `0.49 MB`): these strings sit next to — and
 * must read identically to — the backend's own rejection copy from
 * `required_documents._format_size` ("10MB", "500KB"). A student who sees
 * "up to 2MB" on the control and "must be 2 MB or smaller" in the error is
 * being shown two different-looking limits.
 */
export function formatConstraintSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024) {
    const megabytes = bytes / (1024 * 1024)
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)}MB`
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

/** The `accept` attribute for one requirement's file input. */
export function acceptAttribute(requirement: RequiredDocumentRequirement): string {
  return requirement.acceptedExtensions.join(',')
}

/**
 * Human-readable constraint hint, e.g. "PDF, JPG or PNG up to 2MB".
 *
 * `.jpeg` collapses into `JPG`: both extensions are the same format to a
 * student, and listing them separately made the hint read like two choices.
 */
export function constraintHint(requirement: RequiredDocumentRequirement): string {
  return `${constraintTypes(requirement)} up to ${formatConstraintSize(requirement.maxSizeBytes)}`
}

function constraintTypes(requirement: RequiredDocumentRequirement): string {
  const labels = requirement.acceptedExtensions
    .map((extension) => extension.replace('.', '').toUpperCase())
    .map((label) => (label === 'JPEG' ? 'JPG' : label))
    .filter((label, index, all) => all.indexOf(label) === index)
  return labels.length > 1
    ? `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
    : labels[0] ?? 'PDF'
}

/**
 * The file rules as the upload control shows them, once (task 25.4, R15.6):
 * "PDF, JPG or PNG, up to 10 MB". The same facts as {@link constraintHint}, which
 * keeps the server's "10MB" spelling for the rejection messages that mirror it.
 */
export function uploadRulesText(requirement: RequiredDocumentRequirement): string {
  const size = formatConstraintSize(requirement.maxSizeBytes).replace(/(\d)([A-Za-z]+)$/, '$1 $2')
  return `${constraintTypes(requirement)}, up to ${size}`
}

/** "That file is 3MB. <Label> must be 2MB or smaller." */
export function tooLargeRejection(
  requirement: RequiredDocumentRequirement,
  size?: number,
): UploadRejection {
  const actual = typeof size === 'number' && size > 0 ? `That file is ${formatConstraintSize(size)}. ` : ''
  return {
    code: 'FILE_TOO_LARGE',
    message: `${actual}${requirement.label} must be ${formatConstraintSize(
      requirement.maxSizeBytes,
    )} or smaller.`,
  }
}

/** "<Label> must be a PDF up to 2MB file." */
export function invalidTypeRejection(requirement: RequiredDocumentRequirement): UploadRejection {
  return {
    code: 'INVALID_FILE_TYPE',
    message: `${requirement.label} must be a ${constraintHint(requirement)} file.`,
  }
}

/**
 * Translate a drop-zone refusal into the requirement's own words.
 *
 * The drop zone enforces `accept`/`maxSize` before our validator ever sees the
 * file, so without this the same rejection would be described two different
 * ways depending on how the file was chosen. Returns `null` for a refusal we
 * cannot attribute, so the caller can fall back to the raw message.
 */
export function rejectionForDropzoneCode(
  requirement: RequiredDocumentRequirement,
  code: string | undefined,
  file?: File,
): UploadRejection | null {
  if (code === 'file-too-large') return tooLargeRejection(requirement, file?.size)
  if (code === 'file-invalid-type') return invalidTypeRejection(requirement)
  return null
}

/**
 * Validate a selected file against the constraints the *server* published for
 * this requirement. No hardcoded 10MB / four-extension rule: a tenant that
 * narrowed a requirement to "PDF up to 2MB" is enforced here before a byte
 * leaves the device, and the message names the same limit the control showed.
 */
export function validateFileForRequirement(
  file: File,
  requirement: RequiredDocumentRequirement,
): UploadRejection | null {
  if (file.size === 0) {
    return { code: 'EMPTY_FILE', message: 'That file is empty. Please choose the file again.' }
  }
  if (file.size > requirement.maxSizeBytes) {
    return tooLargeRejection(requirement, file.size)
  }

  const mimeType = (file.type || '').toLowerCase()
  const extension = file.name.includes('.')
    ? `.${file.name.split('.').pop()!.toLowerCase()}`
    : ''
  const mimeAccepted = mimeType !== '' && requirement.acceptedMimeTypes.includes(mimeType)
  const extensionAccepted =
    extension !== '' && requirement.acceptedExtensions.includes(extension)

  // Both signals must agree with the published contract. A browser that reports
  // no MIME type still has to present an accepted extension, and an accepted
  // MIME type with a mismatched extension is rejected here rather than by the
  // server's magic-byte check.
  if (!mimeAccepted || !extensionAccepted) {
    return invalidTypeRejection(requirement)
  }

  return null
}

/** Requirements that still block submission, in render order. */
export function unsatisfiedRequirements(
  contract: RequiredDocumentsContract | null,
): RequiredDocumentRequirement[] {
  if (!contract) return []
  return contract.requirements.filter(
    (requirement) => requirement.required && requirement.state === 'missing',
  )
}
