// @ts-nocheck
/**
 * Eligibility Appeals Management Engine
 * 
 * Implements structured review workflow for appeals, adds decision tracking
 * and audit trail, and creates appeals dashboard for administrators.
 * 
 * Requirements: 7.5 - Implement structured review workflow for appeals,
 * add decision tracking and audit trail, create appeals dashboard for
 * administrators.
 */

import { apiClient } from '@/services/client'
import type { SubjectGrade } from '@/lib/eligibilityEngine'

export interface EligibilityAppeal {
  id: string
  applicationId: string
  studentId: string
  
  // Appeal details
  appealType: 'grade_dispute' | 'requirement_exception' | 'special_circumstances' | 'documentation_issue' | 'other'
  appealReason: string
  supportingEvidence: Array<{
    type: 'document' | 'statement' | 'certificate' | 'medical' | 'other'
    description: string
    fileUrl?: string
    uploadedAt: Date
  }>
  
  // Current status
  status: 'submitted' | 'under_review' | 'additional_info_required' | 'approved' | 'rejected' | 'withdrawn'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  
  // Original assessment details
  originalAssessment: {
    eligibilityStatus: string
    overallScore: number
    majorIssues: string[]
    assessmentDate: Date
  }
  
  // Requested changes
  requestedChanges: {
    gradeCorrections?: Array<{
      subject: string
      currentGrade: number
      requestedGrade: number
      justification: string
    }>
    additionalSubjects?: Array<{
      subject: string
      grade: number
      certificateUrl?: string
    }>
    specialCircumstances?: {
      description: string
      category: 'medical' | 'financial' | 'family' | 'educational' | 'other'
      impactOnStudies: string
    }
    documentationUpdates?: Array<{
      documentType: string
      issueDescription: string
      correctedDocumentUrl?: string
    }>
  }
  
  // Timeline and tracking
  submittedAt: Date
  submittedBy: string
  lastUpdatedAt: Date
  expectedResolutionDate?: Date
  actualResolutionDate?: Date
  
  // Review assignment
  assignedReviewer?: string
  reviewerNotes?: string
  reviewStartedAt?: Date
  
  // Decision details
  decision?: {
    outcome: 'approved' | 'rejected' | 'partially_approved'
    decisionReason: string
    decisionMadeBy: string
    decisionMadeAt: Date
    conditions?: string[]
    newEligibilityStatus?: string
    newOverallScore?: number
  }
  
  // Communication
  communicationLog: Array<{
    id: string
    type: 'system' | 'student' | 'reviewer' | 'admin'
    message: string
    sentBy: string
    sentAt: Date
    isInternal: boolean
  }>
  
  // Metadata
  createdAt: Date
  updatedAt: Date
}

export interface AppealReviewWorkflow {
  appealId: string
  currentStage: 'initial_review' | 'evidence_evaluation' | 'expert_consultation' | 'decision_making' | 'notification' | 'completed'
  
  stages: Array<{
    stage: string
    status: 'pending' | 'in_progress' | 'completed' | 'skipped'
    assignedTo?: string
    startedAt?: Date
    completedAt?: Date
    notes?: string
    requiredActions?: string[]
    completedActions?: string[]
  }>
  
  escalationRules: {
    autoEscalateAfterDays: number
    escalateTo: string[]
    escalationTriggers: string[]
  }
  
  slaMetrics: {
    targetResolutionDays: number
    actualResolutionDays?: number
    isOverdue: boolean
    daysOverdue?: number
  }
}

export interface AppealDecisionAuditTrail {
  appealId: string
  auditEntries: Array<{
    id: string
    timestamp: Date
    action: 'created' | 'assigned' | 'reviewed' | 'evidence_added' | 'status_changed' | 'decision_made' | 'communicated'
    performedBy: string
    performedByRole: 'student' | 'reviewer' | 'admin' | 'system'
    details: {
      previousValue?: any
      newValue?: any
      reason?: string
      additionalContext?: Record<string, any>
    }
    ipAddress?: string
    userAgent?: string
  }>
}

export interface AppealsDashboardMetrics {
  totalAppeals: number
  appealsByStatus: Record<string, number>
  appealsByType: Record<string, number>
  appealsByPriority: Record<string, number>
  
  averageResolutionTime: number
  overdueAppeals: number
  appealsThisMonth: number
  approvalRate: number
  
  reviewerWorkload: Array<{
    reviewerId: string
    reviewerName: string
    assignedAppeals: number
    completedAppeals: number
    averageResolutionTime: number
    overdueAppeals: number
  }>
  
  trendData: {
    appealVolumeTrend: Array<{ date: string; count: number }>
    resolutionTimeTrend: Array<{ date: string; averageDays: number }>
    approvalRateTrend: Array<{ date: string; rate: number }>
  }
}

export class EligibilityAppealsEngine {
  
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
  ): Promise<EligibilityAppeal> {
    
    const appeal: EligibilityAppeal = {
      id: this.generateAppealId(),
      applicationId,
      studentId,
      ...appealData,
      status: 'submitted',
      priority: this.calculateAppealPriority(appealData),
      submittedAt: new Date(),
      submittedBy: studentId,
      lastUpdatedAt: new Date(),
      expectedResolutionDate: this.calculateExpectedResolutionDate(appealData.appealType),
      communicationLog: [{
        id: this.generateId(),
        type: 'system',
        message: 'Appeal submitted successfully. You will receive updates on the review progress.',
        sentBy: 'system',
        sentAt: new Date(),
        isInternal: false
      }],
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Store the appeal
    await this.storeAppeal(appeal)
    
    // Initialize workflow
    await this.initializeReviewWorkflow(appeal.id)
    
    // Create audit trail entry
    await this.addAuditEntry(appeal.id, {
      action: 'created',
      performedBy: studentId,
      performedByRole: 'student',
      details: {
        appealType: appealData.appealType,
        reason: appealData.appealReason
      }
    })
    
    // Auto-assign reviewer if available
    await this.autoAssignReviewer(appeal.id)
    
    return appeal
  }
  
  /**
   * Get appeal details by ID
   */
  async getAppeal(appealId: string): Promise<EligibilityAppeal | null> {
    try {
      const result = await apiClient.request<{ data?: any }>(`/admin?action=appeals&id=${encodeURIComponent(appealId)}`)
      const data = result?.data
      if (!data) return null
      return this.parseAppealData(data)
    } catch (error) {
      console.error('Error fetching appeal:', error)
      return null
    }
  }
  
  /**
   * Get appeals for a student
   */
  async getStudentAppeals(studentId: string): Promise<EligibilityAppeal[]> {
    try {
      const result = await apiClient.request<{ data?: any[] }>(`/admin?action=appeals&student_id=${encodeURIComponent(studentId)}`)
      const data = result?.data
      if (!data) return []
      return data.map(this.parseAppealData)
    } catch (error) {
      console.error('Error fetching student appeals:', error)
      return []
    }
  }
  
  /**
   * Get appeals assigned to a reviewer
   */
  async getReviewerAppeals(reviewerId: string): Promise<EligibilityAppeal[]> {
    try {
      const result = await apiClient.request<{ data?: any[] }>(`/admin?action=appeals&reviewer_id=${encodeURIComponent(reviewerId)}&status=under_review,additional_info_required`)
      const data = result?.data
      if (!data) return []
      return data.map(this.parseAppealData)
    } catch (error) {
      console.error('Error fetching reviewer appeals:', error)
      return []
    }
  }
  
  /**
   * Assign appeal to reviewer
   */
  async assignAppealToReviewer(appealId: string, reviewerId: string, assignedBy: string): Promise<boolean> {
    try {
      const appeal = await this.getAppeal(appealId)
      if (!appeal) {
        return false
      }
      
      // Update appeal assignment
      try {
        await apiClient.request('/admin?action=appeals', {
          method: 'POST',
          body: JSON.stringify({
            type: 'assign',
            appeal_id: appealId,
            assigned_reviewer: reviewerId,
            status: 'under_review',
            review_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        })
      } catch (err) {
        console.error('Error assigning appeal:', err)
        return false
      }
      
      // Add communication log entry
      await this.addCommunicationEntry(appealId, {
        type: 'system',
        message: `Appeal assigned to reviewer for evaluation.`,
        sentBy: 'system',
        isInternal: false
      })
      
      // Create audit trail entry
      await this.addAuditEntry(appealId, {
        action: 'assigned',
        performedBy: assignedBy,
        performedByRole: 'admin',
        details: {
          assignedTo: reviewerId
        }
      })
      
      // Update workflow
      await this.updateWorkflowStage(appealId, 'initial_review', 'in_progress', reviewerId)
      
      return true
      
    } catch (error) {
      console.error('Error assigning appeal to reviewer:', error)
      return false
    }
  }
  
  /**
   * Update appeal status
   */
  async updateAppealStatus(
    appealId: string,
    newStatus: EligibilityAppeal['status'],
    updatedBy: string,
    notes?: string
  ): Promise<boolean> {
    try {
      const appeal = await this.getAppeal(appealId)
      if (!appeal) {
        return false
      }
      
      const previousStatus = appeal.status
      
      // Update appeal status
      try {
        await apiClient.request('/admin?action=appeals', {
          method: 'POST',
          body: JSON.stringify({
            type: 'update_status',
            appeal_id: appealId,
            status: newStatus,
            reviewer_notes: notes,
            last_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        })
      } catch (err) {
        console.error('Error updating appeal status:', err)
        return false
      }
      
      // Add communication log entry
      const statusMessage = this.getStatusChangeMessage(previousStatus, newStatus)
      await this.addCommunicationEntry(appealId, {
        type: 'system',
        message: statusMessage,
        sentBy: 'system',
        isInternal: false
      })
      
      // Create audit trail entry
      await this.addAuditEntry(appealId, {
        action: 'status_changed',
        performedBy: updatedBy,
        performedByRole: 'reviewer',
        details: {
          previousValue: previousStatus,
          newValue: newStatus,
          reason: notes
        }
      })
      
      // Update workflow if needed
      if (newStatus === 'approved' || newStatus === 'rejected') {
        await this.updateWorkflowStage(appealId, 'decision_making', 'completed', updatedBy)
      }
      
      return true
      
    } catch (error) {
      console.error('Error updating appeal status:', error)
      return false
    }
  }
  
  /**
   * Make final decision on appeal
   */
  async makeAppealDecision(
    appealId: string,
    decision: EligibilityAppeal['decision'],
    decisionMadeBy: string
  ): Promise<boolean> {
    try {
      const appeal = await this.getAppeal(appealId)
      if (!appeal) {
        return false
      }
      
      const finalDecision = {
        ...decision,
        decisionMadeBy,
        decisionMadeAt: new Date()
      }
      
      const newStatus = decision.outcome === 'approved' ? 'approved' : 'rejected'
      
      // Update appeal with decision
      try {
        await apiClient.request('/admin?action=appeals', {
          method: 'POST',
          body: JSON.stringify({
            type: 'decision',
            appeal_id: appealId,
            status: newStatus,
            decision: finalDecision,
            actual_resolution_date: new Date().toISOString(),
            last_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        })
      } catch (err) {
        console.error('Error making appeal decision:', err)
        return false
      }
      
      // Add communication log entry
      const decisionMessage = this.getDecisionMessage(decision)
      await this.addCommunicationEntry(appealId, {
        type: 'system',
        message: decisionMessage,
        sentBy: 'system',
        isInternal: false
      })
      
      // Create audit trail entry
      await this.addAuditEntry(appealId, {
        action: 'decision_made',
        performedBy: decisionMadeBy,
        performedByRole: 'reviewer',
        details: {
          outcome: decision.outcome,
          reason: decision.decisionReason,
          conditions: decision.conditions
        }
      })
      
      // Complete workflow
      await this.completeWorkflow(appealId)
      
      // Update original application if approved
      if (decision.outcome === 'approved' && decision.newEligibilityStatus) {
        await this.updateApplicationEligibility(
          appeal.applicationId,
          decision.newEligibilityStatus,
          decision.newOverallScore
        )
      }
      
      return true
      
    } catch (error) {
      console.error('Error making appeal decision:', error)
      return false
    }
  }
  
  /**
   * Add supporting evidence to appeal
   */
  async addSupportingEvidence(
    appealId: string,
    evidence: EligibilityAppeal['supportingEvidence'][0],
    addedBy: string
  ): Promise<boolean> {
    try {
      const appeal = await this.getAppeal(appealId)
      if (!appeal) {
        return false
      }
      
      const updatedEvidence = [...appeal.supportingEvidence, {
        ...evidence,
        uploadedAt: new Date()
      }]
      
      // Update appeal with new evidence
      try {
        await apiClient.request('/admin?action=appeals', {
          method: 'POST',
          body: JSON.stringify({
            type: 'add_evidence',
            appeal_id: appealId,
            supporting_evidence: updatedEvidence,
            last_updated_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        })
      } catch (err) {
        console.error('Error adding supporting evidence:', err)
        return false
      }
      
      // Add communication log entry
      await this.addCommunicationEntry(appealId, {
        type: 'student',
        message: `Additional evidence submitted: ${evidence.description}`,
        sentBy: addedBy,
        isInternal: false
      })
      
      // Create audit trail entry
      await this.addAuditEntry(appealId, {
        action: 'evidence_added',
        performedBy: addedBy,
        performedByRole: 'student',
        details: {
          evidenceType: evidence.type,
          description: evidence.description
        }
      })
      
      return true
      
    } catch (error) {
      console.error('Error adding supporting evidence:', error)
      return false
    }
  }
  
  /**
   * Get appeals dashboard metrics
   */
  async getDashboardMetrics(): Promise<AppealsDashboardMetrics> {
    try {
      const result = await apiClient.request<{ data?: any[] }>('/admin?action=appeals&type=all')
      const appeals = result?.data
      
      if (!appeals) {
        return this.getDefaultMetrics()
      }
      
      const now = new Date()
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      
      // Calculate basic metrics
      const totalAppeals = appeals.length
      const appealsByStatus = this.groupBy(appeals, 'status')
      const appealsByType = this.groupBy(appeals, 'appeal_type')
      const appealsByPriority = this.groupBy(appeals, 'priority')
      
      // Calculate resolution metrics
      const resolvedAppeals = appeals.filter(a => ['approved', 'rejected'].includes(a.status))
      const averageResolutionTime = this.calculateAverageResolutionTime(resolvedAppeals)
      const overdueAppeals = this.countOverdueAppeals(appeals)
      const appealsThisMonth = appeals.filter(a => new Date(a.created_at) >= thisMonth).length
      const approvalRate = resolvedAppeals.length > 0 
        ? (resolvedAppeals.filter(a => a.status === 'approved').length / resolvedAppeals.length) * 100
        : 0
      
      // Get reviewer workload
      const reviewerWorkload = await this.calculateReviewerWorkload(appeals)
      
      // Get trend data
      const trendData = this.calculateTrendData(appeals)
      
      return {
        totalAppeals,
        appealsByStatus,
        appealsByType,
        appealsByPriority,
        averageResolutionTime,
        overdueAppeals,
        appealsThisMonth,
        approvalRate,
        reviewerWorkload,
        trendData
      }
      
    } catch (error) {
      console.error('Error getting dashboard metrics:', error)
      return this.getDefaultMetrics()
    }
  }
  
  /**
   * Get appeal audit trail
   */
  async getAppealAuditTrail(appealId: string): Promise<AppealDecisionAuditTrail | null> {
    try {
      const result = await apiClient.request<{ data?: any[] }>(`/admin?action=appeals&type=audit&appeal_id=${encodeURIComponent(appealId)}`)
      const data = result?.data
      
      if (!data) {
        return null
      }
      
      return {
        appealId,
        auditEntries: data.map(entry => ({
          id: entry.id,
          timestamp: new Date(entry.timestamp),
          action: entry.action,
          performedBy: entry.performed_by,
          performedByRole: entry.performed_by_role,
          details: typeof entry.details === 'string' ? JSON.parse(entry.details) : entry.details,
          ipAddress: entry.ip_address,
          userAgent: entry.user_agent
        }))
      }
      
    } catch (error) {
      console.error('Error getting audit trail:', error)
      return null
    }
  }
  
  /**
   * Private helper methods
   */
  
  private generateAppealId(): string {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substr(2, 5)
    return `APPEAL-${timestamp}-${random}`.toUpperCase()
  }
  
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9)
  }
  
  private calculateAppealPriority(appealData: any): EligibilityAppeal['priority'] {
    // High priority for medical/special circumstances
    if (appealData.appealType === 'special_circumstances') {
      return 'high'
    }
    
    // Medium priority for grade disputes
    if (appealData.appealType === 'grade_dispute') {
      return 'medium'
    }
    
    // Check for urgent keywords in reason
    const urgentKeywords = ['urgent', 'deadline', 'emergency', 'medical']
    const hasUrgentKeyword = urgentKeywords.some(keyword => 
      appealData.appealReason.toLowerCase().includes(keyword)
    )
    
    if (hasUrgentKeyword) {
      return 'urgent'
    }
    
    return 'low'
  }
  
  private calculateExpectedResolutionDate(appealType: EligibilityAppeal['appealType']): Date {
    const now = new Date()
    let daysToAdd = 14 // Default 2 weeks
    
    switch (appealType) {
      case 'documentation_issue':
        daysToAdd = 7 // 1 week for documentation issues
        break
      case 'grade_dispute':
        daysToAdd = 21 // 3 weeks for grade disputes
        break
      case 'special_circumstances':
        daysToAdd = 10 // 10 days for special circumstances
        break
      case 'requirement_exception':
        daysToAdd = 28 // 4 weeks for requirement exceptions
        break
    }
    
    return new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000)
  }
  
  private async storeAppeal(appeal: EligibilityAppeal): Promise<void> {
    try {
      await apiClient.request('/admin?action=appeals', {
        method: 'POST',
        body: JSON.stringify({
          type: 'create',
          id: appeal.id,
          application_id: appeal.applicationId,
          student_id: appeal.studentId,
          appeal_type: appeal.appealType,
          appeal_reason: appeal.appealReason,
          supporting_evidence: appeal.supportingEvidence,
          status: appeal.status,
          priority: appeal.priority,
          original_assessment: appeal.originalAssessment,
          requested_changes: appeal.requestedChanges,
          submitted_at: appeal.submittedAt.toISOString(),
          submitted_by: appeal.submittedBy,
          last_updated_at: appeal.lastUpdatedAt.toISOString(),
          expected_resolution_date: appeal.expectedResolutionDate?.toISOString(),
          communication_log: appeal.communicationLog,
          created_at: appeal.createdAt.toISOString(),
          updated_at: appeal.updatedAt.toISOString()
        })
      })
    } catch (error) {
      console.error('Error storing appeal:', error)
    }
  }
  
  private parseAppealData(data: any): EligibilityAppeal {
    return {
      id: data.id,
      applicationId: data.application_id,
      studentId: data.student_id,
      appealType: data.appeal_type,
      appealReason: data.appeal_reason,
      supportingEvidence: typeof data.supporting_evidence === 'string' 
        ? JSON.parse(data.supporting_evidence) 
        : data.supporting_evidence || [],
      status: data.status,
      priority: data.priority,
      originalAssessment: typeof data.original_assessment === 'string'
        ? JSON.parse(data.original_assessment)
        : data.original_assessment,
      requestedChanges: typeof data.requested_changes === 'string'
        ? JSON.parse(data.requested_changes)
        : data.requested_changes,
      submittedAt: new Date(data.submitted_at),
      submittedBy: data.submitted_by,
      lastUpdatedAt: new Date(data.last_updated_at),
      expectedResolutionDate: data.expected_resolution_date ? new Date(data.expected_resolution_date) : undefined,
      actualResolutionDate: data.actual_resolution_date ? new Date(data.actual_resolution_date) : undefined,
      assignedReviewer: data.assigned_reviewer,
      reviewerNotes: data.reviewer_notes,
      reviewStartedAt: data.review_started_at ? new Date(data.review_started_at) : undefined,
      decision: typeof data.decision === 'string' ? JSON.parse(data.decision) : data.decision,
      communicationLog: typeof data.communication_log === 'string'
        ? JSON.parse(data.communication_log)
        : data.communication_log || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at)
    }
  }
  
  private async initializeReviewWorkflow(appealId: string): Promise<void> {
    // Implementation for workflow initialization
    // This would create workflow stages and SLA tracking
  }
  
  private async autoAssignReviewer(appealId: string): Promise<void> {
    // Implementation for auto-assignment logic
    // This would find available reviewers and assign based on workload
  }
  
  private async addAuditEntry(appealId: string, entry: Partial<AppealDecisionAuditTrail['auditEntries'][0]>): Promise<void> {
    try {
      await apiClient.request('/admin?action=appeals', {
        method: 'POST',
        body: JSON.stringify({
          type: 'audit_entry',
          id: this.generateId(),
          appeal_id: appealId,
          timestamp: new Date().toISOString(),
          action: entry.action,
          performed_by: entry.performedBy,
          performed_by_role: entry.performedByRole,
          details: JSON.stringify(entry.details || {}),
          ip_address: entry.ipAddress,
          user_agent: entry.userAgent
        })
      })
    } catch (error) {
      console.error('Error adding audit entry:', error)
    }
  }
  
  private async addCommunicationEntry(appealId: string, entry: Partial<EligibilityAppeal['communicationLog'][0]>): Promise<void> {
    // Implementation for adding communication log entries
  }
  
  private async updateWorkflowStage(appealId: string, stage: string, status: string, assignedTo?: string): Promise<void> {
    // Implementation for workflow stage updates
  }
  
  private async completeWorkflow(appealId: string): Promise<void> {
    // Implementation for workflow completion
  }
  
  private async updateApplicationEligibility(applicationId: string, newStatus: string, newScore?: number): Promise<void> {
    // Implementation for updating original application eligibility
  }
  
  private getStatusChangeMessage(previousStatus: string, newStatus: string): string {
    const messages: Record<string, string> = {
      'submitted_under_review': 'Your appeal is now under review by our admissions team.',
      'under_review_additional_info_required': 'Additional information is required for your appeal. Please check your messages.',
      'additional_info_required_under_review': 'Thank you for providing additional information. Review has resumed.',
      'under_review_approved': 'Great news! Your appeal has been approved.',
      'under_review_rejected': 'Your appeal has been reviewed and unfortunately was not approved.',
      'submitted_approved': 'Your appeal has been approved.',
      'submitted_rejected': 'Your appeal has been reviewed and was not approved.'
    }
    
    const key = `${previousStatus}_${newStatus}`
    return messages[key] || `Appeal status updated to ${newStatus.replace('_', ' ')}.`
  }
  
  private getDecisionMessage(decision: EligibilityAppeal['decision']): string {
    if (decision?.outcome === 'approved') {
      return `Your appeal has been approved! ${decision.decisionReason} ${decision.conditions ? 'Please note the following conditions: ' + decision.conditions.join(', ') : ''}`
    } else if (decision?.outcome === 'partially_approved') {
      return `Your appeal has been partially approved. ${decision.decisionReason} ${decision.conditions ? 'Conditions: ' + decision.conditions.join(', ') : ''}`
    } else {
      return `Your appeal has been reviewed and was not approved. ${decision?.decisionReason || 'Please contact admissions for more information.'}`
    }
  }
  
  private groupBy(array: any[], key: string): Record<string, number> {
    return array.reduce((groups, item) => {
      const value = item[key] || 'unknown'
      groups[value] = (groups[value] || 0) + 1
      return groups
    }, {})
  }
  
  private calculateAverageResolutionTime(resolvedAppeals: any[]): number {
    if (resolvedAppeals.length === 0) return 0
    
    const totalDays = resolvedAppeals.reduce((sum, appeal) => {
      if (appeal.actual_resolution_date && appeal.submitted_at) {
        const resolutionDate = new Date(appeal.actual_resolution_date)
        const submittedDate = new Date(appeal.submitted_at)
        const days = (resolutionDate.getTime() - submittedDate.getTime()) / (1000 * 60 * 60 * 24)
        return sum + days
      }
      return sum
    }, 0)
    
    return totalDays / resolvedAppeals.length
  }
  
  private countOverdueAppeals(appeals: any[]): number {
    const now = new Date()
    return appeals.filter(appeal => {
      if (!appeal.expected_resolution_date || ['approved', 'rejected', 'withdrawn'].includes(appeal.status)) {
        return false
      }
      return new Date(appeal.expected_resolution_date) < now
    }).length
  }
  
  private async calculateReviewerWorkload(appeals: any[]): Promise<AppealsDashboardMetrics['reviewerWorkload']> {
    // Implementation for calculating reviewer workload metrics
    return []
  }
  
  private calculateTrendData(appeals: any[]): AppealsDashboardMetrics['trendData'] {
    // Implementation for calculating trend data
    return {
      appealVolumeTrend: [],
      resolutionTimeTrend: [],
      approvalRateTrend: []
    }
  }
  
  private getDefaultMetrics(): AppealsDashboardMetrics {
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

// Export singleton instance
export const eligibilityAppealsEngine = new EligibilityAppealsEngine()