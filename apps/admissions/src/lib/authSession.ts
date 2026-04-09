import type { User } from '@/types/auth'
import { isAdminRole } from '@/lib/auth/roles'

type AuthUserEnvelope = {
  user?: (Partial<User> & { first_name?: string; last_name?: string }) | null
}

function normalizeAuthUser(
  payload: (Partial<User> & { first_name?: string; last_name?: string }) | null | undefined
): User | null {
  if (!payload?.id || !payload.email) {
    return null
  }

  const firstName = typeof payload.first_name === 'string' ? payload.first_name.trim() : ''
  const lastName = typeof payload.last_name === 'string' ? payload.last_name.trim() : ''
  const fullName = typeof payload.full_name === 'string' && payload.full_name.trim()
    ? payload.full_name.trim()
    : [firstName, lastName].filter(Boolean).join(' ').trim()

  const resolvedRole =
    payload.role ||
    (typeof payload.user_metadata?.role === 'string' ? payload.user_metadata.role : undefined) ||
    (typeof payload.app_metadata?.role === 'string' ? payload.app_metadata.role : undefined) ||
    'student'

  return {
    ...payload,
    id: String(payload.id),
    email: payload.email,
    role: resolvedRole,
    full_name: fullName || undefined,
  }
}

function hasUserEnvelope(result: unknown): result is AuthUserEnvelope {
  return Boolean(result && typeof result === 'object' && 'user' in result)
}

export function extractAuthUser(result: unknown): User | null {
  if (!result) {
    return null
  }

  if (hasUserEnvelope(result)) {
    return normalizeAuthUser(result.user ?? null)
  }

  return normalizeAuthUser(result as Partial<User> & { first_name?: string; last_name?: string })
}

export function isAdminUser(user: User | null): boolean {
  if (!user) {
    return false
  }

  return isAdminRole(user.role)
}
