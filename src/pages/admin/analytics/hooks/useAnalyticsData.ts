import { useState, useEffect } from 'react'
import { AnalyticsService, ApplicationStats, ProgramAnalytics, EligibilityAnalytics, AutomatedReport } from '@/lib/analytics'

export const useAnalyticsData = (dateRange: { start: string; end: string }, canManageReports: boolean) => {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [applicationStats, setApplicationStats] = useState<ApplicationStats[]>([])
  const [programAnalytics, setProgramAnalytics] = useState<ProgramAnalytics[]>([])
  const [eligibilityAnalytics, setEligibilityAnalytics] = useState<EligibilityAnalytics[]>([])
  const [automatedReports, setAutomatedReports] = useState<AutomatedReport[]>([])
  const [analyticsSummary, setAnalyticsSummary] = useState<any>(null)

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const summary = await AnalyticsService.getAnalyticsSummary(dateRange.start, dateRange.end)
      setApplicationStats(summary.applicationStats)
      setProgramAnalytics(summary.programAnalytics)
      setEligibilityAnalytics(summary.eligibilityAnalytics)
      setAnalyticsSummary(summary)
    } catch (error) {
      console.error('Failed to load analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAutomatedReports = async () => {
    try {
      const reports = await AnalyticsService.getAutomatedReports(20)
      setAutomatedReports(reports)
    } catch (error) {
      console.error('Failed to load reports:', error)
    }
  }

  const refreshData = async () => {
    try {
      setRefreshing(true)
      await AnalyticsService.refreshAnalyticsData()
      await loadAnalytics()
      await loadAutomatedReports()
    } catch (error) {
      console.error('Failed to refresh data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    loadAnalytics()
  }, [dateRange])

  useEffect(() => {
    if (canManageReports) {
      loadAutomatedReports()
    } else {
      setAutomatedReports([])
    }
  }, [canManageReports])

  return {
    loading,
    refreshing,
    applicationStats,
    programAnalytics,
    eligibilityAnalytics,
    automatedReports,
    analyticsSummary,
    loadAnalytics,
    loadAutomatedReports,
    refreshData
  }
}
