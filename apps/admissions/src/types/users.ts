import { UserProfile } from '@/types/auth'

export interface UserStatsSummary {
  total: number
  byRole: Record<UserProfile['role'], number>
}
