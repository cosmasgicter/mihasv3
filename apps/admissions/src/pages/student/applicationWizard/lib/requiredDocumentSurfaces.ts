/**
 * Wizard document surfaces derived from the server contract (task **7.2**).
 *
 * Requirements: R11.6 — required document controls *and* the blockers/checklist
 *               that describe them come from the versioned requirements
 *               snapshot, not a hardcoded type list.
 * Findings:     **STU-13**.
 *
 * The education step renders its upload controls from the contract
 * (`RequiredDocumentsPanel`). Three sibling surfaces describe the same set: the
 * step's error summary, the step checklist, and the Continue-gate validation.
 * Before 7.2 all three named exactly `result_slip` and `extra_kyc`, so a tenant
 * that configured `nursing_council_letter` produced a wizard that demanded a
 * result slip nobody asked for and never mentioned the document that actually
 * blocked submission.
 *
 * These helpers are pure so the three surfaces cannot drift from each other, and
 * so the fallback path is explicit: when the contract could not be read the
 * legacy two-document check still applies (never weaker than before), and the
 * server re-checks under the row lock at submit either way (task 6.5).
 */
import type { RequiredDocumentsContract } from '@/lib/requiredDocuments'

export interface DocumentChecklistItem {
  label: string
  completed: boolean
}

export interface DocumentBlocker {
  field: string
  label: string
  message: string
}

/** What the legacy two-field wizard knew, used only when there is no contract. */
export interface LegacyDocumentState {
  hasResultSlip: boolean
  hasIdentityDocument: boolean
  /** Name of a locally selected file, for the review-step detail line. */
  resultSlipName?: string | null
  identityName?: string | null
}

export interface DocumentReviewCheck {
  field: string
  label: string
  detail: string
  completed: boolean
}

const LEGACY_RESULT_SLIP_LABEL = 'Result slip'
const LEGACY_IDENTITY_LABEL = 'Identity document (NRC or Passport)'

function legacyChecklist(legacy: LegacyDocumentState): DocumentChecklistItem[] {
  return [
    { label: `${LEGACY_RESULT_SLIP_LABEL} uploaded`, completed: legacy.hasResultSlip },
    { label: `${LEGACY_IDENTITY_LABEL} uploaded`, completed: legacy.hasIdentityDocument },
  ]
}

/**
 * The step-3 checklist rows for documents.
 *
 * Optional requirements are listed too — a student should be able to see that an
 * optional document is on file — but only required rows can block.
 */
export function documentChecklistItems(
  contract: RequiredDocumentsContract | null,
  legacy: LegacyDocumentState,
): DocumentChecklistItem[] {
  if (!contract) return legacyChecklist(legacy)
  return contract.requirements.map((requirement) => ({
    label: requirement.required
      ? `${requirement.label} uploaded`
      : `${requirement.label} uploaded (optional)`,
    completed: requirement.state !== 'missing',
  }))
}

/** The error-summary entries for documents that still block the step. */
export function documentBlockers(
  contract: RequiredDocumentsContract | null,
  legacy: LegacyDocumentState,
): DocumentBlocker[] {
  if (!contract) {
    const blockers: DocumentBlocker[] = []
    if (!legacy.hasResultSlip) {
      blockers.push({
        field: 'result_slip',
        label: LEGACY_RESULT_SLIP_LABEL,
        message: 'Result slip is required',
      })
    }
    if (!legacy.hasIdentityDocument) {
      blockers.push({
        field: 'extra_kyc',
        label: 'Identity document',
        message: 'An NRC or Passport document is required before proceeding',
      })
    }
    return blockers
  }

  return contract.requirements
    .filter((requirement) => requirement.required && requirement.state === 'missing')
    .map((requirement) => ({
      field: requirement.documentType,
      label: requirement.label,
      message: `${requirement.label} is required before you continue`,
    }))
}

/** The Continue-gate rows: one per document surface, satisfied or not. */
export function documentValidationFields(
  contract: RequiredDocumentsContract | null,
  legacy: LegacyDocumentState,
): DocumentChecklistItem[] {
  if (!contract) {
    return [
      { label: LEGACY_RESULT_SLIP_LABEL, completed: legacy.hasResultSlip },
      { label: 'Identity document', completed: legacy.hasIdentityDocument },
    ]
  }
  return contract.requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => ({
      label: requirement.label,
      completed: requirement.state !== 'missing',
    }))
}

export interface DocumentReadinessItem {
  field: string
  label: string
  message: string
  completed: boolean
}

/**
 * The readiness-rail entries for documents.
 *
 * The rail counts *blockers*, so only required requirements appear — an optional
 * document that is merely absent must never hold the progress percentage down.
 * Without this the rail was the one surface still naming `result_slip` and
 * `extra_kyc` after the panel, checklist, Continue gate, and review rows had all
 * moved to the contract, which is exactly the drift these helpers exist to stop.
 */
export function documentReadinessItems(
  contract: RequiredDocumentsContract | null,
  legacy: LegacyDocumentState,
): DocumentReadinessItem[] {
  if (!contract) {
    return [
      {
        field: 'result_slip',
        label: LEGACY_RESULT_SLIP_LABEL,
        message: 'Upload your result slip.',
        completed: legacy.hasResultSlip,
      },
      {
        field: 'extra_kyc',
        label: 'Identity document',
        message: 'Upload your NRC or passport document.',
        completed: legacy.hasIdentityDocument,
      },
    ]
  }

  return contract.requirements
    .filter((requirement) => requirement.required)
    .map((requirement) => ({
      field: requirement.documentType,
      label: requirement.label,
      message: `Upload ${requirement.label}.`,
      completed: requirement.state !== 'missing',
    }))
}

/**
 * The review-step rows for documents.
 *
 * The contract state is the *persisted* state, so these rows are authoritative
 * over the advisory client readiness: a review screen must never tell a student
 * to upload a document the server already holds, nor stay silent about one the
 * tenant requires.
 */
export function documentReviewChecks(
  contract: RequiredDocumentsContract | null,
  legacy: LegacyDocumentState,
): DocumentReviewCheck[] {
  if (!contract) {
    return [
      {
        field: 'result_slip',
        label: 'Result slip attached',
        detail:
          legacy.resultSlipName ??
          (legacy.hasResultSlip
            ? 'Already uploaded'
            : 'Upload your result slip to complete this step'),
        completed: legacy.hasResultSlip,
      },
      {
        field: 'extra_kyc',
        label: 'Identity document attached (NRC or Passport)',
        detail:
          legacy.identityName ??
          (legacy.hasIdentityDocument
            ? 'Already uploaded'
            : 'Upload your NRC or passport to complete this step'),
        completed: legacy.hasIdentityDocument,
      },
    ]
  }

  return contract.requirements.map((requirement) => {
    const stored = requirement.document?.documentName
    const detail =
      requirement.state === 'verified'
        ? `${stored ?? 'Uploaded'}: verified`
        : requirement.state === 'uploaded'
          ? (stored ?? 'Already uploaded')
          : requirement.required
            ? `Upload ${requirement.label} to complete this step`
            : `Optional: ${requirement.label} is not required`
    return {
      field: requirement.documentType,
      label: `${requirement.label} attached`,
      detail,
      // An optional requirement never holds the review back.
      completed: requirement.state !== 'missing' || !requirement.required,
    }
  })
}
