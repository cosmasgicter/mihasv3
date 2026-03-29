import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = vi.fn()

vi.mock('@/services/client', () => ({
  apiClient: {
    request: requestMock,
  },
}))

describe('admin user service', () => {
  beforeEach(() => {
    requestMock.mockReset()
  })

  it('deactivates a user through the admin users endpoint', async () => {
    requestMock.mockResolvedValue({ success: true })

    const { userService } = await import('@/services/admin/users')

    await userService.remove('user-123')

    expect(requestMock).toHaveBeenCalledWith('/admin/users/user-123', {
      method: 'PATCH',
      body: JSON.stringify({ is_active: false }),
    })
  })
})
