// @ts-nocheck
/**
 * Analytics Service (Stub)
 * 
 * The full analytics feature (Supabase-backed) was removed during migration.
 * This module preserves the public interface as no-ops so existing callers
 * (useAnalytics hook, ReportsGenerator, AnalyticsTracker) don't break.
 */
import { isReportManagerRole } from '@/lib/auth/roles'

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
  reportData: any
  generatedBy?: string
  createdAt?: string
  format?: string
}

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

export class AnalyticsService {
  static async ensureAuthenticated() {
    const response = await authFetch('/api/auth?action=session')
    if (!response.ok) {
      throw new Error('User not authenticated')
    }
    const data = await response.json()
    if (!data.success || !data.user) {
      throw new Error('User not authenticated - no valid session')
    }
    return data
  }

  static async ensureReportManagerAccess() {
    const sessionData = await this.ensureAuthenticated()
    const role = sessionData.user?.role
    if (!isReportManagerRole(role)) {
      throw new Error('You do not have permission to manage analytics reports.')
    }
  }

  /** No-op — analytics tracking removed */
  static async trackEvent(_event: AnalyticsEvent) {
    // Intentionally empty — analytics backend removed
  }

  // Stubs returning empty arrays for any remaining callers
  static async getApplicationStatistics(): Promise<ApplicationStats[]> { return [] }
  static async getProgramAnalytics(): Promise<ProgramAnalytics[]> { return [] }
  static async getEligibilityAnalytics(): Promise<EligibilityAnalytics[]> { return [] }
  static async getAutomatedReports(): Promise<AutomatedReport[]> { return [] }
  static async getUserEngagementMetrics(): Promise<any[]> { return [] }
  static async getAnalyticsSummary() {
    return {
      totalApplications: 0, totalApproved: 0, totalRejected: 0,
      overallApprovalRate: 0, avgEligibilitySuccess: 0,
      uniqueUsers: 0, avgSessionDuration: 0,
      applicationStats: [], programAnalytics: [],
      eligibilityAnalytics: [], engagementMetrics: []
    }
  }
  static async getSystemPerformanceMetrics(): Promise<any[]> { return [] }
}
