/**
 * React Query hooks for analytics data fetching
 * 
 * @requirements 5.7, 5.8, 9.2, 9.3 - Defer analytics queries and prevent duplicates
 * 
 * These hooks use longer staleTime values to prevent unnecessary refetching
 * and reduce the number of API calls during initial page load.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  predictiveAnalytics,
  complianceAnalytics,
  realtimeMetrics,
  comprehensiveMetrics,
  dashboardAnalytics,
  type PredictiveAnalyticsResponse,
  type ComplianceReport,
  type RealtimeMetrics
} from '@/services/analyticsService'

// Analytics data doesn't need frequent updates - use longer stale times
const ANALYTICS_STALE_TIME = 10 * 60 * 1000 // 10 minutes
const ANALYTICS_GC_TIME = 30 * 60 * 1000 // 30 minutes

/**
 * Predictive Analytics Hooks
 */
export function usePredictiveAnalytics(daysAhead: number = 30) {
  return useQuery<PredictiveAnalyticsResponse>({
    queryKey: ['predictive-analytics', daysAhead],
    queryFn: () => predictiveAnalytics.getApplicationVolume(daysAhead),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
  })
}

export function useGeneratePredictiveReport() {
  return useMutation({
    mutationFn: ({ daysAhead, format }: { daysAhead: number; format: 'pdf' | 'excel' | 'json' }) =>
      predictiveAnalytics.generateReport(daysAhead, format),
  })
}

/**
 * Compliance Analytics Hooks
 */
export function useComplianceCheck(includeDetails: boolean = true) {
  return useQuery<ComplianceReport>({
    queryKey: ['compliance-check', includeDetails],
    queryFn: () => complianceAnalytics.runCheck(includeDetails),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
  })
}

export function useGenerateComplianceReport() {
  return useMutation({
    mutationFn: ({ format, includeDetails }: { format: 'pdf' | 'excel' | 'json'; includeDetails: boolean }) =>
      complianceAnalytics.generateReport(format, includeDetails),
  })
}

export function useValidateCompliance() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: () => complianceAnalytics.validate(),
    onSuccess: () => {
      // Invalidate compliance check query to refetch
      queryClient.invalidateQueries({ queryKey: ['compliance-check'] })
    },
  })
}

/**
 * Real-time Metrics Hooks
 */
export function useRealtimeMetrics(refetchInterval?: number) {
  return useQuery<RealtimeMetrics>({
    queryKey: ['realtime-metrics'],
    queryFn: () => realtimeMetrics.getMetrics(),
    staleTime: 0, // Always consider stale for real-time data
    gcTime: 1 * 60 * 1000, // 1 minute
    refetchInterval: refetchInterval || false, // Optional auto-refetch
  })
}

/**
 * Comprehensive Metrics Hooks
 */
export function useComprehensiveMetrics(
  startDate: string,
  endDate: string,
  programs?: string[],
  includeTimeSeries: boolean = true,
  includeProcessingTimes: boolean = true
) {
  return useQuery({
    queryKey: ['comprehensive-metrics', startDate, endDate, programs, includeTimeSeries, includeProcessingTimes],
    queryFn: () => comprehensiveMetrics.getMetrics(startDate, endDate, programs, includeTimeSeries, includeProcessingTimes),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    enabled: Boolean(startDate && endDate), // Only run if dates are provided
  })
}

/**
 * Dashboard Analytics Hooks
 */
export function useDashboard(layoutId: string = 'default', includeAlerts: boolean = true) {
  return useQuery({
    queryKey: ['dashboard', layoutId, includeAlerts],
    queryFn: () => dashboardAnalytics.getDashboard(layoutId, includeAlerts),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
  })
}

export function useExecutiveSummary(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['executive-summary', startDate, endDate],
    queryFn: () => dashboardAnalytics.getExecutiveSummary(startDate, endDate),
    staleTime: ANALYTICS_STALE_TIME,
    gcTime: ANALYTICS_GC_TIME,
    enabled: Boolean(startDate && endDate), // Only run if dates are provided
  })
}
