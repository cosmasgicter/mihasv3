import { useEffect, useState, useCallback } from 'react'
import { BarChart3, Clock, TrendingUp, AlertCircle } from 'lucide-react'
import { applicationService } from '@/services/applications'
import { animateClasses } from '@/lib/animations'
import { buildWizardProgressSummary } from '../lib/progressSummary'
import { logger } from '@/lib/logger'

interface AnalyticsStats {
  total_drafts: number
  completed_applications: number
}

interface AnalyticsDashboardProps {
  userId: string | undefined
  completionPercentage: number
  hasLocalDraft: boolean
  lastSavedAt?: Date | string | null
}

/**
 * Analytics Dashboard Component
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export const AnalyticsDashboard = ({
  userId,
  completionPercentage,
  hasLocalDraft,
  lastSavedAt
}: AnalyticsDashboardProps) => {
  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    if (!userId) return
    
    try {
      const result = await applicationService.list({
        mine: true,
        pageSize: 100,
        sortBy: 'date',
        sortOrder: 'desc',
      })
      const applications = result?.applications ?? []

      setStats({
        completed_applications: applications.filter((application) => application.status !== 'draft').length,
        total_drafts: applications.filter((application) => application.status === 'draft').length,
      })
    } catch (error) {
      logger.error('Failed to fetch analytics:', error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  if (loading || !stats) return null

  const summary = buildWizardProgressSummary(
    {
      completedApplications: stats.completed_applications,
      totalDrafts: stats.total_drafts
    },
    {
      completionPercentage,
      hasLocalDraft,
      lastSavedAt
    }
  )

  return (
    <div
      className={`bg-card border border-border rounded-lg p-4 space-y-3 ${animateClasses.slideUp}`}
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
          <p className="text-2xl font-bold text-foreground">{summary.completionPercentage}%</p>
        </div>

        <div className="bg-success/5 rounded p-3">
          <div className="flex items-center gap-2 text-success mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Last Save</span>
          </div>
          <p className="text-2xl font-bold text-foreground">{summary.activityLabel}</p>
        </div>
      </div>

      <div className="text-xs text-caption space-y-1">
        <p>• {summary.completedCount} completed</p>
        <p>• {summary.inProgressCount} in progress</p>
        {summary.inProgressCount > 0 && (
          <p className="flex items-center gap-1 text-warning">
            <AlertCircle className="h-3 w-3" />
            Keep going. Your current draft progress is shown above.
          </p>
        )}
      </div>
    </div>
  )
}
