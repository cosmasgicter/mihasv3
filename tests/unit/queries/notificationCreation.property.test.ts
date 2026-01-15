/**
 * Property Test: Submission Notification Creation
 * **Property 5: Submission Notification Creation**
 * **Validates: Requirements 3.1, 5.1, 5.2, 5.3**
 * 
 * For any successful application submission, the System SHALL create both an 
 * in-app notification record in `in_app_notifications` table and queue an email 
 * in `email_queue` table containing the application number, program name, and student name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fc from 'fast-check'

// Mock Supabase before importing the function
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn()
  }
}))

import { triggerSubmissionNotifications } from '@/hooks/useApplicationSubmitFixed'
import { supabase } from '@/lib/supabase'

// Arbitrary generator for notification data
const notificationDataArb = fc.record({
  applicationId: fc.uuid(),
  userId: fc.uuid(),
  email: fc.emailAddress(),
  fullName: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 0),
  applicationNumber: fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[A-Z0-9-]+$/i.test(s)),
  program: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 0)
})

describe('Submission Notification Creation Property Tests', () => {
  let mockInsert: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Setup mock chain for Supabase
    mockInsert = vi.fn().mockResolvedValue({ error: null })
    mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
    vi.mocked(supabase.from).mockImplementation(mockFrom)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, the function must attempt to insert 
   * into all three tables: email_queue, in_app_notifications, and email_notifications
   */
  it('should attempt to insert into all three notification tables for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        mockInsert.mockResolvedValue({ error: null })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: Must call supabase.from exactly 3 times (one for each table)
        expect(supabase.from).toHaveBeenCalledTimes(3)

        // Property: Must insert into email_queue table
        expect(supabase.from).toHaveBeenCalledWith('email_queue')

        // Property: Must insert into in_app_notifications table
        expect(supabase.from).toHaveBeenCalledWith('in_app_notifications')

        // Property: Must insert into email_notifications table
        expect(supabase.from).toHaveBeenCalledWith('email_notifications')

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, the email_queue insert must contain
   * the application number, program name, and student name in template_data
   */
  it('should include required fields in email_queue template_data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        let emailQueueInsertData: any = null
        
        mockInsert.mockImplementation((insertData) => {
          // Capture the insert data for email_queue
          if (!emailQueueInsertData) {
            emailQueueInsertData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: email_queue insert must contain template_data with required fields
        expect(emailQueueInsertData).toBeDefined()
        expect(emailQueueInsertData.template_data).toBeDefined()
        expect(emailQueueInsertData.template_data.studentName).toBe(data.fullName)
        expect(emailQueueInsertData.template_data.applicationNumber).toBe(data.applicationNumber)
        expect(emailQueueInsertData.template_data.program).toBe(data.program)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, the in_app_notifications insert must
   * contain the application number and program in the content
   */
  it('should include application number and program in in_app_notifications content', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        const insertCalls: any[] = []
        
        mockInsert.mockImplementation((insertData) => {
          insertCalls.push(insertData)
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Find the in_app_notifications insert (second call)
        const inAppInsert = insertCalls[1]
        
        // Property: in_app_notifications content must contain application number
        expect(inAppInsert.content).toContain(data.applicationNumber)
        
        // Property: in_app_notifications content must contain program
        expect(inAppInsert.content).toContain(data.program)
        
        // Property: in_app_notifications must have correct user_id
        expect(inAppInsert.user_id).toBe(data.userId)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, the function must return success status
   * when all inserts succeed
   */
  it('should return success when all inserts succeed for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        mockInsert.mockResolvedValue({ error: null })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        const result = await triggerSubmissionNotifications(data)

        // Property: success must be true when all inserts succeed
        expect(result.success).toBe(true)
        expect(result.emailQueueSuccess).toBe(true)
        expect(result.inAppSuccess).toBe(true)
        expect(result.emailNotificationSuccess).toBe(true)
        expect(result.errors).toHaveLength(0)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, the function must handle partial failures
   * gracefully and continue with remaining inserts
   */
  it('should handle partial failures gracefully and continue with remaining inserts', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        let callCount = 0
        
        // First insert (email_queue) fails, others succeed
        mockInsert.mockImplementation(() => {
          callCount++
          if (callCount === 1) {
            return Promise.resolve({ error: { message: 'Test error' } })
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        const result = await triggerSubmissionNotifications(data)

        // Property: Function must still attempt all three inserts even if one fails
        expect(supabase.from).toHaveBeenCalledTimes(3)
        
        // Property: success should still be true if at least one insert succeeded
        expect(result.success).toBe(true)
        
        // Property: emailQueueSuccess should be false due to error
        expect(result.emailQueueSuccess).toBe(false)
        
        // Property: Other inserts should succeed
        expect(result.inAppSuccess).toBe(true)
        expect(result.emailNotificationSuccess).toBe(true)
        
        // Property: errors array should contain the failure
        expect(result.errors.length).toBeGreaterThan(0)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, email must be sent to the correct recipient
   */
  it('should send email to correct recipient for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        let emailQueueInsertData: any = null
        
        mockInsert.mockImplementation((insertData) => {
          if (!emailQueueInsertData) {
            emailQueueInsertData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: email_queue to_email must match input email
        expect(emailQueueInsertData.to_email).toBe(data.email)
        
        // Property: email_queue priority must be 'high' for submission notifications
        expect(emailQueueInsertData.priority).toBe('high')
        
        // Property: email_queue status must be 'pending'
        expect(emailQueueInsertData.status).toBe('pending')

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 5: Submission Notification Creation
   * 
   * Property: For any valid notification data, in_app_notification must have correct type
   */
  it('should create in_app_notification with success type for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        const insertCalls: any[] = []
        
        mockInsert.mockImplementation((insertData) => {
          insertCalls.push(insertData)
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Find the in_app_notifications insert (second call)
        const inAppInsert = insertCalls[1]
        
        // Property: in_app_notification type must be 'success'
        expect(inAppInsert.type).toBe('success')
        
        // Property: in_app_notification read must be false initially
        expect(inAppInsert.read).toBe(false)
        
        // Property: in_app_notification must have action_url
        expect(inAppInsert.action_url).toContain(data.applicationId)

        return true
      }),
      { numRuns: 100 }
    )
  })
})
