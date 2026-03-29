import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const API_PATH = path.resolve(process.cwd(), 'api-src/applications.ts')
const apiContent = fs.readFileSync(API_PATH, 'utf-8')

describe('applications permission guards', () => {
  it('enforces review/payment permissions for sensitive patch actions', () => {
    expect(apiContent).toContain("if (!canReviewApplications)")
    expect(apiContent).toContain("Review permission required")
    expect(apiContent).toContain("if (!canVerifyPayments)")
    expect(apiContent).toContain("Payment verification permission required")
  })

  it('uses read-permission scope for cross-application reads', () => {
    expect(apiContent).toContain("const canReadAllApplications = isAdmin")
    expect(apiContent).toContain("if (!canReadAllApplications || mine === 'true')")
    expect(apiContent).toContain('if (!canReadAllApplications) {')
  })
})
