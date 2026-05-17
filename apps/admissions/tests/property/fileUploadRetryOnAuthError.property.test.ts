// Feature: ui-overhaul-and-critical-fixes, Property 6: File upload retries once on auth error
/**
 * Property-based test: File upload retries once on auth error
 *
 * For any file upload attempt where the session verification call to
 * `/auth/session/` returns a 401 or CSRF-related 403 status, the hook makes exactly one
 * retry attempt after a delay. If the retry also returns one of those auth failures, the hook
 * throws an error with the message containing "session has expired". The total
 * number of session verification calls is exactly 2 (initial + one retry).
 *
 * **Validates: Requirements 9.1**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// ---------------------------------------------------------------------------
// Mock apiClient before importing the module under test
// ---------------------------------------------------------------------------
const mockRequest = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => mockRequest(...args),
  },
}))

import { verifySessionWithRetry, isAuthError } from '@/pages/student/applicationWizard/hooks/useApplicationFileUploads'

describe('Property 6: File upload retries once on auth error', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRequest.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it(
    'for any auth error status (401|403), exactly 2 session verification calls are made and the function throws "session has expired"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Auth failure status: 401 or 403
          fc.constantFrom(401, 403),
          async (authStatus) => {
            // --- Setup ---
            mockRequest.mockReset()

            // Both calls fail with an auth error
            const makeAuthError = () =>
              Object.assign(new Error(`HTTP ${authStatus}`), {
                status: authStatus,
                code: authStatus === 403 ? 'CSRF_INVALID' : undefined,
              })
            mockRequest.mockRejectedValueOnce(makeAuthError())
            mockRequest.mockRejectedValueOnce(makeAuthError())

            // --- Act ---
            // Start the function and immediately attach a catch handler
            // to prevent unhandled rejection warnings
            let caughtError: Error | null = null
            const resultPromise = verifySessionWithRetry().catch((err: Error) => {
              caughtError = err
            })

            // Advance past the 1-second delay between initial call and retry
            await vi.advanceTimersByTimeAsync(1100)

            // Wait for the promise to settle
            await resultPromise

            // --- Assert ---
            // The function should have thrown with "session has expired"
            expect(caughtError).not.toBeNull()
            expect(caughtError!.message).toMatch(/session has expired/i)

            // Exactly 2 calls to apiClient.request (initial + one retry)
            expect(mockRequest).toHaveBeenCalledTimes(2)

            // Both calls should target /auth/session/
            expect(mockRequest).toHaveBeenNthCalledWith(1, '/auth/session/')
            expect(mockRequest).toHaveBeenNthCalledWith(2, '/auth/session/')
          },
        ),
        { numRuns: 100 },
      )
    },
  )

  it(
    'isAuthError correctly identifies 401 and CSRF-related 403 responses as auth errors',
    () => {
      fc.assert(
        fc.property(
          fc.constantFrom(401, 403),
          (status) => {
            const error = Object.assign(new Error(`HTTP ${status}`), {
              status,
              code: status === 403 ? 'CSRF_INVALID' : undefined,
            })
            expect(isAuthError(error)).toBe(true)
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
