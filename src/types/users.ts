import { UserProfile } from '@/lib/supabase'

export interface UserStatsSummary {
  total: number
  byRole: Record<UserProfile['role'], number>
}
