import { useState, useCallback } from 'react'
import { UserProfile, supabase } from '@/lib/supabase'
import { UserStatsSummary } from '@/types/users'
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

      const response = await createUserMutation.mutateAsync(userData)
      return response.data
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
        try {
          const { error } = await supabase
            .from('user_profiles')
            .update({ role: newRole })
            .eq('user_id', userId)

          if (error) throw error
          result.success++
        } catch (err) {
          result.failed++
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          result.errors.push(`User ${userId}: ${errorMessage}`)
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
  }, [])

  const bulkDeleteUsers = useCallback(async (userIds: string[]): Promise<BulkOperationResult> => {
    const result: BulkOperationResult = { success: 0, failed: 0, errors: [] }

    try {
      setLoading(true)
      setError(null)

      for (const userId of userIds) {
        try {
          const { error } = await supabase
            .from('user_profiles')
            .delete()
            .eq('user_id', userId)

          if (error) throw error
          result.success++
        } catch (err) {
          result.failed++
          const errorMessage = err instanceof Error ? err.message : 'Unknown error'
          result.errors.push(`User ${userId}: ${errorMessage}`)
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
  }, [])

  const getUserStats = useCallback(async (): Promise<UserStatsSummary | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('role')

      if (error) throw error

      const roleData = (data ?? []) as Array<Pick<UserProfile, 'role'>>
      const stats = roleData.reduce<Record<UserProfile['role'], number>>((acc, user) => {
        acc[user.role] = (acc[user.role] || 0) + 1
        return acc
      }, {})

      return {
        total: roleData.length,
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
      let queryBuilder = supabase
        .from('user_profiles')
        .select('*')

      if (role) {
        queryBuilder = queryBuilder.eq('role', role)
      }

      if (query) {
        queryBuilder = queryBuilder.or(`full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
      }

      const { data, error } = await queryBuilder
        .order('created_at', { ascending: false })

      if (error) throw error
      return data || []
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