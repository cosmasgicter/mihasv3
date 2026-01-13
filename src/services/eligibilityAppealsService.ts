/**
 * Eligibility Appeals Service
 * 
 * Service layer for integrating eligibility appeals management with the application system.
 * Provides methods to manage appeals, track decisions, and generate reports.
 */

import { eligibilityAppealsEngine, type EligibilityAppeal, type AppealsDashboardMetrics, type AppealDecisionAuditTrail } from '@/lib/eligibilityAppealsEngine'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export interface AppealsServiceOptions {
  includeAuditTrail?: boolean
  includeCommunicationLog?: boolean
  includeWorkflowDetails?: boolean
}

export class EligibilityAppealsService {
  
  /**
   * Submit a new eligibility appeal
   */
  async submitAppeal(
    applicationId: string,
    studentId: string,
    appealData: {
      appealType: EligibilityAppeal['appealType']
      appealReason: string
      supportingEvidence: EligibilityAppeal['supportingEvidence']
      requestedChanges: EligibilityAppeal['requestedChanges']
      originalAssessment: EligibilityAppeal['originalAssessment']
    }
  ): Promise<EligibilityAppeal | null> {
    
    try {
      // Validate that student can submit appeal
      const canSubmit = await this.canStudentSubmitAppeal(applicationId, studentId)
      if (!canSubmit) {
        throw new Error('Student is not eligible to submit an appeal for this application')
      }
      
      // Submit the appeal
      const appeal = await eligibilityAppealsEngine.submitAppeal(
        applicationId,
        studentId,
        appealData
      )
      
      // Send notification to admissions team
      await this.notifyAdmissionsTeam(appeal)
      
      // Send confirmation to student
      await this.sendAppealConfirmation(appeal)
      
      return appeal
      
    } catch (error) {
      console.error('Error submitting appeal:', error)
      return null
    }
  }
  
  /**
   * Get appeal details with optional additional data
   */
  async getAppealDetails(
    appealId: string,
    options: AppealsServiceOptions = {}
  ): Promise<{
    appeal: EligibilityAppeal | null
    auditTrail?: AppealDecisionAuditTrail | null
    relatedApplications?: any[]
  }> {
    
    try {
      const appeal = await eligibilityAppealsEngine.getAppeal(appealId)
      if (!appeal) {
        return { appeal: null }
      }
      
      const result: any = { appeal }
      
      // Include audit trail if requested
      if (options.includeAuditTrail) {
        result.auditTrail = await eligibilityAppealsEngine.getAppealAuditTrail(appealId)
      }
      
      // Include related applications if requested
      if (appeal.applicationId) {
        result.relatedApplications = await this.getRelatedApplications(appeal.applicationId)
      }
      
      return result
      
    } catch (error) {
      console.error('Error getting appeal details:', error)
      return { appeal: null }
    }
  }
  
  /**
   * Get appeals for a student with filtering options
   */
  async getStudentAppeals(
    studentId: string,
    filters?: {
      status?: EligibilityAppeal['status'][]
      appealType?: EligibilityAppeal['appealType'][]
      dateRange?: { start: Date; end: Date }
    }
  ): Promise<EligibilityAppeal[]> {
    
    try {
      let appeals = await eligibilityAppealsEngine.getStudentAppeals(studentId)
      
      // Apply filters
      if (filters) {
        if (filters.status) {
          appeals = appeals.filter(appeal => filters.status!.includes(appeal.status))
        }
        
        if (filters.appealType) {
          appeals = appeals.filter(appeal => filters.appealType!.includes(appeal.appealType))
        }
        
        if (filters.dateRange) {
          appeals = appeals.filter(appeal => 
            appeal.submittedAt >= filters.dateRange!.start &&
            appeal.submittedAt <= filters.dateRange!.end
          )
        }
      }
      
      return appeals
      
    } catch (error) {
      console.error('Error getting student appeals:', error)
      return []
    }
  }
  
  /**
   * Get appeals for admin dashboard with pagination
   */
  async getAppealsForDashboard(
    filters?: {
      status?: EligibilityAppeal['status'][]
      priority?: EligibilityAppeal['priority'][]
      assignedReviewer?: string
      overdue?: boolean
    },
    pagination?: {
      page: number
      limit: number
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
    }
  ): Promise<{
    appeals: EligibilityAppeal[]
    totalCount: number
    hasMore: boolean
  }> {
    
    if (!isSupabaseConfigured) {
      return { appeals: [], totalCount: 0, hasMore: false }
    }
    
    try {
      let query = supabase
        .from('eligibility_appeals')
        .select('*', { count: 'exact' })
      
      // Apply filters
      if (filters) {
        if (filters.status) {
          query = query.in('status', filters.status)
        }
        
        if (filters.priority) {
          query = query.in('priority', filters.priority)
        }
        
        if (filters.assignedReviewer) {
          query = query.eq('assigned_reviewer', filters.assignedReviewer)
        }
        
        if (filters.overdue) {
          const now = new Date().toISOString()
          query = query
            .lt('expected_resolution_date', now)
            .not('status', 'in', '(approved,rejected,withdrawn)')
        }
      }
      
      // Apply pagination and sorting
      if (pagination) {
        const offset = (pagination.page - 1) * pagination.limit
        query = query.range(offset, offset + pagination.limit - 1)
        
        if (pagination.sortBy) {
          query = query.order(pagination.sortBy, { 
            ascending: pagination.sortOrder === 'asc' 
          })
        } else {
          // Default sort by priority and submission date
          query = query
            .order('priority', { ascending: false })
            .order('submitted_at', { ascending: true })
        }
      }
      
      const { data, error, count } = await query
      
      if (error) {
        console.error('Error fetching appeals for dashboard:', error)
        return { appeals: [], totalCount: 0, hasMore: false }
      }
      
      const appeals = data?.map(d => this.parseAppealData(d)) || []
      const totalCount = count || 0
      const hasMore = pagination ? (pagination.page * pagination.limit) < totalCount : false
      
      return { appeals, totalCount, hasMore }
      
    } catch (error) {
      console.error('Error getting appeals for dashboard:', error)
      return { appeals: [], totalCount: 0, hasMore: false }
    }
  }
  
  /**
   * Assign appeal to reviewer
   */
  async assignAppeal(
    appealId: string,
    reviewerId: string,
    assignedBy: string
  ): Promise<boolean> {
    
    try {
      // Validate reviewer availability
      const reviewerWorkload = await this.getReviewerWorkload(reviewerId)
      if (reviewerWorkload.assignedAppeals >= 10) { // Max 10 concurrent appeals
        throw new Error('Reviewer has reached maximum workload capacity')
      }
      
      // Assign the appeal
      const success = await eligibilityAppealsEngine.assignAppealToReviewer(
        appealId,
        reviewerId,
        assignedBy
      )
      
      if (success) {
        // Notify reviewer
        await this.notifyReviewer(appealId, reviewerId)
      }
      
      return success
      
    } catch (error) {
      console.error('Error assigning appeal:', error)
      return false
    }
  }
  
  /**
   * Update appeal status with validation
   */
  async updateAppealStatus(
    appealId: string,
    newStatus: EligibilityAppeal['status'],
    updatedBy: string,
    notes?: string
  ): Promise<boolean> {
    
    try {
      // Validate status transition
      const appeal = await eligibilityAppealsEngine.getAppeal(appealId)
      if (!appeal) {
        throw new Error('Appeal not found')
      }
      
      const validTransition = this.isValidStatusTransition(appeal.status, newStatus)
      if (!validTransition) {
        throw new Error(`Invalid status transition from ${appeal.status} to ${newStatus}`)
      }
      
      // Update status
      const success = await eligibilityAppealsEngine.updateAppealStatus(
        appealId,
        newStatus,
        updatedBy,
        notes
      )
      
      if (success) {
        // Send notification to student
        await this.notifyStudentOfStatusChange(appeal, newStatus)
      }
      
      return success
      
    } catch (error) {
      console.error('Error updating appeal status:', error)
      return false
    }
  }
  
  /**
   * Make final decision on appeal
   */
  async makeDecision(
    appealId: string,
    decision: EligibilityAppeal['decision'],
    decisionMadeBy: string
  ): Promise<boolean> {
    
    try {
      // Validate decision maker has authority
      const hasAuthority = await this.validateDecisionAuthority(decisionMadeBy, appealId)
      if (!hasAuthority) {
        throw new Error('User does not have authority to make decisions on this appeal')
      }
      
      // Make the decision
      const success = await eligibilityAppealsEngine.makeAppealDecision(
        appealId,
        decision!,
        decisionMadeBy
      )
      
      if (success) {
        // Send detailed notification to student
        await this.sendDecisionNotification(appealId, decision!)
        
        // Update related systems if approved
        if (decision!.outcome === 'approved') {
          await this.processApprovedAppeal(appealId)
        }
      }
      
      return success
      
    } catch (error) {
      console.error('Error making appeal decision:', error)
      return false
    }
  }
  
  /**
   * Add supporting evidence with validation
   */
  async addSupportingEvidence(
    appealId: string,
    evidence: EligibilityAppeal['supportingEvidence'][0],
    addedBy: string
  ): Promise<boolean> {
    
    try {
      // Validate file if provided
      if (evidence.fileUrl) {
        const isValidFile = await this.validateEvidenceFile(evidence.fileUrl)
        if (!isValidFile) {
          throw new Error('Invalid or corrupted evidence file')
        }
      }
      
      // Add evidence
      const success = await eligibilityAppealsEngine.addSupportingEvidence(
        appealId,
        evidence,
        addedBy
      )
      
      if (success) {
        // Notify assigned reviewer if any
        const appeal = await eligibilityAppealsEngine.getAppeal(appealId)
        if (appeal?.assignedReviewer) {
          await this.notifyReviewerOfNewEvidence(appealId, appeal.assignedReviewer)
        }
      }
      
      return success
      
    } catch (error) {
      console.error('Error adding supporting evidence:', error)
      return false
    }
  }
  
  /**
   * Get comprehensive dashboard metrics
   */
  async getDashboardMetrics(): Promise<AppealsDashboardMetrics> {
    try {
      return await eligibilityAppealsEngine.getDashboardMetrics()
    } catch (error) {
      console.error('Error getting dashboard metrics:', error)
      return {
        totalAppeals: 0,
        appealsByStatus: {},
        appealsByType: {},
        appealsByPriority: {},
        averageResolutionTime: 0,
        overdueAppeals: 0,
        appealsThisMonth: 0,
        approvalRate: 0,
        reviewerWorkload: [],
        trendData: {
          appealVolumeTrend: [],
          resolutionTimeTrend: [],
          approvalRateTrend: []
        }
      }
    }
  }
  
  /**
   * Generate appeals report
   */
  async generateAppealsReport(
    dateRange: { start: Date; end: Date },
    filters?: {
      status?: EligibilityAppeal['status'][]
      appealType?: EligibilityAppeal['appealType'][]
      reviewer?: string
    }
  ): Promise<{
    summary: {
      totalAppeals: number
      approvedAppeals: number
      rejectedAppeals: number
      pendingAppeals: number
      averageResolutionTime: number
    }
    appeals: EligibilityAppeal[]
    trends: {
      dailyVolume: Array<{ date: string; count: number }>
      resolutionTimes: Array<{ appealId: string; days: number }>
    }
  }> {
    
    try {
      // This would implement comprehensive reporting logic
      // For now, return basic structure
      return {
        summary: {
          totalAppeals: 0,
          approvedAppeals: 0,
          rejectedAppeals: 0,
          pendingAppeals: 0,
          averageResolutionTime: 0
        },
        appeals: [],
        trends: {
          dailyVolume: [],
          resolutionTimes: []
        }
      }
      
    } catch (error) {
      console.error('Error generating appeals report:', error)
      throw error
    }
  }
  
  /**
   * Private helper methods
   */
  
  private async canStudentSubmitAppeal(applicationId: string, studentId: string): Promise<boolean> {
    // Check if student owns the application
    // Check if appeal hasn't been submitted recently
    // Check if application is in appealable state
    return true // Simplified for now
  }
  
  private async notifyAdmissionsTeam(appeal: EligibilityAppeal): Promise<void> {
    // Implementation for notifying admissions team
  }
  
  private async sendAppealConfirmation(appeal: EligibilityAppeal): Promise<void> {
    // Implementation for sending confirmation to student
  }
  
  private async getRelatedApplications(applicationId: string): Promise<any[]> {
    // Implementation for getting related applications
    return []
  }
  
  private async getReviewerWorkload(reviewerId: string): Promise<{ assignedAppeals: number }> {
    // Implementation for getting reviewer workload
    return { assignedAppeals: 0 }
  }
  
  private async notifyReviewer(appealId: string, reviewerId: string): Promise<void> {
    // Implementation for notifying reviewer of assignment
  }
  
  private isValidStatusTransition(currentStatus: string, newStatus: string): boolean {
    const validTransitions: Record<string, string[]> = {
      'submitted': ['under_review', 'withdrawn'],
      'under_review': ['additional_info_required', 'approved', 'rejected'],
      'additional_info_required': ['under_review', 'withdrawn'],
      'approved': [], // Final state
      'rejected': [], // Final state
      'withdrawn': [] // Final state
    }
    
    return validTransitions[currentStatus]?.includes(newStatus) || false
  }
  
  private async notifyStudentOfStatusChange(appeal: EligibilityAppeal, newStatus: string): Promise<void> {
    // Implementation for notifying student of status change
  }
  
  private async validateDecisionAuthority(userId: string, appealId: string): Promise<boolean> {
    // Implementation for validating decision authority
    return true // Simplified for now
  }
  
  private async sendDecisionNotification(appealId: string, decision: EligibilityAppeal['decision']): Promise<void> {
    // Implementation for sending decision notification
  }
  
  private async processApprovedAppeal(appealId: string): Promise<void> {
    // Implementation for processing approved appeals
  }
  
  private async validateEvidenceFile(fileUrl: string): Promise<boolean> {
    // Implementation for validating evidence files
    return true // Simplified for now
  }
  
  private async notifyReviewerOfNewEvidence(appealId: string, reviewerId: string): Promise<void> {
    // Implementation for notifying reviewer of new evidence
  }
  
  private parseAppealData(data: any): EligibilityAppeal {
    // Implementation for parsing appeal data from database
    return data as EligibilityAppeal
  }
}

// Export singleton instance
export const eligibilityAppealsService = new EligibilityAppealsService()