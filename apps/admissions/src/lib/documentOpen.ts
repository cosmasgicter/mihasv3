/**
 * The document opener's query grammar (SJR task 3.17, R5-a).
 *
 * Every student View and Open control is an anchor to `/student/documents/open`,
 * and that page signs at the moment it is opened. This module is the one place
 * the grammar is written down: {@link documentOpenHref} builds a link and
 * {@link parseDocumentOpenSearch} validates one, so the two cannot drift.
 *
 * Grammar:
 *
 * - `doc=<uuid>`: an uploaded or system-generated document;
 * - `doc=legacy:<result_slip|extra_kyc>:<application uuid>`: a legacy synthetic
 *   row that has no document id of its own;
 * - `app=<uuid>&type=<application_slip|acceptance_letter|conditional_offer|payment_receipt>`:
 *   an official document.
 *
 * Anything else is "not a valid link" and sends no request.
 */
import { ROUTES } from '@/routes/routeRegistry'

export const DOCUMENT_OPEN_PATH = ROUTES.studentDocumentOpen.path

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const LEGACY_DOCUMENT_TYPES = ['result_slip', 'extra_kyc'] as const
export type LegacyDocumentType = (typeof LEGACY_DOCUMENT_TYPES)[number]

export const OPENABLE_OFFICIAL_TYPES = [
  'application_slip',
  'acceptance_letter',
  'conditional_offer',
  'payment_receipt',
] as const
export type OpenableOfficialType = (typeof OPENABLE_OFFICIAL_TYPES)[number]

export type DocumentOpenTarget =
  | { kind: 'document'; documentId: string }
  | { kind: 'legacy'; documentType: LegacyDocumentType; applicationId: string }
  | { kind: 'official'; applicationId: string; documentType: OpenableOfficialType }

/** The href of the opener for a target. Ids are encoded; the grammar is not validated here. */
export function documentOpenHref(target: DocumentOpenTarget): string {
  switch (target.kind) {
    case 'document':
      return `${DOCUMENT_OPEN_PATH}?doc=${encodeURIComponent(target.documentId)}`
    case 'legacy':
      return `${DOCUMENT_OPEN_PATH}?doc=legacy:${target.documentType}:${encodeURIComponent(target.applicationId)}`
    case 'official':
      return (
        `${DOCUMENT_OPEN_PATH}?app=${encodeURIComponent(target.applicationId)}` +
        `&type=${encodeURIComponent(target.documentType)}`
      )
  }
}

/**
 * The opener link for a document row from the documents endpoint, or `null`
 * when the row names nothing that can be opened. Legacy synthetic rows carry an
 * id of the form `legacy:<type>:<application uuid>`, which is already the
 * grammar's `doc=` value.
 */
export function documentOpenHrefForRow(row: { id?: unknown }): string | null {
  const id = typeof row.id === 'string' ? row.id : ''
  if (!id) return null
  return `${DOCUMENT_OPEN_PATH}?doc=${id.startsWith('legacy:') ? id : encodeURIComponent(id)}`
}

function isOpenableOfficialType(value: string): value is OpenableOfficialType {
  return (OPENABLE_OFFICIAL_TYPES as readonly string[]).includes(value)
}

function isLegacyType(value: string): value is LegacyDocumentType {
  return (LEGACY_DOCUMENT_TYPES as readonly string[]).includes(value)
}

/** Validate an opener query. Returns the target, or `null` for any other shape. */
export function parseDocumentOpenSearch(params: URLSearchParams): DocumentOpenTarget | null {
  const doc = params.get('doc')
  const app = params.get('app')
  const type = params.get('type')

  if (doc !== null) {
    if (app !== null || type !== null) return null
    if (UUID_PATTERN.test(doc)) return { kind: 'document', documentId: doc }
    const parts = doc.split(':')
    if (parts.length === 3 && parts[0] === 'legacy') {
      const legacyType = parts[1] ?? ''
      const applicationId = parts[2] ?? ''
      if (isLegacyType(legacyType) && UUID_PATTERN.test(applicationId)) {
        return { kind: 'legacy', documentType: legacyType, applicationId }
      }
    }
    return null
  }

  if (app !== null && type !== null && UUID_PATTERN.test(app) && isOpenableOfficialType(type)) {
    return { kind: 'official', applicationId: app, documentType: type }
  }
  return null
}

/** A signed URL is only ever navigated to when it is http(s). */
export function isNavigableUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value) return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}
