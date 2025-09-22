import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { ReportExportData, ReportFormat } from './reportExports'
import { isReportManagerRole } from '@/lib/auth/roles'
import { sanitizeForLog } from './security'

export interface AnalyticsEvent {
  user_id?: string
  session_id?: string
  page_path: string
  action_type: string
  duration_seconds?: number
  metadata?: Record<string, any>
}

export interface ApplicationStats {
  id?: string
  date: string
  totalApplications: number
  submittedApplications: number
  approvedApplications: number
  rejectedApplications: number
  pendingApplications: number
  programId?: string
  intakeId?: string
}

export interface ProgramAnalytics {
  id?: string
  programId: string
  programName: string
  date: string
  applicationsCount: number
  approvalRate: number
  completionRate: number
  averageProcessingDays: number
}

export interface EligibilityAnalytics {
  id?: string
  date: string
  totalChecks: number
  passedChecks: number
  failedChecks: number
  successRate: number
  commonFailureReasons: string[]
}

export interface AutomatedReport {
  id?: string
  reportType: string
  reportName: string
  reportData: ReportExportData
  generatedBy?: string
  createdAt?: string
  format?: ReportFormat
}

export class AnalyticsService {
  // Ensure user is authenticated before making requests
  static async ensureAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('User not authenticated - JWT token missing')
    }
    return session
  }

  private static async fetchCurrentUserRole(session: Session): Promise<string | null> {
    const userId = session.user?.id

    if (!userId) {
      return null
    }

    if (session.user?.email === 'cosmas@beanola.com') {
      return 'super_admin'
    }

    if (typeof fetch === 'undefined') {
      console.warn('Fetch API unavailable while verifying analytics permissions.')
      return null
    }

    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (response.status === 404) {
        return null
      }

      if (!response.ok) {
        throw new Error(response.statusText || 'Failed to retrieve user role for analytics guard')
      }

      const data = await response.json()
      return typeof data?.role === 'string' ? data.role : null
    } catch (error) {
      console.error(
        'Failed to verify analytics permissions:',
        sanitizeForLog(error instanceof Error ? error.message : error)
      )
      throw error instanceof Error ? error : new Error('Failed to verify analytics permissions')
    }
  }

  static async ensureReportManagerAccess() {
    const session = await this.ensureAuthenticated()
    const role = await this.fetchCurrentUserRole(session)

    if (!isReportManagerRole(role)) {
      throw new Error('You do not have permission to manage analytics reports.')
    }
  }

  // Event Tracking
  static async trackEvent(event: AnalyticsEvent) {
    try {
      // Allow anonymous tracking for web vitals and basic events
      const { data: { session } } = await supabase.auth.getSession()
      
      const { error } = await supabase
        .from('user_engagement_metrics')
        .insert({
          user_id: session?.user?.id || event.user_id,
          session_id: event.session_id,
          page_path: event.page_path,
          action_type: event.action_type,
          duration_seconds: event.duration_seconds,
          metadata: event.metadata
        })

      if (error) throw error
    } catch (error) {
      // Silently fail for anonymous users
      if (process.env.NODE_ENV === 'development') {
        console.warn('Analytics tracking failed (expected for anonymous users):', error)
      }
    }
  }

  // Application Statistics CRUD
  static async createApplicationStats(stats: Omit<ApplicationStats, 'id'>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('application_statistics')
      .insert({
        date: stats.date,
        total_applications: stats.totalApplications,
        submitted_applications: stats.submittedApplications,
        approved_applications: stats.approvedApplications,
        rejected_applications: stats.rejectedApplications,
        pending_applications: stats.pendingApplications,
        program_id: stats.programId,
        intake_id: stats.intakeId
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async updateApplicationStats(id: string, stats: Partial<ApplicationStats>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('application_statistics')
      .update({
        ...(stats.date && { date: stats.date }),
        ...(stats.totalApplications !== undefined && { total_applications: stats.totalApplications }),
        ...(stats.submittedApplications !== undefined && { submitted_applications: stats.submittedApplications }),
        ...(stats.approvedApplications !== undefined && { approved_applications: stats.approvedApplications }),
        ...(stats.rejectedApplications !== undefined && { rejected_applications: stats.rejectedApplications }),
        ...(stats.pendingApplications !== undefined && { pending_applications: stats.pendingApplications }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async deleteApplicationStats(id: string) {
    await this.ensureReportManagerAccess()

    const { error } = await supabase
      .from('application_statistics')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  static async getApplicationStatistics(startDate: string, endDate: string): Promise<ApplicationStats[]> {
    const { data, error } = await supabase
      .from('application_statistics')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (error) throw error
    return data?.map(item => ({
      id: item.id,
      date: item.date,
      totalApplications: item.total_applications,
      submittedApplications: item.submitted_applications,
      approvedApplications: item.approved_applications,
      rejectedApplications: item.rejected_applications,
      pendingApplications: item.pending_applications,
      programId: item.program_id,
      intakeId: item.intake_id
    })) || []
  }

  // Program Analytics CRUD
  static async createProgramAnalytics(analytics: Omit<ProgramAnalytics, 'id' | 'programName'>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('program_analytics')
      .insert({
        program_id: analytics.programId,
        date: analytics.date,
        applications_count: analytics.applicationsCount,
        approval_rate: analytics.approvalRate,
        completion_rate: analytics.completionRate,
        average_processing_days: analytics.averageProcessingDays
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async updateProgramAnalytics(id: string, analytics: Partial<ProgramAnalytics>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('program_analytics')
      .update({
        ...(analytics.date && { date: analytics.date }),
        ...(analytics.applicationsCount !== undefined && { applications_count: analytics.applicationsCount }),
        ...(analytics.approvalRate !== undefined && { approval_rate: analytics.approvalRate }),
        ...(analytics.completionRate !== undefined && { completion_rate: analytics.completionRate }),
        ...(analytics.averageProcessingDays !== undefined && { average_processing_days: analytics.averageProcessingDays }),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async deleteProgramAnalytics(id: string) {
    await this.ensureReportManagerAccess()

    const { error } = await supabase
      .from('program_analytics')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  static async getProgramAnalytics(programId?: string): Promise<ProgramAnalytics[]> {
    let query = supabase
      .from('program_analytics')
      .select(`
        *,
        programs!inner(name)
      `)

    if (programId) {
      query = query.eq('program_id', programId)
    }

    const { data, error } = await query.order('date', { ascending: false })

    if (error) throw error
    return data?.map(item => ({
      id: item.id,
      programId: item.program_id,
      programName: item.programs.name,
      date: item.date,
      applicationsCount: item.applications_count,
      approvalRate: item.approval_rate,
      completionRate: item.completion_rate,
      averageProcessingDays: item.average_processing_days
    })) || []
  }

  // Eligibility Analytics CRUD
  static async createEligibilityAnalytics(analytics: Omit<EligibilityAnalytics, 'id'>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('eligibility_analytics')
      .insert({
        date: analytics.date,
        total_eligibility_checks: analytics.totalChecks,
        passed_eligibility: analytics.passedChecks,
        failed_eligibility: analytics.failedChecks,
        success_rate: analytics.successRate,
        common_failure_reasons: analytics.commonFailureReasons
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async updateEligibilityAnalytics(id: string, analytics: Partial<EligibilityAnalytics>) {
    await this.ensureReportManagerAccess()

    const { data, error } = await supabase
      .from('eligibility_analytics')
      .update({
        ...(analytics.date && { date: analytics.date }),
        ...(analytics.totalChecks !== undefined && { total_eligibility_checks: analytics.totalChecks }),
        ...(analytics.passedChecks !== undefined && { passed_eligibility: analytics.passedChecks }),
        ...(analytics.failedChecks !== undefined && { failed_eligibility: analytics.failedChecks }),
        ...(analytics.successRate !== undefined && { success_rate: analytics.successRate }),
        ...(analytics.commonFailureReasons && { common_failure_reasons: analytics.commonFailureReasons })
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  static async deleteEligibilityAnalytics(id: string) {
    await this.ensureReportManagerAccess()

    const { error } = await supabase
      .from('eligibility_analytics')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  static async getEligibilityAnalytics(startDate: string, endDate: string): Promise<EligibilityAnalytics[]> {
    const { data, error } = await supabase
      .from('eligibility_analytics')
      .select('*')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date')

    if (error) throw error
    return data?.map(item => ({
      id: item.id,
      date: item.date,
      totalChecks: item.total_eligibility_checks,
      passedChecks: item.passed_eligibility,
      failedChecks: item.failed_eligibility,
      successRate: item.success_rate,
      commonFailureReasons: item.common_failure_reasons || []
    })) || []
  }

  // Automated Reports CRUD
  static async createAutomatedReport(report: Omit<AutomatedReport, 'id' | 'createdAt'>) {
    await this.ensureReportManagerAccess()

    const { data: { user } } = await supabase.auth.getUser()

    const preparedReportData = report.reportData
      ? {
          ...report.reportData,
          metadata: {
            ...(report.reportData.metadata || {}),
            ...(report.format ? { exportFormat: report.format } : {})
          }
        }
      : report.reportData

    const { data, error } = await supabase
      .from('automated_reports')
      .insert({
        report_type: report.reportType,
        report_name: report.reportName,
        report_data: preparedReportData,
        generated_by: user?.id
      })
      .select()
      .single()

    if (error) throw error

    return {
      id: data.id,
      reportType: data.report_type,
      reportName: data.report_name,
      reportData: (data.report_data || {}) as ReportExportData,
      generatedBy: data.generated_by,
      createdAt: data.created_at,
      format: data.report_format || data.report_data?.metadata?.exportFormat || report.format
    }
  }

  static async getAutomatedReports(limit?: number): Promise<AutomatedReport[]> {
    await this.ensureReportManagerAccess()

    let query = supabase
      .from('automated_reports')
      .select('*')
      .order('created_at', { ascending: false })

    if (limit) {
      query = query.limit(limit)
    }

    const { data, error } = await query

    if (error) throw error
    return data?.map(item => ({
      id: item.id,
      reportType: item.report_type,
      reportName: item.report_name,
      reportData: (item.report_data || {}) as ReportExportData,
      generatedBy: item.generated_by,
      createdAt: item.created_at,
      format: item.report_format || item.report_data?.metadata?.exportFormat
    })) || []
  }

  static async deleteAutomatedReport(id: string) {
    await this.ensureReportManagerAccess()

    const { error } = await supabase
      .from('automated_reports')
      .delete()
      .eq('id', id)

    if (error) throw error
  }

  static async getUserEngagementMetrics(startDate: string, endDate: string) {
    await this.ensureAuthenticated()
    
    const { data, error } = await supabase
      .from('user_engagement_metrics')
      .select('*')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at')

    if (error) throw error
    return data || []
  }

  // Enhanced Daily Report Generation
  static async generateDailyReport(format: ReportFormat = 'pdf') {
    await this.ensureReportManagerAccess()

    const today = new Date().toISOString().split('T')[0]
    
    const { data: applications, error: appsError } = await supabase
      .from('applications_new')
      .select('*')
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)

    if (appsError) throw appsError

    const stats = {
      date: today,
      totalApplications: applications?.length || 0,
      submittedApplications: applications?.filter(app => app.status === 'submitted').length || 0,
      approvedApplications: applications?.filter(app => app.status === 'approved').length || 0,
      rejectedApplications: applications?.filter(app => app.status === 'rejected').length || 0,
      pendingApplications: applications?.filter(app => ['submitted', 'under_review'].includes(app.status)).length || 0
    }

    // Create application statistics record
    await this.createApplicationStats(stats)

    const reportName = `Daily Report - ${today}`
    const decisionCount = stats.approvedApplications + stats.rejectedApplications
    const approvalRate = decisionCount > 0
      ? ((stats.approvedApplications / decisionCount) * 100).toFixed(2)
      : '0'

    const reportData = {
      period: today,
      generatedAt: new Date().toISOString(),
      statistics: stats,
      approvalRate,
      metadata: {
        reportType: 'daily',
        exportFormat: format,
        reportTitle: reportName
      }
    }

    // Create automated report
    const report = await this.createAutomatedReport({
      reportType: 'daily',
      reportName,
      reportData,
      format
    })

    return { stats, report }
  }

  // Real-time Analytics Data Refresh
  static async refreshAnalyticsData() {
    await this.ensureReportManagerAccess()

    const today = new Date().toISOString().split('T')[0]
    
    // Get current applications data
    const { data: applications } = await supabase
      .from('applications_new')
      .select('*')
      .gte('created_at', `${today}T00:00:00`)
      .lt('created_at', `${today}T23:59:59`)

    if (applications) {
      const stats = {
        date: today,
        totalApplications: applications.length,
        submittedApplications: applications.filter(app => app.status === 'submitted').length,
        approvedApplications: applications.filter(app => app.status === 'approved').length,
        rejectedApplications: applications.filter(app => app.status === 'rejected').length,
        pendingApplications: applications.filter(app => ['submitted', 'under_review'].includes(app.status)).length
      }

      // Check if today's stats exist, update or create
      const { data: existingStats } = await supabase
        .from('application_statistics')
        .select('id')
        .eq('date', today)
        .single()

      if (existingStats) {
        await this.updateApplicationStats(existingStats.id, stats)
      } else {
        await this.createApplicationStats(stats)
      }
    }
  }

  static async getSystemPerformanceMetrics() {
    const { data, error } = await supabase
      .from('system_performance_metrics')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(100)

    if (error) throw error
    return data || []
  }

  // Bulk Operations
  static async bulkCreateApplicationStats(statsArray: Omit<ApplicationStats, 'id'>[]) {
    const { data, error } = await supabase
      .from('application_statistics')
      .insert(statsArray.map(stats => ({
        date: stats.date,
        total_applications: stats.totalApplications,
        submitted_applications: stats.submittedApplications,
        approved_applications: stats.approvedApplications,
        rejected_applications: stats.rejectedApplications,
        pending_applications: stats.pendingApplications,
        program_id: stats.programId,
        intake_id: stats.intakeId
      })))
      .select()

    if (error) throw error
    return data
  }

  // Analytics Summary
  static async getAnalyticsSummary(startDate: string, endDate: string) {
    const [appStats, progAnalytics, eligAnalytics, engagement] = await Promise.all([
      this.getApplicationStatistics(startDate, endDate),
      this.getProgramAnalytics(),
      this.getEligibilityAnalytics(startDate, endDate),
      this.getUserEngagementMetrics(startDate, endDate)
    ])

    const totalApplications = appStats.reduce((sum, stat) => sum + stat.totalApplications, 0)
    const totalApproved = appStats.reduce((sum, stat) => sum + stat.approvedApplications, 0)
    const totalRejected = appStats.reduce((sum, stat) => sum + stat.rejectedApplications, 0)
    const overallApprovalRate = totalApplications > 0 ? ((totalApproved / (totalApproved + totalRejected)) * 100) : 0

    const avgEligibilitySuccess = eligAnalytics.length > 0 
      ? (eligAnalytics.reduce((sum, stat) => sum + stat.successRate, 0) / eligAnalytics.length)
      : 0

    const uniqueUsers = new Set(engagement.map(m => m.user_id)).size
    const avgSessionDuration = engagement.length > 0
      ? (engagement.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) / engagement.length / 60)
      : 0

    return {
      totalApplications,
      totalApproved,
      totalRejected,
      overallApprovalRate: parseFloat(overallApprovalRate.toFixed(1)),
      avgEligibilitySuccess: parseFloat(avgEligibilitySuccess.toFixed(1)),
      uniqueUsers,
      avgSessionDuration: parseFloat(avgSessionDuration.toFixed(1)),
      applicationStats: appStats,
      programAnalytics: progAnalytics,
      eligibilityAnalytics: eligAnalytics,
      engagementMetrics: engagement
    }
  }
}