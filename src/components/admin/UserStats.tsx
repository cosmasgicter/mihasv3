import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Shield, TrendingUp, User, Users } from 'lucide-react'

import { useUserManagement } from '@/hooks/useUserManagement'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { UserProfile } from '@/lib/supabase'
import { UserStatsSummary } from '@/types/users'

interface UserStatsProps {
  users: UserProfile[]
  className?: string
}

const ROLE_LABELS: Record<string, string> = {
  student: 'Students',
  admissions_officer: 'Admissions Officers',
  registrar: 'Registrars',
  finance_officer: 'Finance Officers',
  academic_head: 'Academic Heads',
  admin: 'Administrators',
  super_admin: 'Super Admins'
}

export function UserStats({ users, className = '' }: UserStatsProps) {
  const { getUserStats } = useUserManagement()
  const [stats, setStats] = useState<UserStatsSummary | null>(null)

  const recentUsers = useMemo(
    () =>
      [...users]
        .sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
        .slice(0, 3),
    [users]
  )

  const loadStats = useCallback(async () => {
    const statsData = await getUserStats()
    setStats(statsData)
  }, [getUserStats])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
      case 'super_admin':
        return <Shield className="h-4 w-4 text-red-500" />
      case 'admissions_officer':
      case 'registrar':
      case 'finance_officer':
      case 'academic_head':
        return <Shield className="h-4 w-4 text-blue-500" />
      default:
        return <User className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
      case 'super_admin':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'admissions_officer':
      case 'registrar':
      case 'finance_officer':
      case 'academic_head':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getRoleLabel = (role: string) => {
    return ROLE_LABELS[role] || role.replace('_', ' ').toUpperCase()
  }

  if (!stats) {
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-5/6"></div>
            <div className="h-3 bg-gray-200 rounded w-4/6"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">Total Users</p>
              <p className="text-3xl font-bold">{stats.total}</p>
            </div>
            <Users className="h-8 w-8 text-blue-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-green-100 text-sm font-medium">Active Roles</p>
              <p className="text-3xl font-bold">{Object.keys(stats.byRole).length}</p>
            </div>
            <Shield className="h-8 w-8 text-green-200" />
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">New This Month</p>
              <p className="text-3xl font-bold">
                {users.filter(user => {
                  const userDate = new Date(user.created_at)
                  const now = new Date()
                  return userDate.getMonth() === now.getMonth() && userDate.getFullYear() === now.getFullYear()
                }).length}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-purple-200" />
          </div>
        </div>
      </div>

      {/* Role Distribution */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Shield className="h-5 w-5 mr-2 text-gray-600" />
          Role Distribution
        </h3>
        <div className="space-y-3">
          {Object.entries(stats.byRole)
            .sort(([, a], [, b]) => b - a)
            .map(([role, count]) => (
              <div key={role} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  {getRoleIcon(role)}
                  <span className="font-medium text-gray-900">{getRoleLabel(role)}</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getRoleColor(role)}`}>
                    {count} users
                  </span>
                  <div className="w-20 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full"
                      style={{ width: `${(count / stats.total) * 100}%` }}
                    ></div>
                  </div>
                  <span className="text-sm text-gray-500 w-12 text-right">
                    {Math.round((count / stats.total) * 100)}%
                  </span>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Recent Users */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Calendar className="h-5 w-5 mr-2 text-gray-600" />
          Recent Users
        </h3>
        <div className="space-y-3">
          {recentUsers.length > 0 ? (
            recentUsers.map((user) => (
              <div key={user.user_id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                <div className="flex items-center space-x-3">
                  {getRoleIcon(user.role)}
                  <div>
                    <p className="font-medium text-gray-900">{sanitizeForDisplay(user.full_name) || 'No name'}</p>
                    <p className="text-sm text-gray-500">{sanitizeForDisplay(user.email)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
                    {getRoleLabel(user.role)}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(user.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-center py-4">No recent users</p>
          )}
        </div>
      </div>
    </div>
  )
}