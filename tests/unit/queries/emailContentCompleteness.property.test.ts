/**
 * Property Test: Email Content Completeness
 * **Property 6: Email Content Completeness**
 * **Validates: Requirements 3.5, 5.3**
 * 
 * For any queued submission confirmation email in `email_queue`, the `template_data` 
 * JSON SHALL contain the application number, program name, student name, and a link 
 * to view the application.
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

// Arbitrary generator for notification data with various edge cases
const notificationDataArb = fc.record({
  applicationId: fc.uuid(),
  userId: fc.uuid(),
  email: fc.emailAddress(),
  fullName: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 0),
  applicationNumber: fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[A-Z0-9-]+$/i.test(s)),
  program: fc.string({ minLength: 2, maxLength: 100 }).filter(s => s.trim().length > 0)
})

// Generator for names with special characters (Zambian names often have apostrophes, hyphens)
const zambianNameArb = fc.oneof(
  fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 0),
  fc.constantFrom(
    "Mwamba N'gandu",
    "Chanda-Mulenga",
    "O'Brien Tembo",
    "Jean-Pierre Banda"
  )
)

// Generator for program names with various formats
const programNameArb = fc.oneof(
  fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 0),
  fc.constantFrom(
    "Bachelor of Science in Nursing",
    "Diploma in Clinical Medicine",
    "Certificate in Pharmacy Technician",
    "BSc. Environmental Health"
  )
)

describe('Email Content Completeness Property Tests', () => {
  let mockInsert: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>
  let capturedEmailQueueData: any

  beforeEach(() => {
    vi.clearAllMocks()
    capturedEmailQueueData = null
    
    // Setup mock chain for Supabase that captures email_queue insert data
    mockInsert = vi.fn().mockImplementation((data) => {
      // Capture the first insert (email_queue)
      if (!capturedEmailQueueData) {
        capturedEmailQueueData = data
      }
      return Promise.resolve({ error: null })
    })
    mockFrom = vi.fn().mockReturnValue({ insert: mockInsert })
    vi.mocked(supabase.from).mockImplementation(mockFrom)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data, template_data must contain studentName
   */
  it('should include studentName in template_data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: template_data must contain studentName matching input fullName
        expect(capturedEmailQueueData).toBeDefined()
        expect(capturedEmailQueueData.template_data).toBeDefined()
        expect(capturedEmailQueueData.template_data.studentName).toBe(data.fullName)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data, template_data must contain applicationNumber
   */
  it('should include applicationNumber in template_data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: template_data must contain applicationNumber matching input
        expect(capturedEmailQueueData).toBeDefined()
        expect(capturedEmailQueueData.template_data).toBeDefined()
        expect(capturedEmailQueueData.template_data.applicationNumber).toBe(data.applicationNumber)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data, template_data must contain program
   */
  it('should include program in template_data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: template_data must contain program matching input
        expect(capturedEmailQueueData).toBeDefined()
        expect(capturedEmailQueueData.template_data).toBeDefined()
        expect(capturedEmailQueueData.template_data.program).toBe(data.program)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data, template_data must contain applicationUrl
   * with the correct application ID
   */
  it('should include applicationUrl with correct applicationId in template_data', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: template_data must contain applicationUrl with the applicationId
        expect(capturedEmailQueueData).toBeDefined()
        expect(capturedEmailQueueData.template_data).toBeDefined()
        expect(capturedEmailQueueData.template_data.applicationUrl).toBeDefined()
        expect(capturedEmailQueueData.template_data.applicationUrl).toContain(data.applicationId)
        
        // Property: applicationUrl must be a valid HTTPS URL
        expect(capturedEmailQueueData.template_data.applicationUrl).toMatch(/^https:\/\//)

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data, template_data must contain submittedAt timestamp
   */
  it('should include submittedAt timestamp in template_data for any valid input', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: template_data must contain submittedAt as valid ISO timestamp
        expect(capturedEmailQueueData).toBeDefined()
        expect(capturedEmailQueueData.template_data).toBeDefined()
        expect(capturedEmailQueueData.template_data.submittedAt).toBeDefined()
        
        // Verify it's a valid ISO date string
        const parsedDate = new Date(capturedEmailQueueData.template_data.submittedAt)
        expect(parsedDate.toString()).not.toBe('Invalid Date')

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: For any valid notification data with special characters in names,
   * template_data must preserve the exact name
   */
  it('should preserve special characters in student names', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          applicationId: fc.uuid(),
          userId: fc.uuid(),
          email: fc.emailAddress(),
          fullName: zambianNameArb,
          applicationNumber: fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[A-Z0-9-]+$/i.test(s)),
          program: programNameArb
        }),
        async (data) => {
          vi.clearAllMocks()
          capturedEmailQueueData = null
          mockInsert.mockImplementation((insertData) => {
            if (!capturedEmailQueueData) {
              capturedEmailQueueData = insertData
            }
            return Promise.resolve({ error: null })
          })
          mockFrom.mockReturnValue({ insert: mockInsert })
          vi.mocked(supabase.from).mockImplementation(mockFrom)

          await triggerSubmissionNotifications(data)

          // Property: studentName must exactly match input, including special characters
          expect(capturedEmailQueueData.template_data.studentName).toBe(data.fullName)

          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: All required template_data fields must be present simultaneously
   */
  it('should include all required fields simultaneously in template_data', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: All required fields must be present in template_data
        const templateData = capturedEmailQueueData.template_data
        expect(templateData).toBeDefined()
        
        const requiredFields = ['studentName', 'applicationNumber', 'program', 'applicationUrl', 'submittedAt']
        requiredFields.forEach(field => {
          expect(templateData).toHaveProperty(field)
          expect(templateData[field]).toBeDefined()
          expect(templateData[field]).not.toBe('')
          expect(templateData[field]).not.toBeNull()
        })

        return true
      }),
      { numRuns: 100 }
    )
  })

  /**
   * Feature: dashboard-realtime-email-fixes, Property 6: Email Content Completeness
   * 
   * Property: Email subject must contain success indicator and MIHAS branding
   */
  it('should have proper email subject with success indicator and branding', async () => {
    await fc.assert(
      fc.asyncProperty(notificationDataArb, async (data) => {
        vi.clearAllMocks()
        capturedEmailQueueData = null
        mockInsert.mockImplementation((insertData) => {
          if (!capturedEmailQueueData) {
            capturedEmailQueueData = insertData
          }
          return Promise.resolve({ error: null })
        })
        mockFrom.mockReturnValue({ insert: mockInsert })
        vi.mocked(supabase.from).mockImplementation(mockFrom)

        await triggerSubmissionNotifications(data)

        // Property: Subject must contain success indicator
        expect(capturedEmailQueueData.subject).toContain('✅')
        
        // Property: Subject must contain MIHAS branding
        expect(capturedEmailQueueData.subject).toContain('MIHAS')
        
        // Property: Subject must indicate successful submission
        expect(capturedEmailQueueData.subject.toLowerCase()).toContain('submitted')

        return true
      }),
      { numRuns: 100 }
    )
  })
})
