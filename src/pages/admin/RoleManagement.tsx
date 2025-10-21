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
        .from('profiles')
        .select(`
          id,
          first_name,
          last_name,
          email,
          role,
          created_at
        `)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data
    }
  })

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const supabase = getSupabaseClient()
      
      // Update profiles table
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role })
        .eq('id', userId)

      if (profileError) throw profileError

      // Update user_roles table
      const { error } = await supabase
        .from('user_roles')
        .upsert(
          { user_id: userId, role, is_active: true },
          { onConflict: 'user_id' }
        )

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] })
      setSelectedUser(null)
      setNewRole('')
    }
  })

  if (isLoading) return <LoadingSpinner size="lg" />

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'super_admin': return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'admin': return 'bg-blue-100 text-blue-800 border-blue-300'
      case 'student': return 'bg-green-100 text-green-800 border-green-300'
      default: return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container-mobile py-4 sm:py-6 lg:py-8 safe-area-bottom">
        <div className="bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
            <h1 className="text-2xl sm:text-3xl font-bold">👥 Role Management</h1>
            <p className="text-white/90 text-sm sm:text-base">Manage user roles and permissions</p>
          </div>

          <div className="p-6">
            {/* Mobile Cards */}
            <div className="block lg:hidden space-y-4">
              {users?.map((user: any) => {
                const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
                return (
                  <div key={user.id} className="bg-muted rounded-xl p-4 border border-border">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-bold text-foreground">{fullName}</h3>
                        <p className="text-sm text-foreground truncate">{user.email}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRoleColor(user.role)}`}>
                        {user.role.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {selectedUser === user.id ? (
                      <div className="space-y-2">
                        <select
                          value={newRole}
                          onChange={(e) => setNewRole(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2"
                        >
                          <option value="">Select role</option>
                          <option value="student">Student</option>
                          <option value="admin">Admin</option>
                          <option value="super_admin">Super Admin</option>
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={() => updateRoleMutation.mutate({ userId: user.id, role: newRole })}
                            disabled={!newRole}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setSelectedUser(null)}
                            className="flex-1 px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setSelectedUser(user.id)
                          setNewRole(user.role)
                        }}
                        className="w-full px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-medium"
                      >
                        Edit Role
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="min-w-full divide-y divide-border">
                <thead className="bg-gradient-to-r from-muted to-purple-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">User</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">Email</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">Role</th>
                    <th className="px-6 py-4 text-left text-sm font-bold text-foreground uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {users?.map((user: any) => {
                    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
                    return (
                      <tr key={user.id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4 text-sm font-medium text-foreground">{fullName}</td>
                        <td className="px-6 py-4 text-sm text-foreground">{user.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getRoleColor(user.role)}`}>
                            {user.role.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {selectedUser === user.id ? (
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
                                onClick={() => updateRoleMutation.mutate({ userId: user.id, role: newRole })}
                                disabled={!newRole}
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setSelectedUser(null)}
                                className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setSelectedUser(user.id)
                                setNewRole(user.role)
                              }}
                              className="text-blue-600 hover:text-blue-800 font-medium"
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
        </div>
      </div>
    </div>
  )
}
