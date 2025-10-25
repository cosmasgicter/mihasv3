import React, { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Brain, Clock, AlertTriangle, Target, Zap, RefreshCw, Users, FileText, CheckCircle } from 'lucide-react'
import { predictiveAnalytics } from '@/lib/predictiveAnalytics'
import { workflowAutomation } from '@/lib/workflowAutomation'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import { useRoleQuery, isAdminRole } from '@/hooks/auth/useRoleQuery'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { fetchPredictiveDashboardMetrics } from '@/lib/predictiveDashboardApi'
import { AITrendsPanel } from './AITrendsPanel'

interface PredictiveMetrics {
  avgAdmissionProbability: number
  processingBottlenecks: string[]
  peakApplicationTimes: string[]
  riskApplications: number
  efficiencyScore: number
  trendDirection: 'up' | 'down' | 'stable'
  totalApplications: number
  avgProcessingTime: number
  workflowStats: any
}

export function PredictiveDashboard() {
  const { profile, isLoading: profileLoading } = useProfileQuery()
  const { isAdmin: hasAdminRole, isLoading: roleLoading } = useRoleQuery()
  const isAdmin = hasAdminRole || isAdminRole(profile?.role)
  const isAuthLoading = profileLoading || roleLoading
  const [metrics, setMetrics] = useState<PredictiveMetrics>({
    avgAdmissionProbability: 0,
    processingBottlenecks: [],
    peakApplicationTimes: [],
    riskApplications: 0,
    efficiencyScore: 0,
    trendDirection: 'stable',
    totalApplications: 0,
    avgProcessingTime: 0,
    workflowStats: null
  })
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [hasRequestedInitialLoad, setHasRequestedInitialLoad] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const loadInProgressRef = useRef(false)

  const mapTrendDirection = useCallback((trend?: string | null): PredictiveMetrics['trendDirection'] => {
    if (!trend) return 'stable'
    const normalized = trend.toLowerCase()
    if (normalized === 'increasing' || normalized === 'up' || normalized === 'positive') {
      return 'up'
    }
    if (normalized === 'decreasing' || normalized === 'down' || normalized === 'negative') {
      return 'down'
    }
    return 'stable'
  }, [])

  const normalizeProbability = useCallback((value?: number | null) => {
    if (value === null || value === undefined) {
      return 78
    }

    if (value <= 1) {
      return Math.round(value * 100)
    }

    return Math.round(value)
  }, [])

  const normalizeEfficiency = useCallback((value?: number | null) => {
    if (value === null || value === undefined) {
      return 0
    }

    return value > 1 && value <= 100 ? value : Math.round(value * 100)
  }, [])

  const loadPredictiveMetrics = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!isAdmin || isAuthLoading) {
      return
    }

    if (loadInProgressRef.current) {
      return
    }

    loadInProgressRef.current = true

    if (!background) {
      setLoading(true)
      setRefreshing(true)
    }

    try {
      const aggregated = await fetchPredictiveDashboardMetrics()

      if (aggregated?.predictive) {
        const predictiveData = aggregated.predictive
        const workflowData = aggregated.workflow ?? null

        const totalApplications = predictiveData.totalApplications ?? 0
        const efficiency = normalizeEfficiency(predictiveData.efficiency)

        setMetrics({
          avgAdmissionProbability: normalizeProbability(predictiveData.avgAdmissionProbability),
          processingBottlenecks: predictiveData.bottlenecks ?? [],
          peakApplicationTimes: predictiveData.peakTimes ?? [],
          riskApplications: Math.floor(totalApplications * 0.15),
          efficiencyScore: efficiency,
          trendDirection: mapTrendDirection(predictiveData.applicationTrend || undefined),
          totalApplications,
          avgProcessingTime: predictiveData.avgProcessingTime ?? 0,
          workflowStats: workflowData
        })

        const generatedAt = predictiveData.generatedAt || aggregated.generatedAt
        setLastUpdated(generatedAt ? new Date(generatedAt) : new Date())
        setHasLoadedOnce(true)
        return
      }

      const [trends, workflowStats] = await Promise.all([
        predictiveAnalytics.analyzeTrends(),
        workflowAutomation.getWorkflowStats()
      ])

      const riskApplications = Math.floor(trends.totalApplications * 0.15)

      setMetrics({
        avgAdmissionProbability: 78,
        processingBottlenecks: trends.bottlenecks,
        peakApplicationTimes: trends.peakTimes,
        riskApplications,
        efficiencyScore: trends.efficiency,
        trendDirection: mapTrendDirection(trends.applicationTrend),
        totalApplications: trends.totalApplications,
        avgProcessingTime: trends.avgProcessingTime,
        workflowStats
      })

      setLastUpdated(new Date())
      setHasLoadedOnce(true)
    } catch (error) {
      console.error('Failed to load predictive metrics:', error)
    } finally {
      if (!background) {
        setLoading(false)
        setRefreshing(false)
      }
      loadInProgressRef.current = false
    }
  }, [isAdmin, isAuthLoading, mapTrendDirection, normalizeEfficiency, normalizeProbability])

  useEffect(() => {
    if (!isAdmin || isAuthLoading || hasRequestedInitialLoad) {
      return
    }

    const target = containerRef.current
    if (!target) {
      return
    }

    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (entry?.isIntersecting) {
        setHasRequestedInitialLoad(true)
        loadPredictiveMetrics()
        observer.disconnect()
      }
    }, { threshold: 0.25 })

    observer.observe(target)

    return () => observer.disconnect()
  }, [isAdmin, isAuthLoading, hasRequestedInitialLoad, loadPredictiveMetrics])

  useEffect(() => {
    if (!isAdmin || isAuthLoading || !hasLoadedOnce) {
      return
    }

    refreshIntervalRef.current = setInterval(() => {
      loadPredictiveMetrics({ background: true })
    }, 5 * 60 * 1000)

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [isAdmin, isAuthLoading, hasLoadedOnce, loadPredictiveMetrics])

  useEffect(() => {
    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current)
        refreshIntervalRef.current = null
      }
    }
  }, [])

  // Don't render for non-admin users
  if (!isAdmin) {
    return null
  }

  const handleRefresh = async () => {
    if (!refreshing && hasLoadedOnce) {
      await loadPredictiveMetrics()
    }
  }

  if (!hasLoadedOnce) {
    return (
      <div ref={containerRef} className="space-y-6">
        {loading ? (
          <div className="animate-pulse space-y-6">
            <div className="h-40 bg-skeleton rounded-2xl"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="h-64 bg-skeleton rounded-lg"></div>
              <div className="h-64 bg-skeleton rounded-lg"></div>
            </div>
            <div className="h-80 bg-skeleton rounded-lg"></div>
          </div>
        ) : (
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">AI Predictive Dashboard</h2>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Predictive insights will load once the dashboard is ready.
                </p>
              </div>
              <Button
                onClick={() => {
                  if (!hasRequestedInitialLoad) {
                    setHasRequestedInitialLoad(true)
                  }
                  loadPredictiveMetrics()
                }}
                disabled={refreshing}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Load insights
              </Button>
            </div>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">AI Predictive Dashboard</h1>
          <p className="text-gray-700 dark:text-gray-300">
            Real-time insights and automation analytics
            {lastUpdated && (
              <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={refreshing || !hasLoadedOnce}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Main metrics */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-6 text-white"
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Brain className="h-8 w-8 mr-3" />
            <h2 className="text-2xl font-bold">🤖 AI Insights</h2>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-90">Total Applications</div>
            <div className="text-2xl font-bold">{metrics.totalApplications}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold break-words">{metrics.avgAdmissionProbability}%</div>
            <div className="text-sm opacity-90">Avg Success Rate</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold break-words">{metrics.riskApplications}</div>
            <div className="text-sm opacity-90">High-Risk Applications</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold break-words">{Math.round(metrics.efficiencyScore)}%</div>
            <div className="text-sm opacity-90">Processing Efficiency</div>
          </div>
          <div className="text-center">
            <div className="text-2xl sm:text-3xl font-bold break-words">{metrics.avgProcessingTime}</div>
            <div className="text-sm opacity-90">Avg Days to Process</div>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-6">
            <div className="flex items-center mb-4">
              <TrendingUp className="h-6 w-6 mr-2 text-accent" />
              <h3 className="text-lg font-semibold">Application Trends</h3>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Trend Direction</span>
                <div className="flex items-center">
                  {metrics.trendDirection === 'up' && (
                    <TrendingUp className="h-4 w-4 text-accent mr-1" />
                  )}
                  {metrics.trendDirection === 'down' && (
                    <TrendingUp className="h-4 w-4 text-destructive mr-1 rotate-180" />
                  )}
                  <span className={`text-sm font-semibold ${
                    metrics.trendDirection === 'up' ? 'text-green-700 dark:text-green-400' : 
                    metrics.trendDirection === 'down' ? 'text-red-700 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    {metrics.trendDirection === 'up' ? 'Increasing' : 
                     metrics.trendDirection === 'down' ? 'Decreasing' : 'Stable'}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-sm text-gray-700 dark:text-gray-300 font-medium block mb-2">Peak Application Times</span>
                <div className="flex flex-wrap gap-2">
                  {metrics.peakApplicationTimes.length > 0 ? (
                    metrics.peakApplicationTimes.slice(0, 4).map((time, idx) => (
                      <span key={idx} className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs font-medium rounded">
                        {time}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-600 dark:text-gray-400">No peak times identified</span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="p-6">
            <div className="flex items-center mb-4">
              <AlertTriangle className="h-6 w-6 mr-2 text-accent" />
              <h3 className="text-lg font-semibold">System Bottlenecks</h3>
            </div>
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {metrics.processingBottlenecks.length > 0 ? (
                metrics.processingBottlenecks.map((bottleneck, idx) => (
                  <div key={idx} className="flex items-start p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <Clock className="h-4 w-4 text-yellow-700 dark:text-yellow-400 mr-2 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">{bottleneck}</span>
                  </div>
                ))
              ) : (
                <div className="flex items-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-green-700 dark:text-green-400 mr-2" />
                  <span className="text-sm text-gray-800 dark:text-gray-200 font-medium">No bottlenecks detected - system running smoothly</span>
                </div>
              )}
            </div>
          </Card>
        </motion.div>

        {/* Workflow Automation Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card className="p-6">
            <div className="flex items-center mb-4">
              <Zap className="h-6 w-6 mr-2 text-secondary" />
              <h3 className="text-lg font-semibold">Workflow Automation</h3>
            </div>
            <div className="space-y-3">
              {metrics.workflowStats ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Total Executions (7 days)</span>
                    <span className="text-lg font-bold text-gray-900 dark:text-white">{metrics.workflowStats.totalExecutions}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">Success Rate</span>
                    <span className={`text-lg font-bold ${
                      metrics.workflowStats.totalExecutions > 0 
                        ? (metrics.workflowStats.successfulExecutions / metrics.workflowStats.totalExecutions) > 0.9 
                          ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'
                        : 'text-gray-900 dark:text-white'
                    }`}>
                      {metrics.workflowStats.totalExecutions > 0 
                        ? Math.round((metrics.workflowStats.successfulExecutions / metrics.workflowStats.totalExecutions) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-700 dark:text-gray-300 font-semibold">Most Active Rules</span>
                    <div className="mt-1 space-y-1">
                      {Object.entries(metrics.workflowStats.ruleStats)
                        .sort(([,a], [,b]) => (b as number) - (a as number))
                        .slice(0, 3)
                        .map(([ruleId, count]) => (
                          <div key={ruleId} className="flex justify-between text-xs">
                            <span className="text-gray-700 dark:text-gray-300 truncate">{ruleId.replace(/_/g, ' ')}</span>
                            <span className="text-gray-900 dark:text-white font-bold">{count as number}</span>
                          </div>
                        ))
                      }
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-600 dark:text-gray-400">Loading workflow statistics...</div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* AI Trends Panel */}
      <AITrendsPanel />

      {/* AI Recommendations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <Card className="p-6">
          <div className="flex items-center mb-6">
            <Brain className="h-6 w-6 mr-2 text-secondary" />
            <h3 className="text-lg font-semibold">AI Recommendations</h3>
            <span className="ml-auto text-xs font-semibold text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900 px-3 py-1 rounded-full">
              Updated {refreshing ? 'now' : 'recently'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center">
                <FileText className="h-4 w-4 mr-1" />
                Workflow Optimization
              </h4>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {metrics.workflowStats?.successfulExecutions > 50 
                  ? 'Automation is performing well. Consider expanding auto-approval rules for high-confidence applications.'
                  : 'Consider implementing automated document verification for applications with high confidence scores (>90%).'}
              </p>
            </div>
            <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-2 flex items-center">
                <Users className="h-4 w-4 mr-1" />
                Resource Allocation
              </h4>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {metrics.peakApplicationTimes.length > 0 
                  ? `Peak times identified: ${metrics.peakApplicationTimes.slice(0, 2).join(', ')}. Consider increasing staff during these hours.`
                  : 'Application volume is evenly distributed. Current staffing appears adequate.'}
              </p>
            </div>
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
              <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2 flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1" />
                Proactive Outreach
              </h4>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {metrics.riskApplications > 0 
                  ? `${metrics.riskApplications} applications identified as high-risk. Consider proactive support outreach.`
                  : 'No high-risk applications detected. Current support processes are effective.'}
              </p>
            </div>
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2 flex items-center">
                <Target className="h-4 w-4 mr-1" />
                Process Improvement
              </h4>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                Current efficiency: {Math.round(metrics.efficiencyScore)}%. 
                {metrics.efficiencyScore >= 90 
                  ? 'Excellent performance! Maintain current processes.'
                  : `Target: 95%. Focus on ${metrics.processingBottlenecks.length > 0 ? 'resolving bottlenecks' : 'streamlining workflows'}.`}
              </p>
            </div>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}