import { useState, useCallback } from 'react'
import type { UserProfile } from '@/types/database'
import { UserStatsSummary } from '@/types/users'
import { userService } from '@/services/admin/users'
import { usersData } from '@/data/users'
import { sanitizeForLog } from '@/lib/sanitize'

interface CreateUserData {
  email: string
  password: string
  full_name: string
  phone?: string
  role: string
}

interface UpdateUserData {
  full_name: string
  email: string
  phone?: string
  role: string
}

interface BulkOperationResult {
  success: number
  failed: number
  errors: string[]
}

export function useUserManagement() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createUserMutation = usersData.useCreate()
  const updateUserMutation = usersData.useUpdate()
  const removeUserMutation = usersData.useRemove()

  const createUser = useCallback(async (userData: CreateUserData): Promise<UserProfile | null> => {
    try {
      setLoading(true)
      setError(null)

      const response = await createUserMutation.mutateAsync(userData) as Record<string, unknown> | undefined
      return (response?.data as UserProfile) ?? null
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create user'
      console.error('Failed to create user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return null
    } finally {
      setLoading(false)
    }
  }, [createUserMutation])

  const updateUser = useCallback(async (userId: string, userData: UpdateUserData): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)

      await updateUserMutation.mutateAsync({ id: userId, data: userData })
      return true
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update user'
      console.error('Failed to update user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return false
    } finally {
      setLoading(false)
    }
  }, [updateUserMutation])

  const deleteUser = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)

      await removeUserMutation.mutateAsync(userId)
      return true
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user'
      console.error('Failed to delete user:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return false
    } finally {
      setLoading(false)
    }
  }, [removeUserMutation])

  const bulkUpdateRoles = useCallback(async (
    userIds: string[], 
    newRole: string
  ): Promise<BulkOperationResult> => {
    const result: BulkOperationResult = { success: 0, failed: 0, errors: [] }

    try {
      setLoading(true)
      setError(null)

      for (const userId of userIds) {
        const success = await updateUser(userId, { role: newRole } as UpdateUserData)
        if (success) {
          result.success++
        } else {
          result.failed++
          result.errors.push(`User ${userId}: Update failed`)
        }
      }

      return result
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Bulk operation failed'
      console.error('Bulk role update failed:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return result
    } finally {
      setLoading(false)
    }
  }, [updateUser])

  const bulkDeleteUsers = useCallback(async (userIds: string[]): Promise<BulkOperationResult> => {
    const result: BulkOperationResult = { success: 0, failed: 0, errors: [] }

    try {
      setLoading(true)
      setError(null)

      for (const userId of userIds) {
        const success = await deleteUser(userId)
        if (success) {
          result.success++
        } else {
          result.failed++
          result.errors.push(`User ${userId}: Delete failed`)
        }
      }

      return result
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Bulk delete failed'
      console.error('Bulk delete failed:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return result
    } finally {
      setLoading(false)
    }
  }, [deleteUser])

  const getUserStats = useCallback(async (): Promise<UserStatsSummary | null> => {
    try {
      const result = await userService.list()

      const roleData = (result?.users ?? []) as Array<Pick<UserProfile, 'role'>>
      const stats = roleData.reduce<Record<string, number>>((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1
        return acc
      }, {})

      return {
        total: result?.totalCount ?? roleData.length,
        byRole: stats
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get user stats'
      console.error('Failed to get user stats:', sanitizeForLog(errorMessage))
      return null
    }
  }, [])

  const searchUsers = useCallback(async (query: string, role?: string) => {
    try {
      const filters: { search?: string; role?: string } = {}
      if (query) filters.search = query
      if (role) filters.role = role

      const result = await userService.list(filters)

      return result?.users ?? []
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to search users'
      console.error('Failed to search users:', sanitizeForLog(errorMessage))
      setError(errorMessage)
      return []
    }
  }, [])

  return {
    loading,
    error,
    createUser,
    updateUser,
    deleteUser,
    bulkUpdateRoles,
    bulkDeleteUsers,
    getUserStats,
    searchUsers,
    clearError: () => setError(null)
  }
}