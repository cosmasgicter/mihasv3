import React from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { Button } from '@/components/ui/Button'
import { Link } from 'react-router-dom'

export default function AdminTest() {
  const { user, signOut } = useAuth()
  const { profile } = useProfileQuery()
  const { userRole, isAdmin: hasAdminRole } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-3xl font-bold mb-8">🔧 Admin Access Test</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* User Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">👤 User Information</h2>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div><strong>Email:</strong> {user?.email || 'Not logged in'}</div>
                <div><strong>User ID:</strong> {user?.id || 'None'}</div>
                <div><strong>Created:</strong> {user?.created_at ? new Date(user.created_at).toLocaleString() : 'None'}</div>
              </div>
            </div>

            {/* Profile Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">📋 Profile Information</h2>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div><strong>Full Name:</strong> {profile?.full_name || 'None'}</div>
                <div><strong>Role:</strong> {profile?.role || 'None'}</div>
                <div><strong>Phone:</strong> {profile?.phone || 'None'}</div>
                <div><strong>Profile ID:</strong> {profile?.id || 'None'}</div>
              </div>
            </div>

            {/* User Role Info */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">🎭 User Role Information</h2>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div><strong>Role:</strong> {userRole?.role || 'None'}</div>
                <div><strong>Permissions:</strong> {userRole?.permissions?.join(', ') || 'None'}</div>
                <div><strong>Department:</strong> {userRole?.department || 'None'}</div>
                <div><strong>Active:</strong> {userRole?.is_active ? 'Yes' : 'No'}</div>
              </div>
            </div>

            {/* Access Check */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">🔐 Access Check</h2>
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div><strong>Is Admin:</strong> {isAdmin ? '✅ Yes' : '❌ No'}</div>
                <div><strong>Dev Mode:</strong> {import.meta.env.DEV ? '✅ Yes' : '❌ No'}</div>
                <div><strong>Super Admin:</strong> {user?.email === 'cosmas@beanola.com' ? '✅ Yes' : '❌ No'}</div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-8 space-x-4">
            <Link to="/admin">
              <Button>🏠 Go to Admin Dashboard</Button>
            </Link>
            <Link to="/student/dashboard">
              <Button variant="outline">👨‍🎓 Go to Student Dashboard</Button>
            </Link>
            <Button variant="outline" onClick={signOut}>
              🚪 Sign Out
            </Button>
          </div>

          {/* Raw Data */}
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">🔍 Raw Data (Dev Only)</h2>
            {import.meta.env.DEV && (
              <div className="bg-black text-green-400 p-4 rounded-lg text-sm overflow-auto">
                <pre>{JSON.stringify({ user, profile, userRole }, null, 2)}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}