import type { User, UserProfile } from '@/types/auth'

interface NameUserLike extends Partial<User> {
  firstName?: string | null
  lastName?: string | null
  first_name?: string | null
  last_name?: string | null
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function getEmailLocalPart(email: unknown): string | null {
  const cleanEmail = toNonEmptyString(email)
  if (!cleanEmail) return null

  const [localPart] = cleanEmail.split('@')
  return toNonEmptyString(localPart)
}

export function getDisplayName(profile?: UserProfile | null, user?: NameUserLike | null): string {
  const profileFullName = toNonEmptyString(profile?.full_name)
  if (profileFullName) return profileFullName

  const userFullName = toNonEmptyString(user?.full_name)
  if (userFullName) return userFullName

  const firstName = toNonEmptyString(user?.firstName ?? user?.first_name)
  const lastName = toNonEmptyString(user?.lastName ?? user?.last_name)
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim()
  if (combinedName) return combinedName

  const emailLocalPart = getEmailLocalPart(user?.email)
  if (emailLocalPart) return emailLocalPart

  return 'Student'
}
