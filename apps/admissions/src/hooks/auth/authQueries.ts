import { authService } from '@/services/auth'
import { AuthenticationError } from '@/services/client'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { extractAuthUser } from '@/lib/authSession'
import type { User, UserProfile } from '@/types/auth'

export type SessionQueryData = {
  user?: User
  pendingValidation?: true
} | null

export const SESSION_QUERY_KEY = ['auth', 'session'] as const
export const PROFILE_STALE_TIME_MS = 5 * 60 * 1000

export const profileQueryKey = (userId?: string | null) => ['user-profile', userId] as const

export class ProfilePayloadError extends Error {
  public readonly status = 502

  constructor(message = 'Invalid profile response from server') {
    super(message)
    this.name = 'ProfilePayloadError'
  }
}

export function buildProfileFromUser(user: User | null): UserProfile | null {
  if (!user) {
    return null
  }

  return {
    id: user.id,
    user_id: user.id,
    email: user.email,
    role: user.role,
    full_name: user.full_name,
    first_name: user.first_name,
    last_name: user.last_name,
  }
}

export function sanitizeProfile(data: Record<string, unknown> | null): UserProfile | null {
  if (!data) return null
  return Object.entries(data).reduce((acc, [key, value]) => {
    ;(acc as Record<string, unknown>)[key] = typeof value === 'string'
      ? sanitizeForDisplay(value)
      : value
    return acc
  }, {} as UserProfile)
}

export function isAuthProfileError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const maybeError = error as { name?: string; status?: number }
  return error instanceof AuthenticationError ||
    maybeError.name === 'AuthenticationError' ||
    maybeError.status === 401 ||
    maybeError.status === 403
}

function isRecoverableProfileFetchError(error: unknown): boolean {
  if (error instanceof TypeError) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()
  return error.name === 'TimeoutError' ||
    error.name === 'AbortError' ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('load failed') ||
    message.includes('aborted')
}

export async function fetchSessionData(): Promise<SessionQueryData> {
  const result = await authService.session() as User | { user?: User } | null
  const normalizedUser = extractAuthUser(result)
  if (normalizedUser) {
    return { user: normalizedUser }
  }

  try {
    await authService.refresh()
    const retryResult = await authService.session() as User | { user?: User } | null
    const retryUser = extractAuthUser(retryResult)
    if (retryUser) {
      return { user: retryUser }
    }
  } catch {
    // User is genuinely unauthenticated or refresh is unavailable.
  }

  return null
}

export async function fetchCurrentProfile(user: User): Promise<UserProfile> {
  try {
    const data = await authService.profile()
    const sanitized = sanitizeProfile(data as Record<string, unknown> | null)
    if (sanitized?.id) {
      return sanitized
    }
    throw new ProfilePayloadError()
  } catch (error) {
    if (isAuthProfileError(error)) {
      throw error
    }

    if (isRecoverableProfileFetchError(error)) {
      const fallback = buildProfileFromUser(user)
      if (fallback) {
        return fallback
      }
    }

    throw error
  }
}

export function mergeProfileIntoSessionUser(user: User, profile: UserProfile): User {
  return {
    ...user,
    email: typeof profile.email === 'string' && profile.email ? profile.email : user.email,
    role: typeof profile.role === 'string' && profile.role ? profile.role : user.role,
    full_name: typeof profile.full_name === 'string' ? profile.full_name : user.full_name,
    first_name: typeof profile.first_name === 'string' ? profile.first_name : user.first_name,
    last_name: typeof profile.last_name === 'string' ? profile.last_name : user.last_name,
    updated_at: typeof profile.updated_at === 'string' ? profile.updated_at : user.updated_at,
  }
}
