import { apiClient } from './client'
import type { 
  ComplianceReport,
  HPCZReport,
  GNCReport,
  NMCZReport,
  ECZReport,
  ComplianceAuditTrail,
  ComplianceValidation,
  ComplianceTemplate,
  ComplianceSchedule,
  ComplianceMetrics,
  RegulatoryBody
} from '@/types/compliance'

/**
 * Regulatory Compliance Reporting Service
 * Generates reports for HPCZ, GNC/NMCZ, and ECZ regulatory bodies
 * Validates Requirements 5.4
 */
class ComplianceReportingService {
  /**
   * Generate compliance report for specified regulatory body
   */
  async generateComplianceReport(
    regulatoryBody: RegulatoryBody['acronym'],
    reportType: ComplianceReport['reportType'],
    reportingPeriod: { startDate: string; endDate: string }
  ): Promise<ComplianceReport> {
    const response = await apiClient.request('/analytics/compliance/generate', {
      method: 'POST',
      body: JSON.stringify({
        regulatoryBody,
        reportType,
        reportingPeriod
      })
    })
    
    return response as ComplianceReport
  }

  /**
   * Generate HPCZ-specific compliance report
   */
  async generateHPCZReport(reportingPeriod: { startDate: string; endDate: string }): Promise<HPCZReport> {
    const response = await apiClient.request('/analytics/compliance/hpcz', {
      method: 'POST',
      body: JSON.stringify({ reportingPeriod })
    })
    
    return response as HPCZReport
  }

  /**
   * Generate GNC-specific compliance report
   */
  async generateGNCReport(reportingPeriod: { startDate: string; endDate: string }): Promise<GNCReport> {
    const response = await apiClient.request('/analytics/compliance/gnc', {
      method: 'POST',
      body: JSON.stringify({ reportingPeriod })
    })
    
    return response as GNCReport
  }

  /**
   * Generate NMCZ-specific compliance report
   */
  async generateNMCZReport(reportingPeriod: { startDate: string; endDate: string }): Promise<NMCZReport> {
    const response = await apiClient.request('/analytics/compliance/nmcz', {
      method: 'POST',
      body: JSON.stringify({ reportingPeriod })
    })
    
    return response as NMCZReport
  }

  /**
   * Generate ECZ-specific compliance report
   */
  async generateECZReport(reportingPeriod: { startDate: string; endDate: string }): Promise<ECZReport> {
    const response = await apiClient.request('/analytics/compliance/ecz', {
      method: 'POST',
      body: JSON.stringify({ reportingPeriod })
    })
    
    return response as ECZReport
  }

  /**
   * Validate compliance report data
   */
  async validateComplianceReport(reportId: string): Promise<ComplianceValidation> {
    const response = await apiClient.request(`/analytics/compliance/validate/${reportId}`)
    return response as ComplianceValidation
  }

  /**
   * Submit compliance report to regulatory body
   */
  async submitComplianceReport(reportId: string, submissionNotes?: string): Promise<{
    success: boolean
    submissionId?: string
    confirmationNumber?: string
    error?: string
  }> {
    const response = await apiClient.request(`/analytics/compliance/submit/${reportId}`, {
      method: 'POST',
      body: JSON.stringify({ submissionNotes })
    })
    
    return response
  }

  /**
   * Get compliance audit trail for a report
   */
  async getComplianceAuditTrail(reportId: string): Promise<ComplianceAuditTrail[]> {
    const response = await apiClient.request(`/analytics/compliance/audit-trail/${reportId}`)
    return response as ComplianceAuditTrail[]
  }

  /**
   * Get all compliance reports with filtering
   */
  async getComplianceReports(filters?: {
    regulatoryBody?: RegulatoryBody['acronym']
    reportType?: ComplianceReport['reportType']
    status?: ComplianceReport['status']
    startDate?: string
    endDate?: string
  }): Promise<ComplianceReport[]> {
    const queryParams = new URLSearchParams()
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value)
      })
    }
    
    const response = await apiClient.request(`/analytics/compliance/reports?${queryParams.toString()}`)
    return response as ComplianceReport[]
  }

  /**
   * Get compliance templates for report generation
   */
  async getComplianceTemplates(regulatoryBody?: RegulatoryBody['acronym']): Promise<ComplianceTemplate[]> {
    const url = regulatoryBody 
      ? `/analytics/compliance/templates?regulatoryBody=${regulatoryBody}`
      : '/analytics/compliance/templates'
    
    const response = await apiClient.request(url)
    return response as ComplianceTemplate[]
  }

  /**
   * Create compliance schedule for automated reporting
   */
  async createComplianceSchedule(schedule: Omit<ComplianceSchedule, 'id' | 'status'>): Promise<ComplianceSchedule> {
    const response = await apiClient.request('/analytics/compliance/schedules', {
      method: 'POST',
      body: JSON.stringify(schedule)
    })
    
    return response as ComplianceSchedule
  }

  /**
   * Get compliance schedules
   */
  async getComplianceSchedules(): Promise<ComplianceSchedule[]> {
    const response = await apiClient.request('/analytics/compliance/schedules')
    return response as ComplianceSchedule[]
  }

  /**
   * Get compliance metrics and statistics
   */
  async getComplianceMetrics(timeRange?: { startDate: string; endDate: string }): Promise<ComplianceMetrics> {
    const url = timeRange 
      ? `/analytics/compliance/metrics?startDate=${timeRange.startDate}&endDate=${timeRange.endDate}`
      : '/analytics/compliance/metrics'
    
    const response = await apiClient.request(url)
    return response as ComplianceMetrics
  }

  /**
   * Perform automated compliance checking
   */
  async performComplianceCheck(checkType: 'data_integrity' | 'regulatory_requirements' | 'submission_deadlines'): Promise<{
    checkType: string
    performedAt: string
    results: {
      category: string
      status: 'compliant' | 'non_compliant' | 'warning'
      message: string
      recommendation?: string
    }[]
    overallStatus: 'compliant' | 'non_compliant' | 'warning'
    complianceScore: number
  }> {
    const response = await apiClient.request('/analytics/compliance/check', {
      method: 'POST',
      body: JSON.stringify({ checkType })
    })
    
    return response
  }

  /**
   * Export compliance report in various formats
   */
  async exportComplianceReport(
    reportId: string, 
    format: 'pdf' | 'excel' | 'csv' | 'xml',
    includeAuditTrail = false
  ): Promise<{
    downloadUrl: string
    filename: string
    expiresAt: string
  }> {
    const response = await apiClient.request(`/analytics/compliance/export/${reportId}`, {
      method: 'POST',
      body: JSON.stringify({ format, includeAuditTrail })
    })
    
    return response
  }

  /**
   * Get regulatory body information and requirements
   */
  async getRegulatoryBodies(): Promise<RegulatoryBody[]> {
    const response = await apiClient.request('/analytics/compliance/regulatory-bodies')
    return response as RegulatoryBody[]
  }

  /**
   * Archive old compliance reports
   */
  async archiveComplianceReports(reportIds: string[]): Promise<{
    success: boolean
    archivedCount: number
    errors: string[]
  }> {
    const response = await apiClient.request('/analytics/compliance/archive', {
      method: 'POST',
      body: JSON.stringify({ reportIds })
    })
    
    return response
  }

  /**
   * Generate compliance dashboard data
   */
  async getComplianceDashboard(): Promise<{
    upcomingDeadlines: {
      reportType: string
      regulatoryBody: string
      dueDate: string
      daysRemaining: number
      status: string
    }[]
    recentSubmissions: {
      reportId: string
      reportType: string
      regulatoryBody: string
      submittedAt: string
      status: string
    }[]
    complianceAlerts: {
      type: 'overdue' | 'approaching_deadline' | 'validation_error' | 'submission_failed'
      message: string
      severity: 'high' | 'medium' | 'low'
      actionRequired: string
    }[]
    overallComplianceScore: number
    trendsOverTime: {
      month: string
      reportsSubmitted: number
      onTimeRate: number
      complianceScore: number
    }[]
  }> {
    const response = await apiClient.request('/analytics/compliance/dashboard')
    return response
  }
}

export const complianceReportingService = new ComplianceReportingService()