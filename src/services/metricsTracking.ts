import { applicationService } from '@/services/applications'
import { apiClient } from '@/services/client'
import { ApiErrorHandler } from '@/lib/apiErrorHandler'
import type {
  ComprehensiveMetrics,
  MetricsQuery,
  MetricsCalculationResult,
  ApplicationMetrics,
  ProgramMetrics,
  ProcessingTimeMetrics,
  ConversionMetrics,
  TimeSeriesDataPoint,
} from '@/types/analytics'

type ApplicationRecord = {
  id?: string
  program?: string
  status?: string
  created_at?: string
  submitted_at?: string
  updated_at?: string
}

const isTransientNetworkError = (error: unknown): boolean => ApiErrorHandler.isRetryableError(error)

const safeDate = (value?: string): Date | null => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const toHourDiff = (start?: string, end?: string): number | null => {
  const startDate = safeDate(start)
  const endDate = safeDate(end)
  if (!startDate || !endDate) return null
  const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60)
  return Number.isFinite(diff) && diff >= 0 ? diff : null
}

const round2 = (value: number): number => Math.round(value * 100) / 100

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[index]
}

const createEmptyApplicationMetrics = (): ApplicationMetrics => ({
  totalApplications: 0,
  completedApplications: 0,
  pendingApplications: 0,
  approvedApplications: 0,
  rejectedApplications: 0,
  completionRate: 0,
  approvalRate: 0,
  rejectionRate: 0,
})

const createEmptyProcessingMetrics = (): ProcessingTimeMetrics => ({
  averageSubmissionToReview: 0,
  averageReviewToDecision: 0,
  averageOverallProcessing: 0,
  medianProcessingTime: 0,
  percentile95ProcessingTime: 0,
})

const createEmptyConversionMetrics = (): ConversionMetrics => ({
  registrationToApplication: 0,
  applicationToSubmission: 0,
  submissionToApproval: 0,
  overallConversionRate: 0,
})

const buildTimeSeries = (
  apps: ApplicationRecord[],
  query: MetricsQuery
): { applications: TimeSeriesDataPoint[]; approvals: TimeSeriesDataPoint[]; processingTimes: TimeSeriesDataPoint[] } => {
  const byDay = new Map<string, { applications: number; approvals: number; processingValues: number[] }>()

  apps.forEach((app) => {
    const created = safeDate(app.created_at)
    if (!created) return

    const bucket = created.toISOString().slice(0, 10)
    const current = byDay.get(bucket) ?? { applications: 0, approvals: 0, processingValues: [] }
    current.applications += 1

    if ((app.status ?? '').toLowerCase() === 'approved') {
      current.approvals += 1
    }

    const processingHours = toHourDiff(app.submitted_at ?? app.created_at, app.updated_at)
    if (processingHours !== null) {
      current.processingValues.push(processingHours)
    }

    byDay.set(bucket, current)
  })

  const keys = Array.from(byDay.keys()).sort()

  return {
    applications: keys.map((key) => ({ timestamp: key, value: byDay.get(key)?.applications ?? 0 })),
    approvals: keys.map((key) => ({ timestamp: key, value: byDay.get(key)?.approvals ?? 0 })),
    processingTimes: keys.map((key) => {
      const values = byDay.get(key)?.processingValues ?? []
      const average = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0
      return { timestamp: key, value: round2(average) }
    }),
  }
}

class MetricsTrackingService {
  private async fetchApplications(query: MetricsQuery): Promise<ApplicationRecord[]> {
    const response = await applicationService.list({
      page: 0,
      pageSize: 500,
      sortBy: 'date',
      sortOrder: 'desc',
      startDate: query.timeRange.startDate,
      endDate: query.timeRange.endDate,
      includeStats: true,
    })

    const apps = (response?.applications ?? []) as ApplicationRecord[]
    if (!query.programs?.length) {
      return apps
    }

    const allowed = new Set(query.programs.map((program) => program.toLowerCase()))
    return apps.filter((app) => app.program && allowed.has(app.program.toLowerCase()))
  }

  private calculateApplicationMetrics(apps: ApplicationRecord[]): ApplicationMetrics {
    const totalApplications = apps.length
    const completedApplications = apps.filter((app) => app.submitted_at).length
    const approvedApplications = apps.filter((app) => (app.status ?? '').toLowerCase() === 'approved').length
    const rejectedApplications = apps.filter((app) => (app.status ?? '').toLowerCase() === 'rejected').length
    const pendingApplications = apps.filter((app) => ['submitted', 'under_review', 'pending_review'].includes((app.status ?? '').toLowerCase())).length

    return {
      totalApplications,
      completedApplications,
      pendingApplications,
      approvedApplications,
      rejectedApplications,
      completionRate: totalApplications > 0 ? round2((completedApplications / totalApplications) * 100) : 0,
      approvalRate: completedApplications > 0 ? round2((approvedApplications / completedApplications) * 100) : 0,
      rejectionRate: completedApplications > 0 ? round2((rejectedApplications / completedApplications) * 100) : 0,
    }
  }

  private calculateProgramMetrics(apps: ApplicationRecord[]): ProgramMetrics[] {
    const byProgram = new Map<string, ApplicationRecord[]>()

    apps.forEach((app) => {
      const programName = app.program || 'Unknown'
      const existing = byProgram.get(programName) ?? []
      existing.push(app)
      byProgram.set(programName, existing)
    })

    return Array.from(byProgram.entries()).map(([programName, records]) => {
      const applicationMetrics = this.calculateApplicationMetrics(records)
      const processingValues = records
        .map((record) => toHourDiff(record.submitted_at ?? record.created_at, record.updated_at))
        .filter((value): value is number => value !== null)

      const averageProcessingTime = processingValues.length
        ? round2(processingValues.reduce((sum, value) => sum + value, 0) / processingValues.length / 24)
        : 0

      return {
        programId: programName,
        programName,
        totalApplications: applicationMetrics.totalApplications,
        completedApplications: applicationMetrics.completedApplications,
        approvedApplications: applicationMetrics.approvedApplications,
        rejectedApplications: applicationMetrics.rejectedApplications,
        completionRate: applicationMetrics.completionRate,
        approvalRate: applicationMetrics.approvalRate,
        averageProcessingTime,
      }
    })
  }

  private calculateProcessingTimeMetrics(apps: ApplicationRecord[]): ProcessingTimeMetrics {
    const overall = apps
      .map((app) => toHourDiff(app.submitted_at ?? app.created_at, app.updated_at))
      .filter((value): value is number => value !== null)

    if (overall.length === 0) {
      return createEmptyProcessingMetrics()
    }

    const averageOverall = round2(overall.reduce((sum, value) => sum + value, 0) / overall.length)

    return {
      averageSubmissionToReview: averageOverall,
      averageReviewToDecision: averageOverall,
      averageOverallProcessing: averageOverall,
      medianProcessingTime: round2(percentile(overall, 50)),
      percentile95ProcessingTime: round2(percentile(overall, 95)),
    }
  }

  private calculateConversionMetrics(apps: ApplicationRecord[]): ConversionMetrics {
    const total = apps.length
    const submitted = apps.filter((app) => !!app.submitted_at).length
    const approved = apps.filter((app) => (app.status ?? '').toLowerCase() === 'approved').length

    return {
      registrationToApplication: total > 0 ? 100 : 0,
      applicationToSubmission: total > 0 ? round2((submitted / total) * 100) : 0,
      submissionToApproval: submitted > 0 ? round2((approved / submitted) * 100) : 0,
      overallConversionRate: total > 0 ? round2((approved / total) * 100) : 0,
    }
  }

  async getComprehensiveMetrics(query: MetricsQuery): Promise<MetricsCalculationResult> {
    const startedAt = Date.now()

    try {
      const apps = await this.fetchApplications(query)

      const data: ComprehensiveMetrics = {
        applicationMetrics: this.calculateApplicationMetrics(apps),
        programMetrics: this.calculateProgramMetrics(apps),
        processingTimeMetrics: query.includeProcessingTimes === false
          ? createEmptyProcessingMetrics()
          : this.calculateProcessingTimeMetrics(apps),
        conversionMetrics: this.calculateConversionMetrics(apps),
        timeSeriesData: query.includeTimeSeries === false
          ? { applications: [], approvals: [], processingTimes: [] }
          : buildTimeSeries(apps, query),
        generatedAt: new Date().toISOString(),
        timeRange: query.timeRange,
      }

      return {
        success: true,
        data,
        calculationTime: Date.now() - startedAt,
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        return {
          success: true,
          data: {
            applicationMetrics: createEmptyApplicationMetrics(),
            programMetrics: [],
            processingTimeMetrics: createEmptyProcessingMetrics(),
            conversionMetrics: createEmptyConversionMetrics(),
            timeSeriesData: { applications: [], approvals: [], processingTimes: [] },
            generatedAt: new Date().toISOString(),
            timeRange: query.timeRange,
          },
          calculationTime: Date.now() - startedAt,
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate comprehensive metrics',
        calculationTime: Date.now() - startedAt,
      }
    }
  }

  async getApplicationMetrics(timeRange: MetricsQuery['timeRange']): Promise<ApplicationMetrics> {
    const result = await this.getComprehensiveMetrics({ timeRange, includeTimeSeries: false, includeProcessingTimes: false })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to load application metrics')
    }
    return result.data.applicationMetrics
  }

  async getProgramMetrics(timeRange: MetricsQuery['timeRange'], programs?: string[]): Promise<ProgramMetrics[]> {
    const result = await this.getComprehensiveMetrics({ timeRange, programs, includeTimeSeries: false, includeProcessingTimes: true })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to load program metrics')
    }
    return result.data.programMetrics
  }

  async getProcessingTimeMetrics(timeRange: MetricsQuery['timeRange']): Promise<ProcessingTimeMetrics> {
    const result = await this.getComprehensiveMetrics({ timeRange, includeTimeSeries: false, includeProcessingTimes: true })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to load processing metrics')
    }
    return result.data.processingTimeMetrics
  }

  async getConversionMetrics(timeRange: MetricsQuery['timeRange']): Promise<ConversionMetrics> {
    const result = await this.getComprehensiveMetrics({ timeRange, includeTimeSeries: false, includeProcessingTimes: false })
    if (!result.success || !result.data) {
      throw new Error(result.error ?? 'Failed to load conversion metrics')
    }
    return result.data.conversionMetrics
  }

  async trackApplicationEvent(event: {
    applicationId: string
    eventType: 'created' | 'submitted' | 'reviewed' | 'approved' | 'rejected'
    programId: string
    userId: string
    timestamp?: string
    metadata?: Record<string, unknown>
  }): Promise<void> {
    try {
      await apiClient.request('/applications/track-event', {
        method: 'POST',
        body: JSON.stringify({
          ...event,
          timestamp: event.timestamp ?? new Date().toISOString(),
        }),
      })
    } catch (error) {
      if (isTransientNetworkError(error)) {
        console.warn('Transient error tracking application event; ignoring event flush.', error)
        return
      }

      if (error instanceof Error && error.message.toLowerCase().includes('not found')) {
        console.warn('Application event tracking endpoint is unavailable; event tracking disabled until endpoint is added.')
        return
      }

      throw error
    }
  }

  async getRealTimeMetrics(): Promise<{
    activeApplications: number
    todaySubmissions: number
    pendingReviews: number
    averageProcessingTime: number
    systemLoad: number
  }> {
    try {
      const [stats, dashboard] = await Promise.all([
        apiClient.request<{
          totalApplications?: number
          pendingApplications?: number
          approvedApplications?: number
          rejectedApplications?: number
          todayApplications?: number
          weekApplications?: number
          pendingReviews?: number
        }>('/admin?action=stats'),
        apiClient.request<{ stats?: { avgProcessingTime?: number; avgProcessingTimeHours?: number } }>('/admin?action=dashboard'),
      ])

      const totalApplications = stats?.totalApplications ?? 0
      const pendingReviews = stats?.pendingApplications ?? stats?.pendingReviews ?? 0
      const processingDays = dashboard?.stats?.avgProcessingTime
      const processingHours = dashboard?.stats?.avgProcessingTimeHours
      const averageProcessingTime = typeof processingDays === 'number'
        ? processingDays
        : typeof processingHours === 'number'
          ? round2(processingHours / 24)
          : 0

      const systemLoad = totalApplications > 0
        ? Math.min(100, round2((pendingReviews / totalApplications) * 100))
        : 0

      return {
        activeApplications: totalApplications,
        todaySubmissions: stats?.todayApplications ?? 0,
        pendingReviews,
        averageProcessingTime,
        systemLoad,
      }
    } catch (error) {
      if (isTransientNetworkError(error)) {
        return {
          activeApplications: 0,
          todaySubmissions: 0,
          pendingReviews: 0,
          averageProcessingTime: 0,
          systemLoad: 0,
        }
      }

      throw error
    }
  }
}

export const metricsTrackingService = new MetricsTrackingService()
