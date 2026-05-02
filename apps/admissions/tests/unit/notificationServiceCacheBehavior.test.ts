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

  it('sends admin notifications with a retry-safe idempotency key', async () => {
    apiRequestSpy.mockResolvedValue({ id: 'notification-1' })
    const { notificationService } = await import('@/services/notifications')

    const result = await notificationService.send({
      to: 'user-1',
      subject: 'Subject',
      message: 'Message',
      type: 'warning',
    })

    expect(result).toBe(true)
    expect(apiRequestSpy).toHaveBeenCalledWith('/notifications/', expect.objectContaining({
      method: 'POST',
    }))

    const requestBody = JSON.parse(String(apiRequestSpy.mock.calls[0]?.[1]?.body))
    expect(requestBody).toMatchObject({
      user_id: 'user-1',
      title: 'Subject',
      message: 'Message',
      type: 'warning',
    })
    expect(typeof requestBody.idempotency_key).toBe('string')
    expect(requestBody.idempotency_key.length).toBeGreaterThan(10)
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

  it('normalizes legacy HTML-stripped notification bodies', async () => {
    const { normalizeNotificationsResponse } = await import('@/services/notifications')

    const result = normalizeNotificationsResponse([
      {
        id: 'notification-3',
        title: 'Payment Expired',
        message: 'pDear Cosmas,/ppYour pending payment expired./ppBest regards,brMIHAS Admissions/p',
        type: 'warning',
        is_read: false,
        created_at: '2026-04-20T12:00:00.000Z',
      },
    ])

    expect(result[0]?.content).toBe(
      'Dear Cosmas,\n\nYour pending payment expired.\n\nBest regards,\nMIHAS Admissions'
    )
  })
})
