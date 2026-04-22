import { getDisplayName } from '@/lib/userDisplayName'
import type { User, UserProfile } from '@/types/auth'

export function shouldLoadAdminDashboard(user: User | null | undefined): boolean {
  return Boolean(user?.id)
}

export function getAdminDisplayName(
  profile: UserProfile | null | undefined,
  user: User | null | undefined
): string {
  const resolved = getDisplayName(profile, user)
  return resolved === 'Student' ? 'Admin' : resolved
}
