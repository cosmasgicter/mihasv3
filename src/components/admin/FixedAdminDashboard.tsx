import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  TrendingUp,
  Users,
  Clock,
  CheckCircle,
  Calendar,
  Zap,
  Shield,
  Database,
  RefreshCw,
  ArrowUp,
  ArrowDown,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { sanitizeForLog } from '@/lib/sanitize'
import {
  adminDashboardService,
  createEmptyDashboardResponse,
  type AdminDashboardResponse,
  type AdminDashboardStats
} from '@/services/admin/dashboard'

const integerFormatter = new Intl.NumberFormat()
const decimalFormatter = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

const statusColorMap: Record<string, string> = {
  approved: 'bg-success',
  rejected: 'bg-error',
  submitted: 'bg-primary',
  under_review: 'bg-amber-500',
  review: 'bg-amber-500',
  pending: 'bg-warning',
  awaiting_documents: 'bg-secondary'
}

const systemHealthStyles: Record<AdminDashboardStats['systemHealth'], string> = {
  excellent: 'bg-emerald-100 text-emerald-700',
  good: 'bg-primary/10 text-primary',
  warning: 'bg-amber-100 text-accent',
  critical: 'bg-destructive/10 text-error'
}

const formatStatusLabel = (status: string) =>
  status
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated'
  }
  return date.toLocaleString()
}

const formatCount = (value: number) => integerFormatter.format(Math.max(0, Math.round(value)))
const formatHours = (value: number) => decimalFormatter.format(Math.max(0, value))

const clampPercentage = (value: number) => Math.min(100, Math.max(0, value))

export function FixedAdminDashboard() {
  const [dashboard, setDashboard] = useState<AdminDashboardResponse>(() => createEmptyDashboardResponse())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = dashboard.stats
  const statusBreakdown = dashboard.statusBreakdown
  const processingMetrics = dashboard.processingMetrics
  const periodTotals = dashboard.periodTotals
  const recentActivity = dashboard.recentActivity

  const totalApplications = stats.totalApplications || statusBreakdown.total || 0
  const inReviewCount = (statusBreakdown.submitted ?? 0) + (statusBreakdown.under_review ?? 0)

  const approvalRate = useMemo(() => {
    const approved = stats.approvedApplications || statusBreakdown.approved || 0
    const rejected = stats.rejectedApplications || statusBreakdown.rejected || 0
    const totalDecisions = approved + rejected
    return totalDecisions > 0 ? Math.round((approved / totalDecisions) * 100) : 0
  }, [
    stats.approvedApplications,
    stats.rejectedApplications,
    statusBreakdown.approved,
    statusBreakdown.rejected
  ])

  const statusEntries = useMemo(
    () =>
      Object.entries(statusBreakdown)
        .filter(([key]) => key !== 'total')
        .sort(([, valueA], [, valueB]) => Number(valueB) - Number(valueA)),
    [statusBreakdown]
  )

  const todayTotal = periodTotals.today ?? stats.todayApplications
  const weekTotal =
    periodTotals.this_week ?? periodTotals.week ?? stats.weekApplications
  const monthTotal =
    periodTotals.this_month ?? periodTotals.month ?? stats.monthApplications

  const averageProcessingDays = processingMetrics.averageDays || stats.avgProcessingTime
  const averageProcessingHours =
    processingMetrics.averageHours || stats.avgProcessingTimeHours
  const medianProcessingHours =
    processingMetrics.medianHours || stats.medianProcessingTimeHours
  const p95ProcessingHours = processingMetrics.p95Hours || stats.p95ProcessingTimeHours

  const loadDashboard = useCallback(
    async (options?: { silent?: boolean; showRefreshing?: boolean }) => {
      const silent = options?.silent ?? false
      const showRefreshing = options?.showRefreshing ?? false

      if (!silent) {
        setLoading(true)
      }

      if (showRefreshing) {
        setRefreshing(true)
      }

      try {
        setError(null)
        const response = await adminDashboardService.getOverview()
        setDashboard(response)
      } catch (err) {
        console.error('Error loading admin dashboard:', sanitizeForLog(err))
        setError('Failed to load dashboard metrics')
      } finally {
        if (!silent) {
          setLoading(false)
        }

        if (showRefreshing) {
          setRefreshing(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    loadDashboard()
    const interval = setInterval(() => {
      loadDashboard({ silent: true })
    }, 30000)

    return () => clearInterval(interval)
  }, [loadDashboard])

  const refreshData = useCallback(async () => {
    await loadDashboard({ silent: true, showRefreshing: true })
  }, [loadDashboard])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-body">Loading dashboard...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-destructive/5 border border-destructive/30 rounded-xl p-4 flex items-center space-x-3"
          >
            <AlertTriangle className="h-5 w-5 text-error" />
            <div>
              <p className="text-destructive-foreground font-medium">Dashboard Error</p>
              <p className="text-destructive text-sm">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="ml-auto"
            >
              ×
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-blue-500/10 to-blue-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-bold text-foreground"
                  data-testid="today-applications-value"
                >
                  {integerFormatter.format(stats.todayApplications)}
                </div>
                <div className="text-xs text-body">Today</div>
              </div>
            </div>
            <div className="text-sm font-medium text-body">New Applications</div>
            <div className="flex items-center mt-2 text-xs">
              <ArrowUp className="h-3 w-3 text-success mr-1" />
              <span className="text-warning-strong">{formatCount(weekTotal)} this week</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-yellow-500/10 to-orange-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent/10 rounded-xl">
                <Clock className="h-6 w-6 text-accent" />
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-bold text-foreground"
                  data-testid="pending-applications-value"
                >
                  {integerFormatter.format(stats.pendingApplications)}
                </div>
                <div className="text-xs text-body">Pending</div>
              </div>
            </div>
            <div className="text-sm font-medium text-body">Awaiting Review</div>
            <div className="text-xs text-accent mt-2">
              In review: {formatCount(inReviewCount)}
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-green-500/10 to-green-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-accent/10 rounded-xl">
                <CheckCircle className="h-6 w-6 text-accent" />
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-bold text-foreground"
                  data-testid="approval-rate-value"
                >
                  {approvalRate}%
                </div>
                <div className="text-xs text-body">Rate</div>
              </div>
            </div>
            <div className="text-sm font-medium text-body">Approval Rate</div>
            <div className="flex items-center mt-2 text-xs">
              <TrendingUp className="h-3 w-3 text-success mr-1" />
              <span className="text-warning-strong">Approved: {formatCount(stats.approvedApplications)}</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-card rounded-xl p-6 shadow-lg border border-border relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-gradient-to-br from-purple-500/10 to-purple-600/20 rounded-bl-full"></div>
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-secondary/10 rounded-xl">
                <Zap className="h-6 w-6 text-secondary" />
              </div>
              <div className="text-right">
                <div
                  className="text-2xl font-bold text-foreground"
                  data-testid="avg-processing-value"
                >
                  {decimalFormatter.format(averageProcessingDays)}
                </div>
                <div className="text-xs text-body">Days</div>
              </div>
            </div>
            <div className="text-sm font-medium text-body">Avg Processing</div>
            <div className="flex items-center mt-2 text-xs">
              <ArrowDown className="h-3 w-3 text-success mr-1" />
              <span className="text-warning-strong">Median: {formatHours(medianProcessingHours)}h</span>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-xl shadow-lg border border-border xl:col-span-2"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-bold text-body"><BarChart3 className="w-5 h-5" /> Status Distribution</h3>
            <span className="text-sm text-body">Total: {formatCount(totalApplications)}</span>
          </div>
          <div className="p-6 space-y-4">
            {statusEntries.length > 0 ? (
              statusEntries.map(([status, value]) => {
                const numericValue = Number(value)
                const percentage = totalApplications > 0
                  ? clampPercentage(Math.round((numericValue / totalApplications) * 100))
                  : 0
                const barClass = statusColorMap[status] ?? 'bg-slate-400'

                return (
                  <div key={status} className="space-y-2">
                    <div className="flex items-center justify-between text-sm font-medium text-body">
                      <span>{formatStatusLabel(status)}</span>
                      <span>{formatCount(numericValue)} ({percentage}%)</span>
                    </div>
                    <div className="h-2 bg-accent rounded-full overflow-hidden">
                      <div
                        className={`${barClass} h-full`}
                        style={{ width: `${percentage}%` }}
                        aria-label={`${formatStatusLabel(status)}: ${percentage}%`}
                      />
                    </div>
                  </div>
                )
              })
            ) : (
              <div className="text-sm text-body text-center py-6">
                No application statuses available
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-xl shadow-lg border border-border xl:col-span-2"
        >
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-bold text-body"><Zap className="w-5 h-5" /> Processing Performance</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { label: 'Today', value: todayTotal },
                { label: 'This Week', value: weekTotal },
                { label: 'This Month', value: monthTotal }
              ].map(period => (
                <div key={period.label} className="p-3 bg-slate-50 rounded-xl">
                  <div className="text-xs text-body">{period.label}</div>
                  <div className="mt-1 text-lg font-semibold text-body">
                    {formatCount(period.value)}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-body">
                  <Clock className="h-4 w-4 text-accent" />
                  <span>Average processing time</span>
                </div>
                <span className="text-sm font-semibold text-body">
                  {decimalFormatter.format(averageProcessingDays)} days · {formatHours(averageProcessingHours)}h
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-body">
                  <TrendingUp className="h-4 w-4 text-accent" />
                  <span>Median decision time</span>
                </div>
                <span className="text-sm font-semibold text-body">
                  {formatHours(medianProcessingHours)}h
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-body">
                  <Zap className="h-4 w-4 text-secondary" />
                  <span>P95 response time</span>
                </div>
                <span className="text-sm font-semibold text-body">
                  {formatHours(p95ProcessingHours)}h
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-sm text-body">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>Decisions in last 24h</span>
                </div>
                <span className="text-sm font-semibold text-body">
                  {formatCount(processingMetrics.decisionVelocity24h)}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-xl shadow-lg border border-border"
        >
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-lg font-bold text-body"><TrendingUp className="w-5 h-5" /> Recent Activity</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={refreshData}
              loading={refreshing}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-6 space-y-3 max-h-80 overflow-y-auto">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, index) => {
                const accentColor =
                  activity.type === 'approval'
                    ? 'bg-success'
                    : activity.type === 'rejection'
                      ? 'bg-error'
                      : activity.type === 'review'
                        ? 'bg-amber-500'
                        : activity.type === 'system'
                          ? 'bg-secondary'
                          : 'bg-primary'

                return (
                  <motion.div
                    key={activity.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-start space-x-3 p-3 bg-muted rounded-lg hover:bg-accent transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full mt-2 ${accentColor}`}></div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-body truncate">{activity.message}</p>
                      <p className="text-xs text-body">{formatTimestamp(activity.timestamp)}</p>
                    </div>
                  </motion.div>
                )
              })
            ) : (
              <div className="text-center py-8 text-body">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No recent activity</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-card rounded-xl shadow-lg border border-border"
        >
          <div className="px-6 py-4 border-b border-border">
            <h3 className="text-lg font-bold text-body">🛡️ System Health</h3>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2 text-sm text-body">
                <Shield className="h-5 w-5 text-primary" />
                <span>Overall status</span>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${systemHealthStyles[stats.systemHealth]}`}>
                {formatStatusLabel(stats.systemHealth)}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-body">
                  <Users className="h-4 w-4 text-secondary" />
                  <span>Active admins (24h)</span>
                </div>
                <p
                  className="mt-2 text-lg font-semibold text-foreground"
                  data-testid="active-admins-24h"
                >
                  {formatCount(processingMetrics.activeAdminsLast24h)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-body">
                  <TrendingUp className="h-4 w-4 text-sky-600" />
                  <span>Active admins (7d)</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-body">
                  {formatCount(processingMetrics.activeAdminsLast7d)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-body">
                  <Database className="h-4 w-4 text-emerald-600" />
                  <span>Total applications</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-foreground" data-testid="total-applications-value">
                  {formatCount(totalApplications)}
                </p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-body">
                  <Calendar className="h-4 w-4 text-accent" />
                  <span>Active intakes</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-body">
                  {formatCount(stats.activeIntakes)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-primary/5 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-info-strong">
                  <Activity className="h-4 w-4" />
                  <span>Decision velocity (24h)</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-primary-foreground">
                  {formatCount(processingMetrics.decisionVelocity24h)} decisions
                </p>
              </div>
              <div className="p-3 bg-secondary/5 rounded-xl">
                <div className="flex items-center space-x-2 text-xs text-purple-700">
                  <Users className="h-4 w-4" />
                  <span>Total students</span>
                </div>
                <p className="mt-2 text-lg font-semibold text-secondary-foreground">
                  {formatCount(stats.totalStudents)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
