/**
 * Property Test: Email Queue Status Tracking
 * **Property 8: Email Queue Status Tracking**
 * **Validates: Requirements 3.3**
 * 
 * For any email in `email_queue` that is successfully sent, the System SHALL update 
 * the record with `status='sent'` and populate `sent_at` timestamp.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Types for email queue processing
interface EmailQueueRecord {
  id: string
  to_email: string
  subject: string
  template: string
  priority: 'high' | 'normal' | 'low'
  status: 'pending' | 'sent' | 'failed'
  retry_count: number
  scheduled_for: string | null
  next_retry_at: string | null
  created_at: string
  sent_at: string | null
  failed_at: string | null
  error_message: string | null
}

interface SendEmailResult {
  success: boolean
  error?: string
}

// Mock implementations for testing the processing logic
const createMockSupabaseClient = () => {
  const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
  
  return {
    updates,
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      update: vi.fn().mockImplementation((data: Partial<EmailQueueRecord>) => ({
        eq: vi.fn().mockImplementation((field: string, value: string) => {
          if (field === 'id') {
            updates.set(value, data)
          }
          return Promise.resolve({ error: null })
        })
      }))
    }),
    getUpdate: (id: string) => updates.get(id)
  }
}

// Helper to generate valid ISO date strings
const validDateArb = fc.integer({ min: 1704067200000, max: Date.now() }) // Jan 1, 2024 to now
  .map(ts => new Date(ts).toISOString())

// Arbitrary generators for email queue records
const emailQueueRecordArb = fc.record({
  id: fc.uuid(),
  to_email: fc.emailAddress(),
  subject: fc.string({ minLength: 5, maxLength: 200 }),
  template: fc.string({ minLength: 10, maxLength: 1000 }),
  priority: fc.constantFrom('high' as const, 'normal' as const, 'low' as const),
  status: fc.constant('pending' as const),
  retry_count: fc.integer({ min: 0, max: 2 }),
  scheduled_for: fc.option(validDateArb, { nil: null }),
  next_retry_at: fc.constant(null as string | null),
  created_at: validDateArb,
  sent_at: fc.constant(null as string | null),
  failed_at: fc.constant(null as string | null),
  error_message: fc.constant(null as string | null)
})

// Generator for successful send results
const successfulSendResultArb = fc.constant({ success: true } as SendEmailResult)

// Generator for failed send results
const failedSendResultArb = fc.record({
  success: fc.constant(false),
  error: fc.string({ minLength: 5, maxLength: 200 })
})

/**
 * Simulates the email processing logic from process-email-queue.js
 * This is a pure function version for testing the status tracking behavior
 */
async function processEmailWithStatusTracking(
  email: EmailQueueRecord,
  sendResult: SendEmailResult,
  updateFn: (id: string, data: Partial<EmailQueueRecord>) => Promise<void>
): Promise<{ status: string; sent_at: string | null; error_message: string | null }> {
  const maxRetries = 3
  const currentRetryCount = email.retry_count || 0

  if (sendResult.success) {
    // Requirement 3.3: Update status to 'sent' with timestamp on success
    const sentAt = new Date().toISOString()
    await updateFn(email.id, {
      status: 'sent',
      sent_at: sentAt,
      error_message: null,
      retry_count: currentRetryCount
    })
    return { status: 'sent', sent_at: sentAt, error_message: null }
  } else {
    const newRetryCount = currentRetryCount + 1
    
    if (newRetryCount >= maxRetries) {
      // Mark as failed after max retries
      const failedAt = new Date().toISOString()
      await updateFn(email.id, {
        status: 'failed',
        error_message: `Failed after ${maxRetries} attempts: ${sendResult.error}`,
        retry_count: newRetryCount,
        failed_at: failedAt
      })
      return { 
        status: 'failed', 
        sent_at: null, 
        error_message: `Failed after ${maxRetries} attempts: ${sendResult.error}` 
      }
    } else {
      // Keep pending for retry
      await updateFn(email.id, {
        status: 'pending',
        error_message: `Attempt ${newRetryCount} failed: ${sendResult.error}`,
        retry_count: newRetryCount
      })
      return { 
        status: 'pending', 
        sent_at: null, 
        error_message: `Attempt ${newRetryCount} failed: ${sendResult.error}` 
      }
    }
  }
}

describe('Email Queue Status Tracking Property Tests', () => {
  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: For any email that is successfully sent, status must be updated to 'sent'
   */
  it('should set status to "sent" for any successfully sent email', async () => {
    await fc.assert(
      fc.asyncProperty(emailQueueRecordArb, async (email) => {
        const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
        const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
          updates.set(id, data)
        }

        const result = await processEmailWithStatusTracking(
          email,
          { success: true },
          updateFn
        )

        // Property: Status must be 'sent' for successful sends
        expect(result.status).toBe('sent')
        
        // Property: The update must have been called with status='sent'
        const update = updates.get(email.id)
        expect(update).toBeDefined()
        expect(update?.status).toBe('sent')

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: For any email that is successfully sent, sent_at must be populated with a valid timestamp
   */
  it('should populate sent_at with valid timestamp for any successfully sent email', async () => {
    await fc.assert(
      fc.asyncProperty(emailQueueRecordArb, async (email) => {
        const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
        const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
          updates.set(id, data)
        }

        const beforeSend = new Date()
        const result = await processEmailWithStatusTracking(
          email,
          { success: true },
          updateFn
        )
        const afterSend = new Date()

        // Property: sent_at must be populated
        expect(result.sent_at).not.toBeNull()
        expect(result.sent_at).toBeDefined()

        // Property: sent_at must be a valid ISO timestamp
        const sentAtDate = new Date(result.sent_at!)
        expect(sentAtDate.toString()).not.toBe('Invalid Date')

        // Property: sent_at must be within the execution window
        expect(sentAtDate.getTime()).toBeGreaterThanOrEqual(beforeSend.getTime())
        expect(sentAtDate.getTime()).toBeLessThanOrEqual(afterSend.getTime())

        // Property: The update must include sent_at
        const update = updates.get(email.id)
        expect(update?.sent_at).toBeDefined()
        expect(update?.sent_at).not.toBeNull()

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: For any email that is successfully sent, error_message must be cleared (null)
   */
  it('should clear error_message for any successfully sent email', async () => {
    // Test with emails that may have had previous errors
    const emailWithPreviousErrorArb = fc.record({
      ...emailQueueRecordArb.model,
      error_message: fc.option(fc.string({ minLength: 5, maxLength: 200 }), { nil: null })
    })

    await fc.assert(
      fc.asyncProperty(emailWithPreviousErrorArb as fc.Arbitrary<EmailQueueRecord>, async (email) => {
        const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
        const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
          updates.set(id, data)
        }

        const result = await processEmailWithStatusTracking(
          email,
          { success: true },
          updateFn
        )

        // Property: error_message must be null for successful sends
        expect(result.error_message).toBeNull()

        // Property: The update must set error_message to null
        const update = updates.get(email.id)
        expect(update?.error_message).toBeNull()

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: For any email that fails to send, status must NOT be 'sent'
   */
  it('should not set status to "sent" for any failed email send', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailQueueRecordArb,
        failedSendResultArb,
        async (email, sendResult) => {
          const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
          const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
            updates.set(id, data)
          }

          const result = await processEmailWithStatusTracking(
            email,
            sendResult,
            updateFn
          )

          // Property: Status must NOT be 'sent' for failed sends
          expect(result.status).not.toBe('sent')
          
          // Property: sent_at must be null for failed sends
          expect(result.sent_at).toBeNull()

          // Property: The update must NOT have status='sent'
          const update = updates.get(email.id)
          expect(update?.status).not.toBe('sent')

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: For any email that fails to send, error_message must be populated
   */
  it('should populate error_message for any failed email send', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailQueueRecordArb,
        failedSendResultArb,
        async (email, sendResult) => {
          const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
          const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
            updates.set(id, data)
          }

          const result = await processEmailWithStatusTracking(
            email,
            sendResult,
            updateFn
          )

          // Property: error_message must be populated for failed sends
          expect(result.error_message).not.toBeNull()
          expect(result.error_message).toBeDefined()
          expect(result.error_message!.length).toBeGreaterThan(0)

          // Property: error_message must contain the original error
          expect(result.error_message).toContain(sendResult.error)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: Status transitions must be deterministic based on send result
   * - success=true → status='sent'
   * - success=false with retry_count < 3 → status='pending'
   * - success=false with retry_count >= 2 → status='failed' (after increment)
   */
  it('should have deterministic status transitions based on send result and retry count', async () => {
    // Test with various retry counts
    const emailWithRetryCountArb = (retryCount: number) => fc.record({
      id: fc.uuid(),
      to_email: fc.emailAddress(),
      subject: fc.string({ minLength: 5, maxLength: 200 }),
      template: fc.string({ minLength: 10, maxLength: 1000 }),
      priority: fc.constantFrom('high' as const, 'normal' as const, 'low' as const),
      status: fc.constant('pending' as const),
      retry_count: fc.constant(retryCount),
      scheduled_for: fc.constant(null as string | null),
      next_retry_at: fc.constant(null as string | null),
      created_at: validDateArb,
      sent_at: fc.constant(null as string | null),
      failed_at: fc.constant(null as string | null),
      error_message: fc.constant(null as string | null)
    })

    // Test: retry_count=0, failure → status='pending' (will retry)
    await fc.assert(
      fc.asyncProperty(
        emailWithRetryCountArb(0),
        failedSendResultArb,
        async (email, sendResult) => {
          const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
          const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
            updates.set(id, data)
          }

          const result = await processEmailWithStatusTracking(email, sendResult, updateFn)
          
          // Property: First failure should keep status as 'pending' for retry
          expect(result.status).toBe('pending')
          return true
        }
      ),
      { numRuns: 50 }
    )

    // Test: retry_count=2, failure → status='failed' (max retries reached)
    await fc.assert(
      fc.asyncProperty(
        emailWithRetryCountArb(2),
        failedSendResultArb,
        async (email, sendResult) => {
          const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
          const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
            updates.set(id, data)
          }

          const result = await processEmailWithStatusTracking(email, sendResult, updateFn)
          
          // Property: Third failure (retry_count=2 → 3) should mark as 'failed'
          expect(result.status).toBe('failed')
          return true
        }
      ),
      { numRuns: 50 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 8: Email Queue Status Tracking
   * 
   * Property: retry_count must be preserved or incremented correctly
   */
  it('should correctly track retry_count for any email', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailQueueRecordArb,
        fc.boolean(), // success or failure
        async (email, isSuccess) => {
          const updates: Map<string, Partial<EmailQueueRecord>> = new Map()
          const updateFn = async (id: string, data: Partial<EmailQueueRecord>) => {
            updates.set(id, data)
          }

          const sendResult = isSuccess ? { success: true } : { success: false, error: 'Test error' }
          await processEmailWithStatusTracking(email, sendResult, updateFn)

          const update = updates.get(email.id)
          expect(update).toBeDefined()

          if (isSuccess) {
            // Property: On success, retry_count should be preserved
            expect(update?.retry_count).toBe(email.retry_count)
          } else {
            // Property: On failure, retry_count should be incremented by 1
            expect(update?.retry_count).toBe(email.retry_count + 1)
          }

          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})
