// @vitest-environment node
/**
 * Property Tests: Admissions Quality Hardening
 *
 * This file contains property-based tests for the admissions-quality-hardening spec.
 * Each property test validates a correctness property from the design document.
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { toError } from '../../src/lib/toError'

// Feature: admissions-quality-hardening, Property 9: toError utility always returns an Error instance
describe('Feature: admissions-quality-hardening, Property 9: toError utility always returns an Error instance', () => {
  it('toError(value) always returns an Error instance with a non-empty message for any JS value', () => {
    /**
     * **Validates: Requirements 2.4**
     *
     * For any value of type unknown (including undefined, null, strings, numbers,
     * objects, Error instances, and non-Error objects), toError(value) SHALL return
     * an instance of Error with a non-empty message string.
     */
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = toError(value)

        expect(result).toBeInstanceOf(Error)
        expect(typeof result.message).toBe('string')
        expect(result.message.length).toBeGreaterThan(0)
      }),
      { numRuns: 100 },
    )
  })

  it('toError preserves Error instances passed as input', () => {
    /**
     * **Validates: Requirements 2.4**
     *
     * When the input is already an Error, toError should return it directly
     * (identity behavior).
     */
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).map((msg) => new Error(msg)),
        (error) => {
          const result = toError(error)

          expect(result).toBe(error) // same reference
          expect(result.message).toBe(error.message)
        },
      ),
      { numRuns: 100 },
    )
  })
})

import { CHART_COLORS } from '../../src/lib/chartColors'
import { designTokens } from '../../src/design-system/tokens'

// Feature: admissions-quality-hardening, Property 3: Chart colors are identical between token system and chart module
describe('Feature: admissions-quality-hardening, Property 3: Chart colors are identical between token system and chart module', () => {
  it('every key in CHART_COLORS equals the corresponding designTokens.colors.chart value', () => {
    /**
     * **Validates: Requirements 4.2, 4.4, 4.5**
     *
     * For any key in CHART_COLORS, the value SHALL be strictly equal to the
     * corresponding value in designTokens.colors.chart. The set of keys SHALL
     * be identical between both objects.
     */

    // Assert the key sets are identical
    const chartColorKeys = Object.keys(CHART_COLORS)
    const tokenChartKeys = Object.keys(designTokens.colors.chart)
    expect(chartColorKeys.sort()).toEqual(tokenChartKeys.sort())

    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(CHART_COLORS)),
        (key) => {
          const chartValue = CHART_COLORS[key as keyof typeof CHART_COLORS]
          const tokenValue = designTokens.colors.chart[key as keyof typeof designTokens.colors.chart]
          expect(chartValue).toBe(tokenValue)
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Property 1 & 2: logApiError integration across all instrumented services
// ---------------------------------------------------------------------------
import { vi, beforeEach, afterEach } from 'vitest'

// Mock apiClient.request to throw on demand
const mockRequest = vi.fn()
vi.mock('../../src/services/client', () => ({
  apiClient: { request: (...args: unknown[]) => mockRequest(...args) },
  buildQueryString: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return qs ? `?${qs}` : ''
  },
}))

// Mock logApiError so we can assert it was called
const mockLogApiError = vi.fn()
vi.mock('../../src/lib/apiErrorLogger', () => ({
  logApiError: (...args: unknown[]) => mockLogApiError(...args),
}))

/**
 * Service descriptors used by Properties 1 and 2.
 *
 * Each entry describes:
 *  - name: human-readable label
 *  - context: the first argument passed to logApiError
 *  - invoke: a function that calls the service method (triggering apiClient.request)
 *  - throws: whether the service re-throws the error (true) or returns a fallback (false)
 */
interface ServiceDescriptor {
  name: string
  context: string
  invoke: () => Promise<unknown>
  throws: boolean
}

// Lazy-load services so the mocks above are in place before module evaluation
async function getServiceDescriptors(): Promise<ServiceDescriptor[]> {
  const { authService } = await import('../../src/services/auth')
  const { listActiveSessions, terminateSessionById, terminateAllOtherSessions } = await import('../../src/services/sessionService')
  const { adminAuditService } = await import('../../src/services/admin/audit')
  const { userService } = await import('../../src/services/admin/users')

  return [
    // auth — all methods throw
    { name: 'auth.register', context: 'auth', invoke: () => authService.register({ email: 'a@b.c', password: 'x', fullName: 'A B' }), throws: true },
    { name: 'auth.login', context: 'auth', invoke: () => authService.login({ email: 'a@b.c', password: 'x' }), throws: true },
    { name: 'auth.logout', context: 'auth', invoke: () => authService.logout(), throws: true },
    { name: 'auth.session', context: 'auth', invoke: () => authService.session(), throws: true },
    { name: 'auth.refresh', context: 'auth', invoke: () => authService.refresh(), throws: true },
    { name: 'auth.passwordReset', context: 'auth', invoke: () => authService.passwordReset({ email: 'a@b.c' }), throws: true },
    { name: 'auth.passwordResetConfirm', context: 'auth', invoke: () => authService.passwordResetConfirm({ token: 't', newPassword: 'p' }), throws: true },

    // session — methods return fallback objects
    { name: 'session.listActiveSessions', context: 'session', invoke: () => listActiveSessions(), throws: false },
    { name: 'session.terminateSessionById', context: 'session', invoke: () => terminateSessionById('sid'), throws: false },
    { name: 'session.terminateAllOtherSessions', context: 'session', invoke: () => terminateAllOtherSessions(), throws: false },

    // admin-audit — list() throws
    { name: 'admin-audit.list', context: 'admin-audit', invoke: () => adminAuditService.list(), throws: true },

    // admin-users — all methods throw
    { name: 'admin-users.list', context: 'admin-users', invoke: () => userService.list(), throws: true },
    { name: 'admin-users.getById', context: 'admin-users', invoke: () => userService.getById('uid'), throws: true },
    { name: 'admin-users.getPermissions', context: 'admin-users', invoke: () => userService.getPermissions('uid'), throws: true },
    { name: 'admin-users.create', context: 'admin-users', invoke: () => userService.create({ email: 'a@b.c', password: 'x', full_name: 'A B', role: 'student' }), throws: true },
    { name: 'admin-users.update', context: 'admin-users', invoke: () => userService.update('uid', { full_name: 'A B', email: 'a@b.c', role: 'student' }), throws: true },
    { name: 'admin-users.remove', context: 'admin-users', invoke: () => userService.remove('uid'), throws: true },
    { name: 'admin-users.export', context: 'admin-users', invoke: () => userService.export(), throws: true },
  ]
}

// Feature: admissions-quality-hardening, Property 1: logApiError is called on API failure for all instrumented services
// Feature: admissions-quality-hardening, Property 2: Error propagation behavior is preserved after logApiError integration
describe('Feature: admissions-quality-hardening, Properties 1 & 2: logApiError integration', () => {
  let descriptors: ServiceDescriptor[]

  beforeEach(async () => {
    vi.clearAllMocks()
    mockRequest.mockReset()
    mockLogApiError.mockReset()
    descriptors = await getServiceDescriptors()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Property 1: logApiError is called with correct context on API failure for every instrumented service', async () => {
    /**
     * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
     *
     * For any service in the instrumented set and for any error thrown by
     * apiClient.request, when the service method's catch block executes,
     * logApiError SHALL have been called with the correct context string
     * and the failing endpoint path.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Array.from({ length: descriptors.length }, (_, i) => i)),
        fc.string({ minLength: 1 }),
        async (serviceIndex, errorMessage) => {
          vi.clearAllMocks()
          const descriptor = descriptors[serviceIndex]!
          const testError = new Error(errorMessage)
          mockRequest.mockRejectedValue(testError)

          try {
            await descriptor.invoke()
          } catch {
            // expected for throwing services
          }

          // logApiError must have been called at least once with the correct context
          expect(mockLogApiError).toHaveBeenCalled()
          const calls = mockLogApiError.mock.calls
          const matchingCall = calls.find(
            (call: unknown[]) => call[0] === descriptor.context,
          )
          expect(matchingCall).toBeDefined()
          // The second argument should be a string (endpoint)
          expect(typeof matchingCall![1]).toBe('string')
          // The third argument should be the error
          expect(matchingCall![2]).toBe(testError)
        },
      ),
      { numRuns: 100 },
    )
  })

  it('Property 2: Error propagation behavior is preserved after logApiError integration', async () => {
    /**
     * **Validates: Requirements 3.7**
     *
     * For any service method that previously threw errors to callers,
     * after adding logApiError, the method SHALL still throw the same error.
     * For any service method that previously returned a fallback value on error,
     * after adding logApiError, the method SHALL still return the same fallback shape.
     */
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...Array.from({ length: descriptors.length }, (_, i) => i)),
        fc.string({ minLength: 1 }),
        async (serviceIndex, errorMessage) => {
          vi.clearAllMocks()
          const descriptor = descriptors[serviceIndex]!
          const testError = new Error(errorMessage)
          mockRequest.mockRejectedValue(testError)

          if (descriptor.throws) {
            // Services that throw: must re-throw the same error
            await expect(descriptor.invoke()).rejects.toThrow(testError)
          } else {
            // Services that return fallback: must NOT throw, and must return { success: false }
            const result = await descriptor.invoke()
            expect(result).toBeDefined()
            expect((result as { success: boolean }).success).toBe(false)
          }
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Feature: admissions-quality-hardening, Property 4: bulkStatus serializes applicationIds to snake_case
// ---------------------------------------------------------------------------
describe('Feature: admissions-quality-hardening, Property 4: bulkStatus serializes applicationIds to snake_case', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequest.mockReset()
    // Resolve with a dummy response so bulkStatus doesn't throw
    mockRequest.mockResolvedValue({ success: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('bulkStatus sends application_ids (snake_case) in the JSON body matching the input applicationIds array', async () => {
    /**
     * **Validates: Requirements 9.1, 9.2**
     *
     * For any non-empty array of application ID strings and any status string,
     * calling applicationService.bulkStatus({ applicationIds, status, notes })
     * SHALL produce a JSON request body where the key is `application_ids`
     * (snake_case) and the value is the same array.
     */
    const { applicationService } = await import('../../src/services/applications')

    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1 }),
        async (applicationIds, status) => {
          mockRequest.mockReset()
          mockRequest.mockResolvedValue({ success: true })

          await applicationService.bulkStatus({ applicationIds, status })

          expect(mockRequest).toHaveBeenCalledOnce()

          const [endpoint, options] = mockRequest.mock.calls[0] as [string, { body: string }]
          expect(endpoint).toContain('bulk-status')

          const body = JSON.parse(options.body) as Record<string, unknown>

          // Must use snake_case key `application_ids`, NOT camelCase `applicationIds`
          expect(body).toHaveProperty('application_ids')
          expect(body).not.toHaveProperty('applicationIds')
          expect(body.application_ids).toEqual(applicationIds)
        },
      ),
      { numRuns: 100 },
    )
  })
})


// ---------------------------------------------------------------------------
// Feature: admissions-quality-hardening, Property 5: All route config entries resolve to defined components
// ---------------------------------------------------------------------------
import { routes } from '../../src/routes/config'

describe('Feature: admissions-quality-hardening, Property 5: All route config entries resolve to defined components', () => {
  it('every route entry has a defined element (not undefined or null)', () => {
    /**
     * **Validates: Requirements 11.6, 11.7**
     *
     * For any route entry in the routes array exported from src/routes/config.tsx,
     * the element field SHALL be a defined value (not undefined or null).
     */
    fc.assert(
      fc.property(
        fc.constantFrom(...routes),
        (route) => {
          expect(route.element).toBeDefined()
          expect(route.element).not.toBeNull()
        },
      ),
      { numRuns: 100 },
    )
  })
})
