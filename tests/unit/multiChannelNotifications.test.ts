import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/notifications', () => {
  const send = vi.fn()
  return {
    __esModule: true,
    notificationService: {
      send,
      applicationSubmitted: vi.fn(),
      dispatchChannel: vi.fn(),
      getPreferences: vi.fn(),
      updateConsent: vi.fn()
    }
  }
})

vi.mock('@/lib/supabase', () => {
  const supabase = {
    from: vi.fn((table: string) => {
      if (table === 'user_notification_preferences') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    channels: [
                      { type: 'email', enabled: true, priority: 1 }
                    ],
                    optimalTiming: true,
                    frequency: 'immediate'
                  },
                  error: null
                })
            })
          })
        }
      }

      if (table === 'user_profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { email: 'applicant@example.com' },
                  error: null
                })
            })
          })
        }
      }

      if (table === 'notification_logs') {
        return {
          insert: () => Promise.resolve({ error: null })
        }
      }

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null })
          })
        })
      }
    })
  }

  return {
    __esModule: true,
    supabase
  }
})

import { MultiChannelNotificationService } from '@/lib/multiChannelNotifications'
import { notificationService } from '@/services/notifications'
import { supabase } from '@/lib/supabase'

const service = new MultiChannelNotificationService()

const mockedSend = notificationService.send as ReturnType<typeof vi.fn>
const mockedSupabaseFrom = supabase.from as ReturnType<typeof vi.fn>

describe('MultiChannelNotificationService email channel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true when email queue accepts the message', async () => {
    mockedSend.mockResolvedValue(true)

    const success = await service.sendNotification(
      'user-123',
      'document_missing',
      { full_name: 'Test User', missing_documents: 'ID', deadline: 'tomorrow' },
      ['email']
    )

    expect(mockedSend).toHaveBeenCalledWith({
      to: 'applicant@example.com',
      subject: expect.stringContaining('Missing Documents'),
      message: expect.stringContaining('Test User')
    })
    expect(mockedSupabaseFrom).toHaveBeenCalled()
    expect(success).toBe(true)
  })

  it('returns false when email queue rejects the message', async () => {
    mockedSend.mockResolvedValue(false)

    const success = await service.sendNotification(
      'user-123',
      'document_missing',
      { full_name: 'Test User', missing_documents: 'ID', deadline: 'tomorrow' },
      ['email']
    )

    expect(success).toBe(false)
  })
})
