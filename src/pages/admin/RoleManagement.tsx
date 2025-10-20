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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Role Management</h1>

      <div className="bg-card rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-muted">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Profile Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Auth Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-gray-200">
            {users?.map((user: any) => {
              const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ')
              
              return (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                    {fullName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    <span className="px-2 py-1 bg-primary/10 text-primary-foreground rounded">{user.role}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    <span className="px-2 py-1 bg-accent/10 text-accent-foreground rounded">{user.role}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-accent">✓ Synced</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                          className="px-3 py-1 bg-primary/5/300 text-white rounded hover:bg-primary disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setSelectedUser(null)}
                          className="px-3 py-1 bg-muted text-foreground rounded hover:bg-gray-400"
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
                        className="text-primary hover:text-primary-foreground"
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
