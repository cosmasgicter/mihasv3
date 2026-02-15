import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { applicationsApi } from '@/lib/apiClient'
import { animateClasses } from '@/lib/animations'

interface AnalyticsStats {
  total_drafts: number
  completed_applications: number
  avg_time_per_step: number
  most_common_drop_off_step: string | null
}

interface AnalyticsDashboardProps {
  userId: string | undefined
}

/**
 * Analytics Dashboard Component
 * MIGRATED: Uses API client instead of direct Supabase calls
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export const AnalyticsDashboard = ({ userId }: AnalyticsDashboardProps) => {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!userId) return
    
    try {
      // MIGRATED: Using API client instead of direct Supabase calls
      const response = await applicationsApi.getStats()

      if (!response.success) {
        console.error('Analytics query error:', response.error)
        return
      }

      const data = response.data
      if (!data) return

      // Convert avg_time_hours to minutes for display
      const avgTimeMinutes = Math.round((data.avg_time_hours || 0) * 60)

      setStats({
        completed_applications: data.completed_applications || 0,
        total_drafts: data.total_drafts || 0,
        avg_time_per_step: avgTimeMinutes,
        most_common_drop_off_step: null
      })
    } catch (error) {
      console.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading || !stats) return null

  const total = stats.total_drafts + stats.completed_applications
  const completionRate = total > 0
    ? Math.round((stats.completed_applications / total) * 100)
    : 0

  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 space-y-3 ${animateClasses.slideUp}`}
    >
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Your Progress
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/5 rounded p-3">
          <div className="flex items-center gap-2 text-primary mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Completion</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{completionRate}%</p>
        </div>

        <div className="bg-success/5 rounded p-3">
          <div className="flex items-center gap-2 text-success mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Avg Time</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {stats.avg_time_per_step > 60 
              ? `${Math.round(stats.avg_time_per_step / 60)}h` 
              : stats.avg_time_per_step > 0 
                ? `${stats.avg_time_per_step}m` 
                : '0m'
            }
          </p>
        </div>
      </div>

      <div className="text-xs text-caption space-y-1">
        <p>• {stats.completed_applications} completed</p>
        <p>• {stats.total_drafts} in progress</p>
        {stats.most_common_drop_off_step && (
          <p className="flex items-center gap-1 text-warning">
            <AlertCircle className="h-3 w-3" />
            Most exits at: {stats.most_common_drop_off_step}
          </p>
        )}
      </div>
    </div>
  )
}
