import { syncUserRole as apiSyncUserRole } from '@/lib/api/authApi'

export async function syncUserRole(userId: string, role: string) {
  return await apiSyncUserRole(userId, role)
}
