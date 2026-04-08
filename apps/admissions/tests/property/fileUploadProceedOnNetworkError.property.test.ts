// Feature: ui-overhaul-and-critical-fixes, Property 7: File upload proceeds on network error
/**
 * Property-based test: File upload proceeds on network error
 *
 * For any file upload attempt where the session verification call to
 * `/auth/session/` fails with a network error (timeout, DNS failure,
 * connection refused — any non-HTTP-status error), the hook proceeds with
 * the upload without throwing a session-expired error.
 *
 * **Validates: Requirements 9.3, 9.4**
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

import { verifySessionWithRetry } from '@/pages/student/applicationWizard/hooks/useApplicationFileUploads'

describe('Property 7: File upload proceeds on network error', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockRequest.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it(
    'for any network error on session check, verifySessionWithRetry returns true without throwing "session has expired"',
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate random network error messages
          fc.oneof(
            fc.constant('Failed to fetch'),
            fc.constant('Network request failed'),
            fc.constant('TypeError: Failed to fetch'),
            fc.constant('net::ERR_CONNECTION_REFUSED'),
            fc.constant('net::ERR_NAME_NOT_RESOLVED'),
            fc.constant('timeout of 5000ms exceeded'),
            fc.constant('ECONNREFUSED'),
            fc.constant('ETIMEDOUT'),
            fc.constant('DNS lookup failed'),
            fc.constant('ERR_QUIC_PROTOCOL_ERROR'),
            fc.string({ minLength: 1, maxLength: 50 }),
          ),
          // Generate the error type: TypeError or plain Error (no status property)
          fc.constantFrom('TypeError', 'Error'),
          async (errorMessage, errorType) => {
            // --- Setup ---
            mockRequest.mockReset()

            // Create a network error (no HTTP status property)
            const networkError =
              errorType === 'TypeError'
                ? new TypeError(errorMessage)
                : new Error(errorMessage)

            mockRequest.mockRejectedValueOnce(networkError)

            // --- Act ---
            const resultPromise = verifySessionWithRetry()

            // Advance timers in case there are any internal delays
            await vi.advanceTimersByTimeAsync(2000)

            const result = await resultPromise

            // --- Assert ---
            // Should return true (proceed with upload), not throw
            expect(result).toBe(true)

            // Only 1 call to apiClient.request — no retry for network errors
            expect(mockRequest).toHaveBeenCalledTimes(1)
            expect(mockRequest).toHaveBeenCalledWith('/auth/session/')
          },
        ),
        { numRuns: 100 },
      )
    },
  )
})
