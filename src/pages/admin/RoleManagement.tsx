import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getSupabaseClient } from '@/lib/supabase'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

export default function RoleManagement() {
  const queryClient = useQueryClient()
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [newRole, setNewRole] = useState('')

  const { data: users, isLoading } = useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async () => {
      const supabase = getSupabaseClient()
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          user_id,
          full_name,
          email,
          role,
          user_roles (
            role,
            is_active,
            permissions
          )
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const supabase = getSupabaseClient()
      
      const { error } = await supabase
        .from('user_profiles')
        .update({ role })
        .eq('user_id', userId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] })
      setSelectedUser(null)
      setNewRole('')
    }
  })

  if (isLoading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Role Management</h1>

      <div className="bg-white dark:bg-gray-800 dark:bg-gray-200 rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Profile Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Auth Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 dark:bg-gray-200 divide-y divide-gray-200">
            {users?.map((user: any) => {
              const authRole = user.user_roles?.[0]?.role
              const synced = user.role === authRole
              
              return (
                <tr key={user.user_id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                    {user.full_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-500">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 dark:text-blue-800 rounded">{user.role}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                    {authRole ? (
                      <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded">{authRole}</span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">None</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {synced ? (
                      <span className="text-green-600 dark:text-green-400">✓ Synced</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">⚠ Mismatch</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {selectedUser === user.user_id ? (
                      <div className="flex gap-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="border rounded px-2 py-1"
                        >
                          <option value="">Select role</option>
                          <option value="student">Student</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <button
                          onClick={() => updateRoleMutation.mutate({ userId: user.user_id, role: newRole })}
                          disabled={!newRole}
                          className="px-3 py-1 bg-blue-50 dark:bg-blue-950/300 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setSelectedUser(null)}
                          className="px-3 py-1 bg-gray-300 dark:bg-gray-600 dark:bg-gray-400 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedUser(user.user_id)
                          setNewRole(user.role)
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:text-blue-200 dark:text-blue-800"
                      >
                        Edit Role
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
