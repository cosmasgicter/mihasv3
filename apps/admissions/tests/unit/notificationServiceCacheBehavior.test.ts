// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiRequestSpy = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: unknown[]) => apiRequestSpy(...args),
  },
}))

describe('notificationService list caching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiRequestSpy.mockResolvedValue([])
  })

  it('disables local transport caching for the polled inbox list', async () => {
    const { notificationService } = await import('@/services/notifications')

    await notificationService.list()

    expect(apiRequestSpy).toHaveBeenCalledWith('/notifications/', {
      method: 'GET',
    })
  })
})

describe('normalizeNotificationsResponse', () => {
  it('maps backend is_read/message fields to the bell read/content contract', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse({
      success: true,
      data: {
        page: 1,
        pageSize: 20,
        totalCount: 2,
        results: [
          {
            id: 'notification-1',
            title: 'Unread message',
            message: 'Backend message field',
            type: 'success',
            is_read: false,
            action_url: '/student/applications/1',
            created_at: '2026-04-20T10:00:00.000Z',
          },
          {
            id: 'notification-2',
            title: 'Read message',
            message: 'Already read',
            type: 'general',
            is_read: true,
            created_at: '2026-04-20T11:00:00.000Z',
          },
        ],
      },
    })

    expect(result).toEqual([
      {
        id: 'notification-1',
        title: 'Unread message',
        content: 'Backend message field',
        type: 'success',
        read: false,
        action_url: '/student/applications/1',
        created_at: '2026-04-20T10:00:00.000Z',
      },
      {
        id: 'notification-2',
        title: 'Read message',
        content: 'Already read',
        type: 'info',
        read: true,
        created_at: '2026-04-20T11:00:00.000Z',
      },
    ])
  })
})
