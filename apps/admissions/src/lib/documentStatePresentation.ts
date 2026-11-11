/**
 * One presentation for every document state (task 26.5, R14.7).
 *
 * The same state used to render in two colours on one page ("Uploaded" in blue for
 * the result slip and in amber for the identity document, after a text glyph). Each
 * state now has one word, one Lucide icon and one tone, and every student surface
 * that shows a document state reads this map.
 *
 * The keys are the backend's required-document states (`DOCUMENT_STATES` in
 * `backend/apps/applications/required_documents.py`) plus `needs_attention`, the
 * student-facing name for a document the admissions team sent back. A drift guard
 * (`tests/unit/documentStatePresentation.test.ts`) fails if the backend gains a
 * state this map lacks.
 */
import { AlertCircle, CheckCircle2, FileText, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { StatusBadgeTone } from '@/components/ui/StatusBadge'
import type { RequiredDocumentState } from '@/lib/requiredDocuments'

export type DocumentState = RequiredDocumentState | 'needs_attention'

export interface DocumentStatePresentation {
  label: string
  icon: LucideIcon
  tone: StatusBadgeTone
}

export const DOCUMENT_STATE_PRESENTATION: Record<DocumentState, DocumentStatePresentation> = {
  missing: { label: 'Not added', icon: FileText, tone: 'neutral' },
  uploaded: { label: 'Uploaded', icon: CheckCircle2, tone: 'info' },
  verified: { label: 'Verified', icon: ShieldCheck, tone: 'success' },
  needs_attention: { label: 'Needs attention', icon: AlertCircle, tone: 'warning' },
}

/** The state a stored document is in, from its verification status. */
export function documentStateFromVerification(status: string | null | undefined): DocumentState {
  switch ((status ?? '').trim().toLowerCase()) {
    case 'verified':
    case 'approved':
      return 'verified'
    case 'rejected':
    case 'changes_required':
      return 'needs_attention'
    default:
      return 'uploaded'
  }
}
