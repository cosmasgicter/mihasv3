/**
 * Communication Service Tests
 * Tests for admin-applicant communication functionality
 * 
 * Requirements: 5.4 - Communication system testing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { sendToApplicant, getCommunicationHistory, getLastContactedAt } from '../communicationService'
import { supabase } from '@/lib/supabase'

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    },
    from: vi.fn()
  }
}))

// Mock fetch
global.fetch = vi.fn()

describe('Communication Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendToApplicant', () => {
    it('should send email message successfully', async () => {
      // Mock session
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { id: 'admin-123' },
            access_token: 'test-token'
          } as any
        },
        error: null
      })

      // Mock applicant lookup
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                user_id: 'applicant-123',
                full_name: 'John Doe',
                email: 'john@example.com',
                phone: '+260123456789'
              },
              error: null
            })
          })
        })
      })

      // Mock communication record creation
      mockFrom.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                user_id: 'applicant-123',
                full_name: 'John Doe',
                email: 'john@example.com',
                phone: '+260123456789'
              },
              error: null
            })
          })
        })
      }).mockReturnValueOnce({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'comm-123',
                applicant_id: 'applicant-123',
                channel: 'email',
                message: 'Test message',
                status: 'pending'
              },
              error: null
            })
          })
        })
      }).mockReturnValueOnce({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: null,
            error: null
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      // Mock email API
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response)

      const result = await sendToApplicant({
        applicantId: 'applicant-123',
        channel: 'email',
        message: 'Test message',
        subject: 'Test Subject'
      })

      expect(result.success).toBe(true)
      expect(result.communicationId).toBe('comm-123')
    })

    it('should handle missing applicant', async () => {
      // Mock session
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { id: 'admin-123' },
            access_token: 'test-token'
          } as any
        },
        error: null
      })

      // Mock applicant lookup - not found
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' }
            })
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const result = await sendToApplicant({
        applicantId: 'nonexistent',
        channel: 'email',
        message: 'Test message',
        subject: 'Test Subject'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Applicant not found')
    })

    it('should validate channel availability for SMS', async () => {
      // Mock session
      vi.mocked(supabase.auth.getSession).mockResolvedValue({
        data: {
          session: {
            user: { id: 'admin-123' },
            access_token: 'test-token'
          } as any
        },
        error: null
      })

      // Mock applicant without phone
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: {
                user_id: 'applicant-123',
                full_name: 'John Doe',
                email: 'john@example.com',
                phone: null // No phone number
              },
              error: null
            })
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const result = await sendToApplicant({
        applicantId: 'applicant-123',
        channel: 'sms',
        message: 'Test message'
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('phone number')
    })
  })

  describe('getCommunicationHistory', () => {
    it('should retrieve communication history', async () => {
      const mockHistory = [
        {
          id: 'comm-1',
          applicant_id: 'applicant-123',
          channel: 'email',
          subject: 'Test 1',
          message: 'Message 1',
          status: 'sent',
          sent_by: 'admin-123',
          sent_at: '2025-01-15T10:00:00Z',
          sent_by_profile: { full_name: 'Admin User' }
        }
      ]

      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: mockHistory,
              error: null
            })
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const history = await getCommunicationHistory('applicant-123')

      expect(history).toHaveLength(1)
      expect(history[0].channel).toBe('email')
      expect(history[0].sent_by_name).toBe('Admin User')
    })
  })

  describe('getLastContactedAt', () => {
    it('should retrieve last contacted timestamp', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: { sent_at: '2025-01-15T10:00:00Z' },
                    error: null
                  })
                })
              })
            })
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const lastContacted = await getLastContactedAt('applicant-123')

      expect(lastContacted).toBe('2025-01-15T10:00:00Z')
    })

    it('should return null when no communications exist', async () => {
      const mockFrom = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'Not found' }
                  })
                })
              })
            })
          })
        })
      })

      vi.mocked(supabase.from).mockImplementation(mockFrom as any)

      const lastContacted = await getLastContactedAt('applicant-123')

      expect(lastContacted).toBeNull()
    })
  })
})
