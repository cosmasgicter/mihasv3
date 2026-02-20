/**
 * Session Listener Hook - Cookie-based authentication
 */

import { useCallback, useEffect, useState, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
import { authRequest, configureAuthController, logoutWithTwoPhaseClear } from '@/services/authController'

export type { User, UserProfile, SignInResult, SignUpResult, PasswordResetResult } from '@/types/auth'
export type AuthUser = User

export function useSessionListener() {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const mountedRef = useRef(true)

  useEffect(() => {
    configureAuthController({
      clearAuthState: () => setUser(null),
      clearCaches: () => queryClient.clear(),
    })
  }, [queryClient])

  useEffect(() => {
    mountedRef.current = true

    async function checkSession() {
      try {
        const response = await authRequest<{ user?: User }>('/api/auth?action=session')
        if (!mountedRef.current) return

        if (response.success && response.data?.user) {
          setUser(response.data.user)
        } else {
          setUser(null)
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false)
        }
      }
    }

    checkSession()

    return () => {
      mountedRef.current = false
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<SignInResult> => {
    queryClient.clear()

    const result = await authRequest<{ user?: User; profile?: UserProfile }>(
      '/api/auth?action=login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
      {
        attemptRefreshOn401: false,
        redirectOnUnauthorized: false,
      },
    )

    if (!result.success || !result.data?.user) {
      return { error: result.error || 'Login failed' }
    }

    const authUser = result.data.user
    setUser(authUser)
    queryClient.setQueryData(['auth', 'session'], { user: authUser })

    if (result.data.profile) {
      queryClient.setQueryData(['user-profile', authUser.id], result.data.profile)
    }

    window.dispatchEvent(new CustomEvent('userLoggedIn', {
      detail: { userId: authUser.id },
    }))

    return {
      user: authUser,
      profile: result.data.profile,
    }
  }, [queryClient])

  const signUp = useCallback(async (email: string, password: string, userData: Record<string, any>): Promise<SignUpResult> => {
    const { confirmPassword, turnstileToken, full_name, ...cleanUserData } = userData

    const normalizedFullName = typeof full_name === 'string' ? full_name.trim() : ''
    const [firstName, ...lastNameParts] = normalizedFullName.split(/\s+/).filter(Boolean)
    const lastName = lastNameParts.join(' ')

    if (!firstName || !lastName) {
      return { error: 'Please provide your full name (first and last name).' }
    }

    const result = await authRequest<{ user?: User }>(
      '/api/auth?action=register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
          ...cleanUserData,
        }),
      },
      {
        attemptRefreshOn401: false,
        redirectOnUnauthorized: false,
      },
    )

    if (!result.success) {
      return { error: result.error || 'Unable to create account' }
    }

    queryClient.clear()

    const userPayload = result.data?.user
    if (userPayload) {
      setUser(userPayload)
      queryClient.setQueryData(['auth', 'session'], { user: userPayload })
      window.dispatchEvent(new CustomEvent('userLoggedIn', { detail: { userId: userPayload.id } }))
      return { user: userPayload }
    }

    return { user: null }
  }, [queryClient])

  const signOut = useCallback(async () => {
    await logoutWithTwoPhaseClear()
    setUser(null)
  }, [])

  const requestPasswordReset = useCallback(async (email: string): Promise<PasswordResetResult> => {
    const result = await authRequest('/api/auth?action=forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    })

    return result.success ? {} : { error: result.error || 'Unable to send reset instructions' }
  }, [])

  const updatePassword = useCallback(async (password: string, token?: string): Promise<PasswordResetResult> => {
    const result = await authRequest<{ user?: User }>('/api/auth?action=reset-password', {
      method: 'POST',
      body: JSON.stringify({ password, token }),
    }, {
      attemptRefreshOn401: false,
      redirectOnUnauthorized: false,
    })

    if (!result.success) {
      return { error: result.error || 'Unable to reset password' }
    }

    if (result.data?.user) {
      setUser(result.data.user)
    }

    return {}
  }, [])

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    requestPasswordReset,
    updatePassword,
  }
}
