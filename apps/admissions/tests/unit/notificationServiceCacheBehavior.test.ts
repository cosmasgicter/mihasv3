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
      useCache: false,
    })
  })
})
