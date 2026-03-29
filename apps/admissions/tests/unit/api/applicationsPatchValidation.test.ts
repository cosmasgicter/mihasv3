import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const API_PATH = path.resolve(process.cwd(), 'api-src/applications.ts')
const apiContent = fs.readFileSync(API_PATH, 'utf-8')

describe('applications PATCH action validation coverage', () => {
  it('validates all high-risk patch actions with Zod schemas', () => {
    expect(apiContent).toContain('validatePatchPayload(patchUpdateStatusSchema')
    expect(apiContent).toContain('validatePatchPayload(patchUpdatePaymentStatusSchema')
    expect(apiContent).toContain('validatePatchPayload(patchSendNotificationSchema')
    expect(apiContent).toContain('validatePatchPayload(patchScheduleInterviewSchema')
    expect(apiContent).toContain('validatePatchPayload(patchRescheduleInterviewSchema')
    expect(apiContent).toContain('validatePatchPayload(patchCancelInterviewSchema')
    expect(apiContent).toContain('validatePatchPayload(patchSyncGradesSchema')
  })
})
