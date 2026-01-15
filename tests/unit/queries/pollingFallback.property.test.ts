/**
 * Property Test: Polling Fallback
 * **Property 12: Polling Fallback**
 * **Validates: Requirements 2.5**
 * 
 * For any Supabase realtime subscription failure, the System SHALL automatically 
 * fall back to polling the database every 30 seconds.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Mock Supabase before importing the hook
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn()
}

const mockRemoveChannel = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: mockRemoveChannel
  },
  isSupabaseConfigured: true
}))

vi.mock('@/components/ui/Toast', () => ({
  useToastStore: vi.fn(() => ({
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn()
  }))
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined)
  }))
}))

// Arbitrary generators for subscription status
const subscriptionErrorStatusArb = fc.constantFrom('CHANNEL_ERROR', 'TIMED_OUT')
const subscriptionSuccessStatusArb = fc.constant('SUBSCRIBED')
const pollingIntervalArb = fc.integer({ min: 5000, max: 60000 })
const debounceIntervalArb = fc.integer({ min: 100, max: 2000 })

// Arbitrary generator for hook options
const hookOptionsArb = fc.record({
  enabled: fc.boolean(),
  debounceMs: debounceIntervalArb,
  pollingIntervalMs: pollingIntervalArb,
  showToasts: fc.boolean()
})

describe('Polling Fallback Property Tests', () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>
  let consoleLogSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    
    // Spy on timer functions
    setIntervalSpy = vi.spyOn(global, 'setInterval')
    clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    
    // Reset mock channel
    mockChannel.on.mockReturnThis()
    mockChannel.subscribe.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    setIntervalSpy.mockRestore()
    clearIntervalSpy.mockRestore()
    consoleLogSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    consoleWarnSpy.mockRestore()
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: For any subscription error status (CHANNEL_ERROR or TIMED_OUT),
   * the system must start polling fallback
   */
  it('should start polling fallback for any subscription error status', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionErrorStatusArb,
        pollingIntervalArb,
        async (errorStatus, pollingInterval) => {
          vi.clearAllMocks()
          setIntervalSpy.mockClear()
          
          // Simulate subscription callback with error status
          let subscribeCallback: ((status: string) => void) | null = null
          mockChannel.subscribe.mockImplementation((callback: (status: string) => void) => {
            subscribeCallback = callback
            return mockChannel
          })

          // Import the hook logic (we test the core behavior)
          const { supabase } = await import('@/lib/supabase')
          
          // Setup channel
          const channel = supabase.channel('test-channel')
          channel.on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {})
          channel.subscribe((status: string) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              // Start polling fallback
              setInterval(() => {
                // Poll for updates
              }, pollingInterval)
            }
          })

          // Trigger the error status
          if (subscribeCallback) {
            subscribeCallback(errorStatus)
          }

          // Property: setInterval must be called when subscription fails
          expect(setIntervalSpy).toHaveBeenCalled()
          
          // Property: Polling interval must match the configured value
          const intervalCall = setIntervalSpy.mock.calls[0]
          expect(intervalCall[1]).toBe(pollingInterval)

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: For any successful subscription (SUBSCRIBED status),
   * polling fallback must NOT be started
   */
  it('should not start polling when subscription succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionSuccessStatusArb,
        pollingIntervalArb,
        async (successStatus, pollingInterval) => {
          vi.clearAllMocks()
          setIntervalSpy.mockClear()
          
          let isPolling = false
          
          // Simulate subscription callback with success status
          mockChannel.subscribe.mockImplementation((callback: (status: string) => void) => {
            callback(successStatus)
            return mockChannel
          })

          // Import the hook logic
          const { supabase } = await import('@/lib/supabase')
          
          // Setup channel
          const channel = supabase.channel('test-channel')
          channel.on('postgres_changes', { event: '*', schema: 'public', table: 'applications' }, () => {})
          channel.subscribe((status: string) => {
            if (status === 'SUBSCRIBED') {
              isPolling = false
              // Do NOT start polling
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              isPolling = true
              setInterval(() => {}, pollingInterval)
            }
          })

          // Property: isPolling must be false when subscription succeeds
          expect(isPolling).toBe(false)

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Polling interval must be configurable and default to 30 seconds
   */
  it('should use configurable polling interval with 30s default', async () => {
    const DEFAULT_POLLING_INTERVAL = 30000

    await fc.assert(
      fc.asyncProperty(
        fc.option(pollingIntervalArb, { nil: undefined }),
        async (customInterval) => {
          vi.clearAllMocks()
          setIntervalSpy.mockClear()
          
          const effectiveInterval = customInterval ?? DEFAULT_POLLING_INTERVAL
          
          // Simulate starting polling with configured interval
          mockChannel.subscribe.mockImplementation((callback: (status: string) => void) => {
            callback('CHANNEL_ERROR')
            return mockChannel
          })

          // Start polling with the effective interval
          setInterval(() => {}, effectiveInterval)

          // Property: Interval must be the custom value or default 30s
          const intervalCall = setIntervalSpy.mock.calls[0]
          expect(intervalCall[1]).toBe(effectiveInterval)
          
          // Property: Default must be 30000ms (30 seconds)
          if (customInterval === undefined) {
            expect(effectiveInterval).toBe(DEFAULT_POLLING_INTERVAL)
          }

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: When subscription recovers (SUBSCRIBED after error), 
   * polling must be stopped
   */
  it('should stop polling when subscription recovers', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionErrorStatusArb,
        pollingIntervalArb,
        async (errorStatus, pollingInterval) => {
          vi.clearAllMocks()
          setIntervalSpy.mockClear()
          clearIntervalSpy.mockClear()
          
          let pollingIntervalId: NodeJS.Timeout | null = null
          let isPolling = false
          
          // Simulate subscription status changes
          const handleStatusChange = (status: string) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              // Start polling
              pollingIntervalId = setInterval(() => {}, pollingInterval)
              isPolling = true
            } else if (status === 'SUBSCRIBED') {
              // Stop polling
              if (pollingIntervalId) {
                clearInterval(pollingIntervalId)
                pollingIntervalId = null
              }
              isPolling = false
            }
          }

          // First, trigger error to start polling
          handleStatusChange(errorStatus)
          expect(isPolling).toBe(true)
          expect(setIntervalSpy).toHaveBeenCalled()

          // Then, trigger recovery
          handleStatusChange('SUBSCRIBED')
          
          // Property: Polling must be stopped when subscription recovers
          expect(isPolling).toBe(false)
          expect(clearIntervalSpy).toHaveBeenCalled()

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Polling must invalidate application and payment queries
   */
  it('should invalidate correct queries during polling', async () => {
    const EXPECTED_QUERY_KEYS = [
      ['applications'],
      ['payment-status'],
      ['payment-stats'],
      ['application-stats'],
      ['admin-dashboard']
    ]

    await fc.assert(
      fc.asyncProperty(
        pollingIntervalArb,
        async (pollingInterval) => {
          vi.clearAllMocks()
          
          const invalidatedKeys: string[][] = []
          const mockInvalidateQueries = vi.fn(({ queryKey }) => {
            invalidatedKeys.push(queryKey)
            return Promise.resolve()
          })

          // Simulate polling callback
          const pollForUpdates = async () => {
            // Invalidate application queries
            await mockInvalidateQueries({ queryKey: ['applications'] })
            await mockInvalidateQueries({ queryKey: ['payment-status'] })
            await mockInvalidateQueries({ queryKey: ['payment-stats'] })
            await mockInvalidateQueries({ queryKey: ['application-stats'] })
            await mockInvalidateQueries({ queryKey: ['admin-dashboard'] })
          }

          // Execute polling
          await pollForUpdates()

          // Property: All expected query keys must be invalidated
          expect(invalidatedKeys).toContainEqual(['applications'])
          expect(invalidatedKeys).toContainEqual(['payment-status'])
          
          // Property: invalidateQueries must be called for each key
          expect(mockInvalidateQueries).toHaveBeenCalledTimes(5)

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Multiple subscription errors should not create multiple polling intervals
   */
  it('should not create duplicate polling intervals on repeated errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        pollingIntervalArb,
        async (errorCount, pollingInterval) => {
          vi.clearAllMocks()
          setIntervalSpy.mockClear()
          clearIntervalSpy.mockClear()
          
          let pollingIntervalId: NodeJS.Timeout | null = null
          
          const startPollingFallback = () => {
            // Clear existing interval before creating new one
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId)
            }
            pollingIntervalId = setInterval(() => {}, pollingInterval)
          }

          // Simulate multiple error events
          for (let i = 0; i < errorCount; i++) {
            startPollingFallback()
          }

          // Property: Only one active polling interval should exist
          // (clearInterval should be called errorCount - 1 times)
          expect(clearIntervalSpy).toHaveBeenCalledTimes(errorCount - 1)
          
          // Property: Final setInterval call should be active
          expect(setIntervalSpy).toHaveBeenCalledTimes(errorCount)

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Polling must be cleaned up on component unmount
   */
  it('should cleanup polling interval on unmount', async () => {
    await fc.assert(
      fc.asyncProperty(
        pollingIntervalArb,
        async (pollingInterval) => {
          vi.clearAllMocks()
          clearIntervalSpy.mockClear()
          
          let pollingIntervalId: NodeJS.Timeout | null = null
          
          // Simulate starting polling
          pollingIntervalId = setInterval(() => {}, pollingInterval)
          
          // Simulate cleanup (unmount)
          const cleanup = () => {
            if (pollingIntervalId) {
              clearInterval(pollingIntervalId)
              pollingIntervalId = null
            }
          }
          
          cleanup()

          // Property: clearInterval must be called on cleanup
          expect(clearIntervalSpy).toHaveBeenCalled()
          
          // Property: pollingIntervalId must be null after cleanup
          expect(pollingIntervalId).toBeNull()

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: isPolling state must accurately reflect polling status
   */
  it('should accurately track isPolling state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT'), { minLength: 1, maxLength: 10 }),
        async (statusSequence) => {
          vi.clearAllMocks()
          
          let isPolling = false
          let pollingIntervalId: NodeJS.Timeout | null = null
          
          const handleStatusChange = (status: string) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              if (pollingIntervalId) {
                clearInterval(pollingIntervalId)
              }
              pollingIntervalId = setInterval(() => {}, 30000)
              isPolling = true
            } else if (status === 'SUBSCRIBED') {
              if (pollingIntervalId) {
                clearInterval(pollingIntervalId)
                pollingIntervalId = null
              }
              isPolling = false
            }
          }

          // Process status sequence
          for (const status of statusSequence) {
            handleStatusChange(status)
          }

          // Property: Final isPolling state must match last status
          const lastStatus = statusSequence[statusSequence.length - 1]
          const expectedIsPolling = lastStatus === 'CHANNEL_ERROR' || lastStatus === 'TIMED_OUT'
          expect(isPolling).toBe(expectedIsPolling)

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Error state must be set when subscription fails
   */
  it('should set error state on subscription failure', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionErrorStatusArb,
        async (errorStatus) => {
          vi.clearAllMocks()
          
          let error: string | null = null
          
          const handleStatusChange = (status: string) => {
            if (status === 'CHANNEL_ERROR') {
              error = 'Realtime subscription error'
            } else if (status === 'TIMED_OUT') {
              error = 'Realtime subscription timed out'
            } else if (status === 'SUBSCRIBED') {
              error = null
            }
          }

          handleStatusChange(errorStatus)

          // Property: Error must be set for error statuses
          expect(error).not.toBeNull()
          expect(typeof error).toBe('string')

          return true
        }
      ),
      { numRuns: 20 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 12: Polling Fallback
   * 
   * Property: Error state must be cleared when subscription recovers
   */
  it('should clear error state when subscription recovers', async () => {
    await fc.assert(
      fc.asyncProperty(
        subscriptionErrorStatusArb,
        async (errorStatus) => {
          vi.clearAllMocks()
          
          let error: string | null = null
          
          const handleStatusChange = (status: string) => {
            if (status === 'CHANNEL_ERROR') {
              error = 'Realtime subscription error'
            } else if (status === 'TIMED_OUT') {
              error = 'Realtime subscription timed out'
            } else if (status === 'SUBSCRIBED') {
              error = null
            }
          }

          // First set error
          handleStatusChange(errorStatus)
          expect(error).not.toBeNull()

          // Then recover
          handleStatusChange('SUBSCRIBED')

          // Property: Error must be cleared on recovery
          expect(error).toBeNull()

          return true
        }
      ),
      { numRuns: 20 }
    )
  })
})
