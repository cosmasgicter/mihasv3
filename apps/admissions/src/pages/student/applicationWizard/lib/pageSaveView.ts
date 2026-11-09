/**
 * The page-level save status (SJR task 3.23, R6-b).
 *
 * The draft machine reports whether the draft's answers and grades are saved.
 * The wizard page also issues document commands (uploads), which are not draft
 * commands but are work the student would lose by leaving. The action bar shows
 * one status, so it shows this composition: an upload in flight is "saving", a
 * failed upload is an error the student can act on, and otherwise the machine's
 * own view. Pure and total.
 */
import type { WizardDraftSaveView } from '@/lib/wizardDraftController'

export interface WizardPageDocumentState {
  documentsUploading: boolean
  documentsFailed: boolean
}

export const WIZARD_DOCUMENT_FAILED_MESSAGE = "A document didn't upload. Try it again."

export function deriveWizardPageSaveView(
  machineView: WizardDraftSaveView,
  documents: WizardPageDocumentState,
): WizardDraftSaveView {
  // A conflict outranks everything: the student must resolve it before anything is saved.
  if (machineView.status === 'conflict') return machineView
  if (documents.documentsUploading) return { status: 'saving', message: null }
  if (documents.documentsFailed) return { status: 'error', message: WIZARD_DOCUMENT_FAILED_MESSAGE }
  return machineView
}
