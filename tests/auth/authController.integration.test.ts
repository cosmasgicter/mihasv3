import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authRequest, configureAuthController, logoutWithTwoPhaseClear } from '@/services/authController'
import { useToastStore } from '@/stores/toastStore'

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('auth controller integration flows', () => {
  const clearAuthState = vi.fn()
  const clearCaches = vi.fn()
  const redirectToSignIn = vi.fn()

  beforeEach(() => {
    vi.restoreAllMocks()
    clearAuthState.mockReset()
    clearCaches.mockReset()
    redirectToSignIn.mockReset()

    configureAuthController({ clearAuthState, clearCaches, redirectToSignIn })

    window.history.replaceState({}, '', '/student/profile')
  })

  it('handles login successfully without refresh loops', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(jsonResponse(200, {
      success: true,
      data: { user: { id: 'u1', email: 'student@example.com' } },
    }))

    const result = await authRequest<{ user: { id: string } }>('/api/auth?action=login', {
      method: 'POST',
      body: JSON.stringify({ email: 'student@example.com', password: 'secret' }),
    }, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    })

    expect(result.success).toBe(true)
    expect(result.data?.user.id).toBe('u1')
    expect(clearAuthState).not.toHaveBeenCalled()
  })

  it('refreshes once then hard-clears auth on refresh expiry', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { success: false, code: 'SESSION_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(401, { success: false, code: 'REFRESH_EXPIRED' }))

    const result = await authRequest('/api/auth?action=session')

    expect(result.success).toBe(false)
    expect(clearAuthState).toHaveBeenCalledTimes(1)
    expect(clearCaches).toHaveBeenCalledTimes(1)
    expect(redirectToSignIn).toHaveBeenCalledWith('/auth/signin?redirect=%2Fstudent%2Fprofile')
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('executes two-phase logout and reports failure telemetry/toast on server failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('network down'))
    const toastError = vi.spyOn(useToastStore.getState(), 'error')

    const result = await logoutWithTwoPhaseClear()

    expect(clearAuthState).toHaveBeenCalledTimes(1)
    expect(clearCaches).toHaveBeenCalledTimes(1)
    expect(result.success).toBe(false)
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it('redirects post-expiry navigation attempts to /student/profile back to sign-in', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse(401, { success: false, code: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(401, { success: false, code: 'REFRESH_EXPIRED' }))

    await authRequest('/api/auth?action=profile')

    expect(redirectToSignIn).toHaveBeenCalledWith('/auth/signin?redirect=%2Fstudent%2Fprofile')
  })
})
