/**
 * Drift-guard: asserts frontend wizardReadiness payment gate aligns with
 * backend submit_application payment/document checks in services.py.
 *
 * Approach: parse both source files and extract the set of accepted payment
 * statuses and document requirements, then assert they are equivalent.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { normalizePaymentStatus } from '@/lib/paymentStatus'

const BACKEND_SERVICES_PATH = resolve(
  __dirname,
  '../../../../backend/apps/applications/services.py'
)
const FRONTEND_READINESS_PATH = resolve(
  __dirname,
  '../../src/pages/student/applicationWizard/lib/wizardReadiness.ts'
)

function parseBackendPaymentStatuses(): Set<string> {
  const content = readFileSync(BACKEND_SERVICES_PATH, 'utf-8')
  // Find: application.payment_status in ("verified", "paid", "force_approved", "deferred")
  const match = content.match(
    /payment_status\s+in\s*\(([^)]+)\)/
  )
  expect(match, 'Could not find payment_status in (...) in services.py').toBeTruthy()
  const statuses = match![1].match(/"(\w+)"/g)!.map(s => s.replace(/"/g, ''))
  return new Set(statuses)
}

function parseBackendDocumentCheck(): boolean {
  const content = readFileSync(BACKEND_SERVICES_PATH, 'utf-8')
  // Backend checks _application_has_identity_document
  return content.includes('has_identity_document')
}

function parseFrontendUsesNormalizePaymentStatus(): boolean {
  const content = readFileSync(FRONTEND_READINESS_PATH, 'utf-8')
  return content.includes('normalizePaymentStatus')
}

function parseFrontendChecksIdentityDocument(): boolean {
  const content = readFileSync(FRONTEND_READINESS_PATH, 'utf-8')
  // Frontend checks hasIdentityDocument / extra_kyc
  return content.includes('hasIdentityDocument') || content.includes('extra_kyc')
}

describe('Submission Gates Cross-Layer Drift Guard', () => {
  it('backend services.py is parseable and contains payment gate', () => {
    const statuses = parseBackendPaymentStatuses()
    expect(statuses.size).toBeGreaterThanOrEqual(3)
  })

  it('backend accepts verified, paid, force_approved, deferred as valid payment statuses', () => {
    const statuses = parseBackendPaymentStatuses()
    expect(statuses).toContain('verified')
    expect(statuses).toContain('paid')
    expect(statuses).toContain('force_approved')
    expect(statuses).toContain('deferred')
  })

  it('frontend uses normalizePaymentStatus (not raw string compare) for payment gate', () => {
    expect(parseFrontendUsesNormalizePaymentStatus()).toBe(true)
  })

  it('frontend normalizePaymentStatus maps all backend-accepted statuses to verified or deferred', () => {
    const backendStatuses = parseBackendPaymentStatuses()

    for (const status of backendStatuses) {
      const normalized = normalizePaymentStatus(status)
      expect(
        normalized === 'verified' || normalized === 'deferred',
        `Backend accepts "${status}" but normalizePaymentStatus("${status}") = "${normalized}" (expected "verified" or "deferred")`
      ).toBe(true)
    }
  })

  it('both layers require identity document upload', () => {
    expect(parseBackendDocumentCheck()).toBe(true)
    expect(parseFrontendChecksIdentityDocument()).toBe(true)
  })

  it('backend also checks _application_has_completed_payment as fallback', () => {
    const content = readFileSync(BACKEND_SERVICES_PATH, 'utf-8')
    expect(content).toContain('_application_has_completed_payment')
  })
})
