/**
 * Property 18 (frontend mirror) — Student official-document status gating.
 *
 * Spec: `multi-tenant-beanola-remediation` — Phase 3 (Official-document
 * consolidation), Requirement 7 (frontend mirror of Requirement 5's backend
 * status/payment gates). This is the frontend counterpart of the backend
 * property in `backend/tests/property/test_official_document_gating_properties.py`.
 *
 * The single pure source of truth for the student official-document gate is
 * `isOfficialDocumentOffered` in `@/lib/officialDocumentGate.ts` — the predicate
 * the student components (`DocumentButtons`, `DownloadReceiptButton`,
 * `ApplicationSlipActions`) consult to decide whether to offer/enable an
 * official-document action. This property exercises that pure predicate
 * directly across documentType × applicationStatus × paymentStatus and asserts
 * the action is offered/enabled IFF the type's gate holds:
 *
 *     application_slip   → a non-draft submitted status        (R5.2)
 *     acceptance_letter  → application is `approved`             (R5.3)
 *     conditional_offer  → application is `conditionally_approved` (R5.4)
 *     payment_receipt    → a verified/completed payment exists   (R5.5)
 *
 * "Non-draft submitted status" is the backend's *closed* allowlist
 * (`official_document_views._NON_DRAFT_SUBMITTED_STATUSES`), not a broad
 * `!== 'draft'` test: terminal statuses (`enrolled`, `rejected`, `withdrawn`,
 * `expired`, `enrollment_expired`) are excluded so the UI never offers a slip
 * the backend would 404-mask (R17.1).
 *
 * The oracle below is computed independently of the implementation (it does not
 * call `isOfficialDocumentOffered` or `isPaymentVerified`) so the property is a
 * genuine check, not a tautology.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 7.5**
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  isOfficialDocumentOffered,
  type OfficialDocumentGateType,
} from '@/lib/officialDocumentGate'

// The four official-document types subject to a student status gate (R5.2–R5.5).
const DOCUMENT_TYPES: readonly OfficialDocumentGateType[] = [
  'application_slip',
  'acceptance_letter',
  'conditional_offer',
  'payment_receipt',
]

// Application statuses spanning the full gate surface: `draft` (no slip), the
// non-draft submitted states, `approved` (acceptance gate),
// `conditionally_approved` (conditional-offer gate), plus terminal states.
const APPLICATION_STATUSES: readonly string[] = [
  'draft',
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
  'enrolled',
  'rejected',
  'withdrawn',
  'expired',
  'enrollment_expired',
]

// Payment status strings the application may carry. `null` models "no payment".
// `verified`/`paid`/`successful`/`force_approved` are the canonical "verified"
// states; everything else is not verified.
const PAYMENT_STATUSES: readonly (string | null)[] = [
  null,
  'verified',
  'paid',
  'successful',
  'force_approved',
  'pending',
  'pending_review',
  'failed',
  'rejected',
  'deferred',
  'expired',
]

// Independent oracle: the canonical "verified" payment states (mirrors the
// `normalizePaymentStatus` → 'verified' branch without calling it).
const VERIFIED_PAYMENT_STATES = new Set<string>([
  'verified',
  'paid',
  'successful',
  'force_approved',
])

// Independent oracle: the backend's closed non-draft submitted allowlist for the
// application-slip gate (mirrors `_NON_DRAFT_SUBMITTED_STATUSES` without importing
// the implementation). Terminal statuses are deliberately absent (R17.1).
const NON_DRAFT_SUBMITTED_STATES = new Set<string>([
  'submitted',
  'under_review',
  'waitlisted',
  'conditionally_approved',
  'approved',
])

/**
 * Independent oracle for the student type gate (R5.2–R5.5). Deliberately does
 * NOT reuse the implementation under test.
 */
function expectedGate(
  documentType: OfficialDocumentGateType,
  applicationStatus: string,
  paymentStatus: string | null,
): boolean {
  switch (documentType) {
    case 'application_slip':
      return NON_DRAFT_SUBMITTED_STATES.has(applicationStatus)
    case 'acceptance_letter':
      return applicationStatus === 'approved'
    case 'conditional_offer':
      return applicationStatus === 'conditionally_approved'
    case 'payment_receipt':
      return paymentStatus !== null && VERIFIED_PAYMENT_STATES.has(paymentStatus)
    default:
      return false
  }
}

const documentTypeArb = fc.constantFrom(...DOCUMENT_TYPES)
const applicationStatusArb = fc.constantFrom(...APPLICATION_STATUSES)
const paymentStatusArb = fc.constantFrom(...PAYMENT_STATUSES)

describe('Property 18 (frontend mirror) — student official-document status gating', () => {
  // Feature: multi-tenant-beanola-remediation, Property 18 (frontend mirror): Student official-document status gating
  it('offers the official action IFF the type gate holds (R5.2–R5.5, R7.5)', () => {
    fc.assert(
      fc.property(
        documentTypeArb,
        applicationStatusArb,
        paymentStatusArb,
        (documentType, applicationStatus, paymentStatus) => {
          const actual = isOfficialDocumentOffered(documentType, applicationStatus, paymentStatus)
          const expected = expectedGate(documentType, applicationStatus, paymentStatus)
          expect(actual).toBe(expected)
        },
      ),
      { numRuns: 25, seed: 0 },
    )
  })

  it('application_slip gate is the closed non-draft submitted allowlist, ignoring payment (R5.2, R17.1)', () => {
    fc.assert(
      fc.property(applicationStatusArb, paymentStatusArb, (applicationStatus, paymentStatus) => {
        const offered = isOfficialDocumentOffered('application_slip', applicationStatus, paymentStatus)
        expect(offered).toBe(NON_DRAFT_SUBMITTED_STATES.has(applicationStatus))
      }),
      { numRuns: 25, seed: 0 },
    )
  })

  it('acceptance_letter is offered only for approved applications (R5.3)', () => {
    fc.assert(
      fc.property(applicationStatusArb, paymentStatusArb, (applicationStatus, paymentStatus) => {
        const offered = isOfficialDocumentOffered('acceptance_letter', applicationStatus, paymentStatus)
        expect(offered).toBe(applicationStatus === 'approved')
      }),
      { numRuns: 25, seed: 0 },
    )
  })

  it('conditional_offer is offered only for conditionally_approved applications (R5.4)', () => {
    fc.assert(
      fc.property(applicationStatusArb, paymentStatusArb, (applicationStatus, paymentStatus) => {
        const offered = isOfficialDocumentOffered('conditional_offer', applicationStatus, paymentStatus)
        expect(offered).toBe(applicationStatus === 'conditionally_approved')
      }),
      { numRuns: 25, seed: 0 },
    )
  })

  it('payment_receipt is offered IFF a verified/completed payment exists, ignoring status (R5.5)', () => {
    fc.assert(
      fc.property(applicationStatusArb, paymentStatusArb, (applicationStatus, paymentStatus) => {
        const offered = isOfficialDocumentOffered('payment_receipt', applicationStatus, paymentStatus)
        const expected = paymentStatus !== null && VERIFIED_PAYMENT_STATES.has(paymentStatus)
        expect(offered).toBe(expected)
      }),
      { numRuns: 25, seed: 0 },
    )
  })

  it('is pure — repeated calls with equal inputs return equal outputs', () => {
    fc.assert(
      fc.property(
        documentTypeArb,
        applicationStatusArb,
        paymentStatusArb,
        (documentType, applicationStatus, paymentStatus) => {
          const a = isOfficialDocumentOffered(documentType, applicationStatus, paymentStatus)
          const b = isOfficialDocumentOffered(documentType, applicationStatus, paymentStatus)
          expect(a).toBe(b)
        },
      ),
      { numRuns: 25, seed: 0 },
    )
  })
})
