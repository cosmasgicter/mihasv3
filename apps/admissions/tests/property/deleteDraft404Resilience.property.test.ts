/**
 * Property-based test: deleteDraft success iff all responses are 200 or 404
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 3.1, 3.2**
 *
 * Property 1 (Bug Condition): For any array of (draftId, statusCode) pairs
 * where statusCode ∈ {200, 404, 500, 403}, `deleteDraft` returns
 * `{ success: true }` ⟺ every statusCode ∈ {200, 404}.
 *
 * Property 2 (Preservation): If any statusCode ∉ {200, 404}, `deleteDraft`
 * returns `{ success: false }`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as fc from 'fast-check'

const OK_CODES = new Set([200, 404])

describe('[PBT] deleteDraft — success iff all responses are 200 or 404', () => {
  const listMock = vi.fn()
  const deleteMock = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    listMock.mockReset()
    deleteMock.mockReset()
    localStorage.clear()
    sessionStorage.clear()

    vi.doMock('@/services/applications', () => ({
      applicationService: {
        list: listMock,
        delete: deleteMock,
        getById: vi.fn(),
        update: vi.fn(),
      },
    }))

    vi.doMock('@/lib/security', () => ({
      generateSecureToken: vi.fn(() => 'pbt-session-token'),
    }))
  })

  it('returns { success: true } iff every delete response is 200 or 404', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            id: fc.uuid(),
            status: fc.constantFrom(200, 404, 500, 403),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        async (drafts) => {
          // Reset mocks for each property iteration
          listMock.mockReset()
          deleteMock.mockReset()

          // Mock list to return the generated draft IDs
          listMock.mockResolvedValue({
            applications: drafts.map((d) => ({ id: d.id })),
          })

          // Mock delete per-ID based on the generated status code.
          // applicationService.delete already converts 404 → { success: true }
          // at the service layer, so both 200 and 404 resolve successfully.
          // Non-OK codes (500, 403) reject with an error carrying .status.
          for (const draft of drafts) {
            if (OK_CODES.has(draft.status)) {
              deleteMock.mockResolvedValueOnce({ success: true })
            } else if (draft.status === 500) {
              deleteMock.mockRejectedValueOnce(
                Object.assign(new Error('Internal Server Error'), { status: 500 }),
              )
            } else {
              deleteMock.mockRejectedValueOnce(
                Object.assign(new Error('Forbidden'), { status: 403 }),
              )
            }
          }

          const { applicationSessionManager } = await import('@/lib/applicationSession')
          const result = await applicationSessionManager.deleteDraft('pbt-user')

          const allOk = drafts.every((d) => OK_CODES.has(d.status))

          if (allOk) {
            expect(result.success).toBe(true)
          } else {
            expect(result.success).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})
