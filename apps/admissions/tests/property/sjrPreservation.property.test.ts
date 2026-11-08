/**
 * Student-journey-repair preservation properties (frontend, pure half).
 *
 * Spec: student-journey-repair task 2.3, design "New preservation tests"
 * (frontend (a)-(e)); Properties 12 and 13; clauses 3.3, 3.7, 3.8, 3.11.
 *
 * Written observation-first: each property passes on the unfixed code (HEAD
 * 4a6c4ef) and is re-run unchanged at every task-3 checkpoint. (f) and (g)
 * render the app with its real API client and live in
 * `sjrPreservation.property.test.tsx`.
 */
import * as fc from 'fast-check'
import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  isPaymentResolvedForProgress,
  normalizePaymentStatus,
  type CanonicalPaymentStatus,
} from '@/lib/paymentStatus'
import {
  WIZARD_DRAFT_DEBOUNCE_MS,
  deriveWizardDraftSaveView,
} from '@/lib/wizardDraftController'
import { fingerprintDraftProjection } from '@/lib/wizardDraftProjection'
import { normalizeZambianMsisdn } from '@/lib/zambianMsisdn'
import { projectDraftAnswers } from '@/pages/student/applicationWizard/lib/draftAutosave'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'
import { createDraftHarness, settle } from '../unit/__fixtures__/wizardDraftHarness'

// ---------------------------------------------------------------------------
// (a) payment status normalisation is unchanged for arbitrary strings (3.3)
// ---------------------------------------------------------------------------

/** HEAD's mapping, written down as data so a change to the function shows up. */
const HEAD_NORMALISED: Readonly<Record<string, CanonicalPaymentStatus>> = {
  pending: 'pending_review',
  pending_review: 'pending_review',
  verified: 'verified',
  paid: 'verified',
  successful: 'verified',
  force_approved: 'verified',
  failed: 'rejected',
  rejected: 'rejected',
  deferred: 'deferred',
  expired: 'not_paid',
}
const KNOWN = Object.keys(HEAD_NORMALISED)
const paymentInput = fc.oneof(
  fc.constantFrom(...KNOWN),
  fc.constantFrom(...KNOWN).map((value) => value.toUpperCase()),
  fc.constantFrom(...KNOWN).map((value) => ` ${value} `),
  fc.string(),
  fc.constant(''),
)

describe('(a) payment status normalisation (clause 3.3)', () => {
  it('maps every string as HEAD did', () => {
    fc.assert(
      fc.property(paymentInput, (value) => {
        const expected = Object.hasOwn(HEAD_NORMALISED, value) ? HEAD_NORMALISED[value] : 'not_paid'
        expect(normalizePaymentStatus(value)).toBe(expected)
        expect(isPaymentResolvedForProgress(value)).toBe(
          expected === 'verified' || value === 'deferred',
        )
      }),
      { numRuns: 500 },
    )
  })

  it('treats null and undefined as not paid', () => {
    expect(normalizePaymentStatus(null)).toBe('not_paid')
    expect(normalizePaymentStatus(undefined)).toBe('not_paid')
    expect(isPaymentResolvedForProgress(null)).toBe(false)
    expect(isPaymentResolvedForProgress(undefined)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// (b) any missing readiness item keeps Submit disabled (3.8)
// ---------------------------------------------------------------------------

const canonicalSubjectId = (n: number) => `0000000${n}-0000-4000-8000-00000000000${n}`.slice(-36)
const COMPLETE_VALUES: Partial<WizardFormData> = {
  full_name: 'Preservation Student',
  email: 'preservation@example.com',
  phone: '+260971234567',
  nrc_number: '123456/78/9',
  date_of_birth: '2004-05-04',
  sex: 'Male' as WizardFormData['sex'],
  residence_town: 'Lusaka',
  program: 'programme-1',
  intake: 'intake-1',
}

/** Every input field passed explicitly (task 3.22 makes them all required). */
function completeInput() {
  return {
    values: { ...COMPLETE_VALUES },
    selectedGrades: [1, 2, 3, 4, 5].map((n) => ({ subject_id: canonicalSubjectId(n), grade: 4 })),
    uploadedFiles: { result_slip: true, extra_kyc: true } as Record<string, boolean>,
    hasResultSlipFile: false,
    hasIdentityFile: false,
    requiredDocumentItems: undefined as
      | Array<{ field: string; label: string; message: string; completed: boolean }>
      | undefined,
    paymentStatus: 'successful' as 'pending' | 'successful' | 'failed' | 'deferred' | null,
    confirmSubmission: true,
    assignmentResolved: true,
  }
}

type Knockout = (input: ReturnType<typeof completeInput>) => void
const KNOCKOUTS: Record<string, Knockout> = {
  program: (i) => { i.values.program = '' },
  intake: (i) => { i.values.intake = '' },
  assignment: (i) => { i.assignmentResolved = false },
  full_name: (i) => { i.values.full_name = '' },
  email: (i) => { i.values.email = '' },
  phone: (i) => { i.values.phone = '' },
  identity_number: (i) => { i.values.nrc_number = ''; i.values.passport_number = '' },
  date_of_birth: (i) => { i.values.date_of_birth = '' },
  sex: (i) => { i.values.sex = '' as WizardFormData['sex'] },
  residence_town: (i) => { i.values.residence_town = '' },
  grades_short: (i) => { i.selectedGrades = i.selectedGrades.slice(0, 4) },
  grades_duplicate: (i) => { i.selectedGrades = [...i.selectedGrades.slice(0, 4), { ...i.selectedGrades[0] }] },
  grades_unresolved: (i) => { i.selectedGrades = [...i.selectedGrades.slice(0, 4), { subject_id: 'Biology', grade: 3 }] },
  result_slip: (i) => { i.uploadedFiles = { ...i.uploadedFiles, result_slip: false } },
  identity_document: (i) => { i.uploadedFiles = { ...i.uploadedFiles, extra_kyc: false } },
  tenant_document: (i) => {
    i.requiredDocumentItems = [
      { field: 'nursing_council_letter', label: 'Letter', message: 'Upload it.', completed: false },
    ]
  },
  payment_missing: (i) => { i.paymentStatus = null },
  payment_pending: (i) => { i.paymentStatus = 'pending' },
  payment_failed: (i) => { i.paymentStatus = 'failed' },
  confirmation: (i) => { i.confirmSubmission = false },
}

describe('(b) readiness with any missing item (clause 3.8)', () => {
  it('the complete input can submit (control)', () => {
    expect(buildWizardReadiness(completeInput()).canSubmit).toBe(true)
  })

  it('keeps canSubmit false when any non-empty set of items is missing', () => {
    fc.assert(
      fc.property(fc.subarray(Object.keys(KNOCKOUTS), { minLength: 1 }), (missing) => {
        const input = completeInput()
        for (const key of missing) KNOCKOUTS[key](input)
        const readiness = buildWizardReadiness(input)
        expect(readiness.canSubmit).toBe(false)
        expect(readiness.missingItems.length).toBeGreaterThan(0)
      }),
      { numRuns: 300 },
    )
  })
})

// ---------------------------------------------------------------------------
// (c) answer-only edit sequences save as before (3.7)
// ---------------------------------------------------------------------------

const EDITABLE: Array<keyof WizardFormData> = ['residence_town', 'full_name', 'next_of_kin_name']
const WORDS = ['Kabwe', 'Chipata', 'Mongu', 'Solwezi', 'Kasama', 'Ndola']

/**
 * One burst: a few answer edits 10 ms apart, then quiet until the next 8 s
 * autosave tick. Each burst therefore ends in exactly one debounce flush, and no
 * sweep tick lands inside a burst, so the expected save count is just "bursts
 * whose net answers differ from the last saved answers".
 */
const burst = fc.array(
  fc.record({ field: fc.constantFrom(...EDITABLE), value: fc.constantFrom(...WORDS) }),
  { minLength: 1, maxLength: 5 },
)

describe('(c) answer-only edits in the draft machine (clause 3.7)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes once per changed burst and ends saved', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(burst, { minLength: 1, maxLength: 4 }), async (bursts) => {
        const h = createDraftHarness()
        h.machine.activate()
        h.hydrate()
        const project = () => fingerprintDraftProjection(projectDraftAnswers(h.values))
        let saved = project()
        let expectedWrites = 0

        for (const edits of bursts) {
          for (const { field, value } of edits) {
            h.edit(field, value)
            await vi.advanceTimersByTimeAsync(10)
          }
          const changed = project() !== saved
          await vi.advanceTimersByTimeAsync(8_000 - edits.length * 10)
          await settle()
          if (changed) {
            expectedWrites += 1
            saved = project()
          }
          expect(h.server.updateCalls).toHaveLength(expectedWrites)
          if (expectedWrites > 0) {
            expect(deriveWizardDraftSaveView(h.machine.getSnapshot()).status).toBe('saved')
          }
        }

        // Each write carried the latest values for what the student edited.
        for (const field of EDITABLE) {
          if (h.server.updateCalls.some((call) => field in call.payload)) {
            expect(h.server.answers[field]).toBe(h.values[field])
          }
        }
        expect(h.server.startCalls).toHaveLength(0)
        expect(WIZARD_DRAFT_DEBOUNCE_MS).toBeLessThan(8_000 - 5 * 10)
        h.machine.dispose?.()
      }),
      { numRuns: 25 },
    )
  })
})

// ---------------------------------------------------------------------------
// (d) a first-time-successful upload is exactly one request (3.11 / 3.5)
// ---------------------------------------------------------------------------

const request = vi.fn()
const upload = vi.fn()
vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => request(...args),
    upload: (...args: unknown[]) => upload(...args),
  },
}))

const APPLICATION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function contract() {
  return {
    application_id: APPLICATION_ID,
    configuration_version: 'cfg-sjr-pres',
    requirements: [
      {
        document_type: 'result_slip',
        label: 'Grade 12 result slip',
        required: true,
        source: 'platform',
        accepts_document_types: ['result_slip'],
        accepted_mime_types: ['application/pdf', 'image/jpeg', 'image/png'],
        accepted_extensions: ['.pdf', '.jpg', '.jpeg', '.png'],
        max_size_bytes: 10 * 1024 * 1024,
        state: 'missing',
        document: null,
      },
    ],
  }
}

describe('(d) a successful upload (clause 3.5)', () => {
  it('issues exactly one upload request', async () => {
    const { useRequiredDocuments } = await import('@/hooks/useRequiredDocuments')
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          ['slip.pdf', 'application/pdf'],
          ['photo.jpg', 'image/jpeg'],
          ['scan.png', 'image/png'],
        ),
        fc.integer({ min: 1, max: 4096 }),
        async ([name, type], size) => {
          request.mockReset()
          upload.mockReset()
          request.mockImplementation(async (endpoint: string) => {
            if (endpoint.endsWith('/required-documents/')) return contract()
            if (endpoint === '/documents/upload/') return { id: 'doc-1' }
            return null
          })
          upload.mockResolvedValue({ id: 'doc-1' })
          const { result, unmount } = renderHook(() =>
            useRequiredDocuments({ applicationId: APPLICATION_ID }),
          )
          await waitFor(() => expect(result.current.requirements).toHaveLength(1))

          await act(async () => {
            await result.current.selectFile('result_slip', new File([new Uint8Array(size)], name, { type }))
          })

          const viaRequest = request.mock.calls.filter(([endpoint]) => endpoint === '/documents/upload/')
          expect(viaRequest.length + upload.mock.calls.length).toBe(1)
          expect(result.current.uploadStates.result_slip?.status).toBe('uploaded')
          unmount()
        },
      ),
      { numRuns: 8 },
    )
  })
})

// ---------------------------------------------------------------------------
// (e) the MSISDN normaliser is idempotent (3.18)
// ---------------------------------------------------------------------------

const msisdnLike = fc.oneof(
  fc.stringMatching(/^\+260[0-9]{9}$/),
  fc.stringMatching(/^260[0-9]{9}$/),
  fc.stringMatching(/^0[0-9]{9}$/),
  fc.stringMatching(/^[0-9]{9}$/),
  fc.stringMatching(/^[0-9 ()+-]{0,16}$/),
  fc.string(),
)

describe('(e) MSISDN normalisation (clause 3.18)', () => {
  it('is idempotent and keeps +260 numbers unchanged', () => {
    fc.assert(
      fc.property(msisdnLike, (input) => {
        const once = normalizeZambianMsisdn(input)
        if (once !== null) {
          expect(normalizeZambianMsisdn(once)).toBe(once)
          expect(once).toMatch(/^\+260\d{9}$/)
        }
        if (/^\+260\d{9}$/.test(input)) expect(once).toBe(input)
      }),
      { numRuns: 500 },
    )
  })
})
