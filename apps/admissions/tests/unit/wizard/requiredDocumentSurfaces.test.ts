/**
 * The wizard's document blockers/checklist follow the contract (task **7.2**).
 *
 * Requirements: R11.6
 * Findings:     **STU-13** — three sibling surfaces (error summary, checklist,
 *               Continue gate) each named `result_slip` and `extra_kyc` directly,
 *               so a tenant-configured requirement was described nowhere and a
 *               document the tenant never asked for was demanded forever.
 *
 * Validates: Requirements R11.6
 */
import { describe, expect, it } from 'vitest'

import {
  documentBlockers,
  documentChecklistItems,
  documentReadinessItems,
  documentReviewChecks,
  documentValidationFields,
} from '@/pages/student/applicationWizard/lib/requiredDocumentSurfaces'
import { parseRequiredDocumentsContract } from '@/lib/requiredDocuments'

function contractFrom(requirements: unknown[]) {
  return parseRequiredDocumentsContract({
    success: true,
    data: {
      application_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      requirements,
    },
  })
}

const CUSTOM_MISSING = {
  document_type: 'nursing_council_letter',
  label: 'Nursing Council eligibility letter',
  required: true,
  source: 'tenant',
  accepts_document_types: ['nursing_council_letter'],
  state: 'missing',
}

const CUSTOM_UPLOADED = { ...CUSTOM_MISSING, state: 'uploaded' }

const OPTIONAL_ROW = {
  document_type: 'reference_letter',
  label: 'Reference letter',
  required: false,
  source: 'tenant',
  accepts_document_types: ['reference_letter'],
  state: 'missing',
}

const NO_LEGACY = { hasResultSlip: false, hasIdentityDocument: false }

describe('wizard document surfaces — contract driven (R11.6)', () => {
  it('blocks on the tenant requirement and never on a type the contract omits', () => {
    const blockers = documentBlockers(contractFrom([CUSTOM_MISSING]), NO_LEGACY)
    expect(blockers).toEqual([
      {
        field: 'nursing_council_letter',
        label: 'Nursing Council eligibility letter',
        message: 'Nursing Council eligibility letter is required before you continue',
      },
    ])
    expect(blockers.map((row) => row.field)).not.toContain('result_slip')
  })

  it('stops blocking once the server reports evidence', () => {
    expect(documentBlockers(contractFrom([CUSTOM_UPLOADED]), NO_LEGACY)).toEqual([])
    expect(documentBlockers(contractFrom([{ ...CUSTOM_MISSING, state: 'verified' }]), NO_LEGACY)).toEqual([])
  })

  it('never blocks on an optional requirement', () => {
    expect(documentBlockers(contractFrom([OPTIONAL_ROW]), NO_LEGACY)).toEqual([])
    expect(documentValidationFields(contractFrom([OPTIONAL_ROW]), NO_LEGACY)).toEqual([])
  })

  it('lists optional requirements in the checklist, labelled as optional', () => {
    const items = documentChecklistItems(contractFrom([CUSTOM_UPLOADED, OPTIONAL_ROW]), NO_LEGACY)
    expect(items).toEqual([
      { label: 'Nursing Council eligibility letter uploaded', completed: true },
      { label: 'Reference letter uploaded (optional)', completed: false },
    ])
  })

  it('reports an empty requirement list as nothing to do, not as two legacy documents', () => {
    expect(documentChecklistItems(contractFrom([]), NO_LEGACY)).toEqual([])
    expect(documentBlockers(contractFrom([]), NO_LEGACY)).toEqual([])
    expect(documentValidationFields(contractFrom([]), NO_LEGACY)).toEqual([])
  })

  it('falls back to the legacy two-document check when there is no contract', () => {
    // Fail-safe, not fail-open: with no contract the gate is exactly as strict
    // as it was before 7.2, and the server still re-checks under the row lock.
    expect(documentBlockers(null, NO_LEGACY).map((row) => row.field)).toEqual([
      'result_slip',
      'extra_kyc',
    ])
    expect(
      documentBlockers(null, { hasResultSlip: true, hasIdentityDocument: true }),
    ).toEqual([])
    expect(documentChecklistItems(null, { hasResultSlip: true, hasIdentityDocument: false })).toEqual([
      { label: 'Result slip uploaded', completed: true },
      { label: 'Identity document (NRC or Passport) uploaded', completed: false },
    ])
    expect(
      documentValidationFields(null, { hasResultSlip: false, hasIdentityDocument: true }).map(
        (row) => row.completed,
      ),
    ).toEqual([false, true])
  })
})

describe('wizard document review rows — contract driven (R11.6)', () => {
  it('names the tenant requirement on the review step, not the legacy pair', () => {
    const checks = documentReviewChecks(contractFrom([CUSTOM_MISSING]), NO_LEGACY)
    expect(checks).toEqual([
      {
        field: 'nursing_council_letter',
        label: 'Nursing Council eligibility letter attached',
        detail: 'Upload Nursing Council eligibility letter to complete this step',
        completed: false,
      },
    ])
  })

  it('reports stored evidence by the name the server holds', () => {
    const checks = documentReviewChecks(
      contractFrom([
        {
          ...CUSTOM_MISSING,
          state: 'verified',
          document: {
            id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            document_type: 'nursing_council_letter',
            document_name: 'council-letter.pdf',
            verification_status: 'verified',
            file_size: 2048,
            mime_type: 'application/pdf',
            uploaded_at: '2026-07-26T09:00:00Z',
          },
        },
      ]),
      NO_LEGACY,
    )
    expect(checks[0]!.detail).toBe('council-letter.pdf: verified')
    expect(checks[0]!.completed).toBe(true)
  })

  it('never holds the review back for an optional requirement', () => {
    const checks = documentReviewChecks(contractFrom([OPTIONAL_ROW]), NO_LEGACY)
    expect(checks[0]!.completed).toBe(true)
    expect(checks[0]!.detail).toContain('Optional')
  })

  it('keeps the legacy review rows when the contract could not be read', () => {
    const checks = documentReviewChecks(null, {
      hasResultSlip: true,
      hasIdentityDocument: false,
      resultSlipName: 'slip.pdf',
    })
    expect(checks.map((row) => row.field)).toEqual(['result_slip', 'extra_kyc'])
    expect(checks[0]!.detail).toBe('slip.pdf')
    expect(checks[1]!.completed).toBe(false)
  })
})

describe('wizard readiness rail — contract driven (R11.6)', () => {
  it('names the tenant requirement in the readiness rail instead of the legacy pair', () => {
    const items = documentReadinessItems(contractFrom([CUSTOM_MISSING, OPTIONAL_ROW]), NO_LEGACY)
    expect(items).toEqual([
      {
        field: 'nursing_council_letter',
        label: 'Nursing Council eligibility letter',
        message: 'Upload Nursing Council eligibility letter.',
        completed: false,
      },
    ])
    // The rail is a *blocker* rail: an optional document is never a missing item.
    expect(items.map((row) => row.field)).not.toContain('reference_letter')
    expect(items.map((row) => row.field)).not.toContain('result_slip')
  })

  it('clears the rail entry once the server reports evidence', () => {
    expect(documentReadinessItems(contractFrom([CUSTOM_UPLOADED]), NO_LEGACY)[0]!.completed).toBe(
      true,
    )
  })

  it('contributes nothing when the tenant configured no documents', () => {
    expect(documentReadinessItems(contractFrom([]), NO_LEGACY)).toEqual([])
  })

  it('falls back to the legacy rail entries with no contract', () => {
    const items = documentReadinessItems(null, {
      hasResultSlip: true,
      hasIdentityDocument: false,
    })
    expect(items.map((row) => row.field)).toEqual(['result_slip', 'extra_kyc'])
    expect(items.map((row) => row.completed)).toEqual([true, false])
  })
})
