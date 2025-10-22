import { memo, useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { BarChart3, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface AnalyticsStats {
  total_drafts: number
  completed_applications: number
  avg_time_per_step: number
  most_common_drop_off_step: string | null
}

interface AnalyticsDashboardProps {
  userId: string | undefined
}

export const AnalyticsDashboard = memo(({ userId }: AnalyticsDashboardProps) => {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!userId) return
    
    try {
      const { data: applications, error } = await supabase
        .from('applications')
        .select('status, created_at, updated_at')
        .eq('user_id', userId)

      if (error) {
        console.error('Analytics query error:', error)
        return
      }

      const completed = applications?.filter(app => app.status === 'submitted').length || 0
      const drafts = applications?.filter(app => app.status === 'draft').length || 0
      const total = applications?.length || 0

      setStats({
        completed_applications: completed,
        total_drafts: drafts,
        avg_time_per_step: 0,
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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-4 space-y-3"
    >
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-4 w-4" />
        Your Progress
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/5 rounded p-3">
          <div className="flex items-center gap-2 text-primary mb-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Completion</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{completionRate}%</p>
        </div>

        <div className="bg-success/5 rounded p-3">
          <div className="flex items-center gap-2 text-success mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Avg Time</span>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {Math.round(stats.avg_time_per_step || 0)}s
          </p>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• {stats.completed_applications} completed</p>
        <p>• {stats.total_drafts} in progress</p>
        {stats.most_common_drop_off_step && (
          <p className="flex items-center gap-1 text-warning">
            <AlertCircle className="h-3 w-3" />
            Most exits at: {stats.most_common_drop_off_step}
          </p>
        )}
      </div>
    </motion.div>
  )
})

AnalyticsDashboard.displayName = 'AnalyticsDashboard'
