import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/Button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog'
import { Clock, User, Shield, Edit, Trash2, Plus, Eye, Filter, Calendar } from 'lucide-react'
import { sanitizeForLog } from '@/lib/sanitize'

interface ActivityLog {
  id: string
  user_id: string
  action: string
  target_user_id?: string
  target_user_name?: string
  details: Record<string, any>
  ip_address?: string
  user_agent?: string
  created_at: string
  performed_by?: string
  performed_by_name?: string
}

interface UserActivityLogProps {
  userId?: string
  isOpen: boolean
  onClose: () => void
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  'user.created': <Plus className="h-4 w-4 text-green-600" />,
  'user.updated': <Edit className="h-4 w-4 text-blue-600" />,
  'user.deleted': <Trash2 className="h-4 w-4 text-red-600" />,
  'user.role_changed': <Shield className="h-4 w-4 text-purple-600" />,
  'user.permissions_updated': <Shield className="h-4 w-4 text-orange-600" />,
  'user.login': <User className="h-4 w-4 text-green-500" />,
  'user.logout': <User className="h-4 w-4 text-gray-500" />,
  'user.password_changed': <Shield className="h-4 w-4 text-yellow-600" />,
}

const ACTION_LABELS: Record<string, string> = {
  'user.created': 'User Created',
  'user.updated': 'Profile Updated',
  'user.deleted': 'User Deleted',
  'user.role_changed': 'Role Changed',
  'user.permissions_updated': 'Permissions Updated',
  'user.login': 'User Login',
  'user.logout': 'User Logout',
  'user.password_changed': 'Password Changed',
}

export function UserActivityLog({ userId, isOpen, onClose }: UserActivityLogProps) {
  const [activities, setActivities] = useState<ActivityLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadActivities()
    }
  }, [isOpen, userId])

  const loadActivities = async () => {
    try {
      setLoading(true)
      setError('')
      
      // In a real implementation, you would have an activity_logs table
      // For now, we'll simulate some activity data
      const mockActivities: ActivityLog[] = [
        {
          id: '1',
          user_id: userId || '',
          action: 'user.created',
          details: { role: 'student' },
          created_at: new Date(Date.now() - 86400000).toISOString(),
          performed_by: 'admin-123',
          performed_by_name: 'System Admin'
        },
        {
          id: '2',
          user_id: userId || '',
          action: 'user.role_changed',
          details: { from: 'student', to: 'admissions_officer' },
          created_at: new Date(Date.now() - 43200000).toISOString(),
          performed_by: 'admin-123',
          performed_by_name: 'System Admin'
        },
        {
          id: '3',
          user_id: userId || '',
          action: 'user.login',
          details: { ip_address: '192.168.1.100' },
          created_at: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: '4',
          user_id: userId || '',
          action: 'user.updated',
          details: { fields: ['full_name', 'phone'] },
          created_at: new Date(Date.now() - 1800000).toISOString(),
          performed_by: userId,
          performed_by_name: 'Self'
        }
      ]
      
      setActivities(mockActivities)
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load activity log'
      console.error('Failed to load activity log:', sanitizeForLog(errorMessage))
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const filteredActivities = activities.filter(activity => {
    if (filter && !ACTION_LABELS[activity.action]?.toLowerCase().includes(filter.toLowerCase())) {
      return false
    }
    if (dateFilter) {
      const activityDate = new Date(activity.created_at).toDateString()
      const filterDate = new Date(dateFilter).toDateString()
      return activityDate === filterDate
    }
    return true
  })

  const formatActivityDetails = (activity: ActivityLog) => {
    switch (activity.action) {
      case 'user.role_changed':
        return `Role changed from ${activity.details.from} to ${activity.details.to}`
      case 'user.updated':
        return `Updated fields: ${activity.details.fields?.join(', ')}`
      case 'user.login':
        return activity.details.ip_address ? `Login from ${activity.details.ip_address}` : 'User login'
      case 'user.permissions_updated':
        return `Permissions updated: ${activity.details.permissions?.length || 0} permissions`
      default:
        return ACTION_LABELS[activity.action] || activity.action
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <span>User Activity Log</span>
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-lg">
          <div className="flex-1">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Filter by action..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="sm:w-48">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Activity List */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="text-center py-8">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Activity Found</h3>
              <p className="text-gray-600">
                {filter || dateFilter ? 'No activities match your filters.' : 'No activity recorded for this user.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {filteredActivities.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-4 p-4 bg-white border border-gray-200 rounded-lg hover:shadow-sm transition-shadow">
                  <div className="flex-shrink-0 mt-1">
                    {ACTION_ICONS[activity.action] || <Eye className="h-4 w-4 text-gray-500" />}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-sm font-medium text-gray-900">
                        {ACTION_LABELS[activity.action] || activity.action}
                      </h4>
                      <time className="text-xs text-gray-500">
                        {new Date(activity.created_at).toLocaleString()}
                      </time>
                    </div>
                    
                    <p className="text-sm text-gray-600 mb-2">
                      {formatActivityDetails(activity)}
                    </p>
                    
                    {activity.performed_by_name && (
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        <User className="h-3 w-3" />
                        <span>Performed by: {activity.performed_by_name}</span>
                      </div>
                    )}
                    
                    {activity.details.ip_address && (
                      <div className="text-xs text-gray-500 mt-1">
                        IP: {activity.details.ip_address}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between items-center p-4 border-t border-gray-200">
          <div className="text-sm text-gray-600">
            {filteredActivities.length} of {activities.length} activities
          </div>
          <Button onClick={onClose} className="bg-blue-600 hover:bg-blue-700 text-white">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}