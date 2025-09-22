import { supabase } from './supabase'
import { multiChannelNotifications } from './multiChannelNotifications'
import { predictiveAnalytics } from './predictiveAnalytics'
import { sessionManager } from './session'
import { sanitizeForLog } from './security'
import { SecureCodeExecution } from './securityPatches'

export interface WorkflowRule {
  id: string
  name: string
  trigger: 'document_upload' | 'status_change' | 'time_based' | 'score_threshold'
  conditions: Record<string, any>
  actions: WorkflowAction[]
  enabled: boolean
  priority: number
}

export interface WorkflowAction {
  type: 'auto_approve' | 'send_notification' | 'assign_reviewer' | 'request_documents' | 'escalate' | 'auto_verify'
  parameters: Record<string, any>
}

export interface WorkflowExecutionResult {
  success: boolean
  actionsExecuted: number
  errors: string[]
  executionTime: number
}

export class WorkflowAutomationEngine {
  private static instance: WorkflowAutomationEngine
  private executionQueue: Map<string, Promise<WorkflowExecutionResult>> = new Map()
  
  static getInstance(): WorkflowAutomationEngine {
    if (!WorkflowAutomationEngine.instance) {
      WorkflowAutomationEngine.instance = new WorkflowAutomationEngine()
    }
    return WorkflowAutomationEngine.instance
  }

  private rules: WorkflowRule[] = [
    {
      id: 'auto_approve_high_score',
      name: 'Auto-approve high-scoring applications',
      trigger: 'score_threshold',
      conditions: { 
        admissionProbability: { operator: '>=', value: 0.92 },
        documentsComplete: true,
        paymentVerified: true,
        coreSubjectsPresent: true
      },
      actions: [
        {
          type: 'auto_approve',
          parameters: { reason: 'Automated approval - exceptional application (>92% probability)' }
        },
        {
          type: 'send_notification',
          parameters: { 
            type: 'application_approved',
            channels: ['email', 'in_app']
          }
        }
      ],
      enabled: true,
      priority: 1
    },
    {
      id: 'document_verification',
      name: 'Auto-verify high-quality documents',
      trigger: 'document_upload',
      conditions: {
        documentQuality: { operator: '==', value: 'excellent' },
        ocrConfidence: { operator: '>=', value: 0.9 }
      },
      actions: [
        {
          type: 'auto_verify',
          parameters: { 
            documentType: 'auto_verified',
            confidence: 'high'
          }
        },
        {
          type: 'send_notification',
          parameters: {
            type: 'document_verified',
            channels: ['in_app']
          }
        }
      ],
      enabled: true,
      priority: 2
    },
    {
      id: 'missing_documents_reminder',
      name: 'Proactive document reminders',
      trigger: 'time_based',
      conditions: {
        daysSinceSubmission: { operator: '>=', value: 1 },
        documentsComplete: false,
        status: 'submitted'
      },
      actions: [
        {
          type: 'send_notification',
          parameters: {
            type: 'document_missing',
            channels: ['email', 'in_app']
          }
        }
      ],
      enabled: true,
      priority: 3
    },
    {
      id: 'escalate_delayed_applications',
      name: 'Escalate overdue applications',
      trigger: 'time_based',
      conditions: {
        daysSinceSubmission: { operator: '>=', value: 5 },
        status: { operator: 'in', value: ['submitted', 'under_review'] }
      },
      actions: [
        {
          type: 'escalate',
          parameters: {
            priority: 'high',
            assignTo: 'senior_admin',
            reason: 'Application overdue for processing'
          }
        },
        {
          type: 'send_notification',
          parameters: {
            type: 'processing_delay',
            channels: ['email', 'in_app']
          }
        }
      ],
      enabled: true,
      priority: 4
    },
    {
      id: 'incomplete_application_followup',
      name: 'Follow up on incomplete applications',
      trigger: 'time_based',
      conditions: {
        daysSinceSubmission: { operator: '>=', value: 3 },
        gradeCount: { operator: '<', value: 5 },
        status: 'draft'
      },
      actions: [
        {
          type: 'send_notification',
          parameters: {
            type: 'incomplete_application',
            channels: ['email', 'in_app']
          }
        }
      ],
      enabled: true,
      priority: 5
    }
  ]

  async processApplication(applicationId: string, trigger: string, context: any = {}): Promise<WorkflowExecutionResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let actionsExecuted = 0

    try {
      // Prevent duplicate processing
      const queueKey = `${applicationId}:${trigger}`
      if (this.executionQueue.has(queueKey)) {
        await this.executionQueue.get(queueKey)
        return {
          success: false,
          actionsExecuted: 0,
          errors: ['Already processing'],
          executionTime: Date.now() - startTime
        }
      }

      const processingPromise = this.executeWorkflow(applicationId, trigger, context)
      this.executionQueue.set(queueKey, processingPromise)

      try {
        const result = await processingPromise
        return result
      } finally {
        this.executionQueue.delete(queueKey)
      }
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Workflow processing failed:', { error: sanitizedError })
      errors.push(sanitizedError)
      await this.logWorkflowExecution('error', applicationId, 'failed', sanitizedError)
      
      return {
        success: false,
        actionsExecuted,
        errors,
        executionTime: Date.now() - startTime
      }
    }
  }

  private async executeWorkflow(applicationId: string, trigger: string, context: any): Promise<WorkflowExecutionResult> {
    const startTime = Date.now()
    const errors: string[] = []
    let actionsExecuted = 0

    // Validate session for authenticated operations
    const isValid = await sessionManager.isSessionValid()
    if (!isValid && trigger !== 'time_based') {
      throw new Error('Session expired')
    }

    const application = await this.getApplicationData(applicationId)
    if (!application) {
      throw new Error('Application not found')
    }

    const applicableRules = this.rules
      .filter(rule => rule.enabled && rule.trigger === trigger)
      .sort((a, b) => (a.priority || 0) - (b.priority || 0))

    for (const rule of applicableRules) {
      try {
        if (await this.evaluateConditions(rule.conditions, application, context)) {
          await this.executeActions(rule.actions, application, context)
          await this.logWorkflowExecution(rule.id, applicationId, 'executed')
          actionsExecuted += rule.actions.length
        }
      } catch (error) {
        const errorMsg = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
        errors.push(`Rule ${sanitizeForLog(rule.id)}: ${errorMsg}`)
        await this.logWorkflowExecution(rule.id, applicationId, 'failed', errorMsg)
      }
    }

    return {
      success: errors.length === 0,
      actionsExecuted,
      errors,
      executionTime: Date.now() - startTime
    }
  }

  async runScheduledWorkflows(): Promise<{ processed: number; errors: number }> {
    let processed = 0
    let errors = 0

    try {
      const { data: applications } = await supabase
        .from('applications_new')
        .select('*')
        .in('status', ['submitted', 'under_review', 'draft'])
        .order('created_at', { ascending: true })
        .limit(100) // Process in batches

      const processingPromises = (applications || []).map(async (application) => {
        try {
          const context = {
            daysSinceSubmission: this.calculateDaysSince(application.created_at),
            gradeCount: application.grades?.length || 0,
            status: application.status
          }
          
          const result = await this.processApplication(application.id, 'time_based', context)
          if (result.success) {
            processed++
          } else {
            errors++
          }
        } catch (error) {
          const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
          console.error('Failed to process application:', { applicationId: sanitizeForLog(application.id), error: sanitizedError })
          errors++
        }
      })

      // Process with concurrency limit
      const batchSize = 5
      for (let i = 0; i < processingPromises.length; i += batchSize) {
        const batch = processingPromises.slice(i, i + batchSize)
        await Promise.allSettled(batch)
        
        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < processingPromises.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      return { processed, errors }
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Scheduled workflow execution failed:', { error: sanitizedError })
      return { processed, errors: errors + 1 }
    }
  }

  private async getApplicationData(applicationId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('applications_new')
        .select(`
          *,
          application_grades(*)
        `)
        .eq('id', applicationId)
        .single()

      if (error) {
        const sanitizedError = sanitizeForLog(error.message || 'Unknown error')
        console.error('Error fetching application data:', sanitizedError)
        return null
      }

      // Transform grades data for easier processing
      if (data && data.application_grades) {
        data.grades = data.application_grades
        delete data.application_grades
      }

      return data
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error getting application data:', sanitizedError)
      return null
    }
  }

  private async evaluateConditions(
    conditions: Record<string, any>, 
    application: any, 
    context: any
  ): Promise<boolean> {
    for (const [key, condition] of Object.entries(conditions)) {
      let value: any

      switch (key) {
        case 'admissionProbability':
          try {
            const prediction = await predictiveAnalytics.predictAdmissionSuccess(application)
            value = prediction.admissionProbability
          } catch (error) {
            const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
            console.error('Failed to get admission probability:', sanitizedError)
            return false
          }
          break
        case 'documentsComplete':
          value = !!(application.result_slip_url && application.pop_url)
          break
        case 'paymentVerified':
          value = application.payment_status === 'verified' || !!application.pop_url
          break
        case 'coreSubjectsPresent':
          value = this.checkCoreSubjects(application)
          break
        case 'documentQuality':
          value = context.documentQuality || 'unknown'
          break
        case 'ocrConfidence':
          value = context.ocrConfidence || 0
          break
        case 'daysSinceSubmission':
          value = context.daysSinceSubmission || this.calculateDaysSince(application.created_at)
          break
        case 'gradeCount':
          value = application.grades?.length || 0
          break
        case 'status':
          value = application.status
          break
        default:
          value = application[key] || context[key]
      }

      if (!this.evaluateCondition(value, condition)) {
        return false
      }
    }

    return true
  }

  private checkCoreSubjects(application: any): boolean {
    const program = application.program
    const grades = application.grades || []
    
    const coreSubjectsMap: Record<string, string[]> = {
      'Clinical Medicine': ['mathematics', 'biology', 'chemistry'],
      'Environmental Health': ['mathematics', 'biology', 'chemistry'],
      'Registered Nursing': ['mathematics', 'biology', 'english']
    }
    
    const requiredSubjects = coreSubjectsMap[program] || []
    if (requiredSubjects.length === 0) return true
    
    return requiredSubjects.every(required => 
      grades.some((grade: any) => 
        grade.subject.toLowerCase().includes(required)
      )
    )
  }

  private evaluateCondition(value: any, condition: any): boolean {
    if (typeof condition === 'object' && condition.operator) {
      const sanitizedValue = this.sanitizeConditionValue(value)
      const sanitizedConditionValue = this.sanitizeConditionValue(condition.value)
      
      // Safe condition evaluation without code execution
      try {
        const allowedOperators = ['>=', '<=', '>', '<', '==', '!=', 'in'];
        if (!allowedOperators.includes(condition.operator)) {
          console.warn('Invalid operator rejected:', { operator: sanitizeForLog(condition.operator) })
          return false
        }
        
        switch (condition.operator) {
          case '>=':
            return Number(sanitizedValue) >= Number(sanitizedConditionValue)
          case '<=':
            return Number(sanitizedValue) <= Number(sanitizedConditionValue)
          case '>':
            return Number(sanitizedValue) > Number(sanitizedConditionValue)
          case '<':
            return Number(sanitizedValue) < Number(sanitizedConditionValue)
          case '==':
            return sanitizedValue === sanitizedConditionValue
          case '!=':
            return sanitizedValue !== sanitizedConditionValue
          case 'in':
            return Array.isArray(sanitizedConditionValue) && sanitizedConditionValue.includes(sanitizedValue)
          default:
            return false
        }
      } catch (error) {
        console.warn('Invalid condition evaluation:', { error: sanitizeForLog(error instanceof Error ? error.message : 'Unknown error') })
        return false
      }
    }

    return this.sanitizeConditionValue(value) === this.sanitizeConditionValue(condition)
  }

  private sanitizeConditionValue(value: any): any {
    if (value === null || value === undefined) {
      return value
    }
    
    if (typeof value === 'string') {
      // Remove potentially dangerous characters and limit length
      return value.replace(/[<>"'`\\]/g, '').substring(0, 1000)
    }
    
    if (typeof value === 'number') {
      // Ensure it's a safe number
      return isFinite(value) ? value : 0
    }
    
    if (typeof value === 'boolean') {
      return value
    }
    
    if (Array.isArray(value)) {
      // Recursively sanitize array elements
      return value.map(item => this.sanitizeConditionValue(item)).slice(0, 100)
    }
    
    if (typeof value === 'object') {
      // Only allow plain objects with safe properties
      const sanitized: Record<string, any> = {}
      const allowedKeys = ['operator', 'value', 'status', 'type', 'priority']
      
      for (const key of allowedKeys) {
        if (key in value) {
          sanitized[key] = this.sanitizeConditionValue(value[key])
        }
      }
      
      return sanitized
    }
    
    // For any other type, convert to string and sanitize
    return String(value).replace(/[<>"'`\\]/g, '').substring(0, 100)
  }

  private async executeActions(
    actions: WorkflowAction[], 
    application: any, 
    context: any
  ): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(action, application, context)
      } catch (error) {
        const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
        console.error('Action execution failed:', { actionType: sanitizeForLog(action.type), error: sanitizedError })
      }
    }
  }

  private async executeAction(
    action: WorkflowAction, 
    application: any, 
    context: any
  ): Promise<void> {
    switch (action.type) {
      case 'auto_approve':
        await this.autoApproveApplication(application.id, action.parameters)
        break
      
      case 'auto_verify':
        await this.autoVerifyDocument(application.id, action.parameters)
        break
      
      case 'send_notification':
        await multiChannelNotifications.sendNotification(
          application.user_id,
          action.parameters.type,
          {
            full_name: application.full_name,
            program: application.program,
            tracking_code: application.public_tracking_code,
            institution: this.getInstitution(application.program),
            institution_domain: this.getInstitutionDomain(application.program),
            missing_documents: this.getMissingDocuments(application).join(', '),
            deadline: '7 days',
            ...action.parameters
          },
          action.parameters.channels
        )
        break
      
      case 'assign_reviewer':
        await this.assignReviewer(application.id, action.parameters.reviewerId)
        break
      
      case 'request_documents':
        await this.requestMissingDocuments(application, action.parameters)
        break
      
      case 'escalate':
        await this.escalateApplication(application.id, action.parameters)
        break
    }
  }

  private getInstitution(program: string): string {
    return ['Clinical Medicine', 'Environmental Health'].includes(program) ? 'Kalulushi Training Centre' : 'Mukuba Institute of Health and Allied Sciences'
  }

  private getInstitutionDomain(program: string): string {
    return ['Clinical Medicine', 'Environmental Health'].includes(program) ? 'katc' : 'mihas'
  }

  private getMissingDocuments(application: any): string[] {
    const missing: string[] = []
    if (!application.result_slip_url) missing.push('Result Slip')
    if (!application.pop_url) missing.push('Proof of Payment')
    if (!application.extra_kyc_url) missing.push('Additional KYC Documents')
    return missing
  }

  private async autoVerifyDocument(applicationId: string, parameters: any): Promise<void> {
    try {
      const { error } = await supabase
        .from('document_analysis')
        .update({
          quality: 'verified',
          verified_at: new Date().toISOString(),
          verification_method: 'automated',
          confidence: parameters.confidence || 'high'
        })
        .eq('application_id', applicationId)
        .eq('document_type', parameters.documentType)

      if (error) {
        throw new Error(`Document verification failed: ${error.message}`)
      }
    } catch (error) {
      throw new Error(`Auto-verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async autoApproveApplication(applicationId: string, parameters: any): Promise<void> {
    const { error } = await supabase
      .from('applications_new')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        admin_notes: parameters.reason || 'Automatically approved by system'
      })
      .eq('id', applicationId)

    if (error) {
      throw new Error(`Auto-approval failed: ${error.message}`)
    }
  }

  private async assignReviewer(applicationId: string, reviewerId: string): Promise<void> {
    const { error } = await supabase
      .from('application_assignments')
      .insert({
        application_id: applicationId,
        reviewer_id: reviewerId,
        assigned_at: new Date().toISOString()
      })

    if (error) {
      throw new Error(`Reviewer assignment failed: ${error.message}`)
    }
  }

  private async requestMissingDocuments(application: any, parameters: any): Promise<void> {
    const missingDocs = []
    if (!application.result_slip_url) missingDocs.push('Result Slip')
    if (!application.pop_url) missingDocs.push('Proof of Payment')
    if (!application.extra_kyc_url && parameters.requireKYC) missingDocs.push('KYC Documents')

    if (missingDocs.length > 0) {
      await multiChannelNotifications.sendNotification(
        application.user_id,
        'document_missing',
        {
          full_name: application.full_name,
          missing_documents: missingDocs.join(', '),
          deadline: parameters.deadline || '7 days'
        }
      )
    }
  }

  private async escalateApplication(applicationId: string, parameters: any): Promise<void> {
    const { error } = await supabase
      .from('application_escalations')
      .insert({
        application_id: applicationId,
        priority: parameters.priority,
        assigned_to: parameters.assignTo,
        reason: parameters.reason || 'Automated escalation',
        escalated_at: new Date().toISOString()
      })

    if (error) {
      throw new Error(`Escalation failed: ${error.message}`)
    }
  }

  private calculateDaysSince(dateString: string): number {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - date.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  private async logWorkflowExecution(
    ruleId: string, 
    applicationId: string, 
    status: string, 
    error?: string,
    executionTime?: number
  ): Promise<void> {
    try {
      const { error: logError } = await supabase
        .from('workflow_execution_logs')
        .insert({
          rule_id: ruleId,
          application_id: applicationId,
          status,
          error_message: error?.substring(0, 500), // Limit error message length
          execution_time_ms: executionTime,
          executed_at: new Date().toISOString()
        })

      if (logError) {
        console.error('Failed to log workflow execution:', logError)
      }
    } catch (error) {
      // Don't log errors in logging function to avoid recursion
    }
  }

  // Public methods for manual workflow management
  async enableRule(ruleId: string): Promise<boolean> {
    try {
      const rule = this.rules.find(r => r.id === ruleId)
      if (rule) {
        rule.enabled = true
        return true
      }
      return false
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error enabling rule:', { error: sanitizedError })
      return false
    }
  }

  async disableRule(ruleId: string): Promise<boolean> {
    try {
      const rule = this.rules.find(r => r.id === ruleId)
      if (rule) {
        rule.enabled = false
        return true
      }
      return false
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error disabling rule:', { error: sanitizedError })
      return false
    }
  }

  getRules(): WorkflowRule[] {
    return [...this.rules]
  }

  getEnabledRules(): WorkflowRule[] {
    return this.rules.filter(rule => rule.enabled)
  }

  async addCustomRule(rule: WorkflowRule): Promise<boolean> {
    try {
      // Validate rule structure
      if (!rule.id || !rule.name || !rule.trigger || !rule.actions) {
        throw new Error('Invalid rule structure')
      }
      
      // Check for duplicate IDs
      if (this.rules.some(r => r.id === rule.id)) {
        throw new Error('Rule ID already exists')
      }
      
      this.rules.push(rule)
      return true
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error adding custom rule:', { error: sanitizedError })
      return false
    }
  }

  async getWorkflowStats(): Promise<any> {
    try {
      const { data } = await supabase
        .from('workflow_execution_logs')
        .select('rule_id, status, executed_at')
        .gte('executed_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      
      const stats = {
        totalExecutions: data?.length || 0,
        successfulExecutions: data?.filter(log => log.status === 'executed').length || 0,
        failedExecutions: data?.filter(log => log.status === 'failed').length || 0,
        ruleStats: {} as Record<string, number>
      }
      
      data?.forEach(log => {
        stats.ruleStats[log.rule_id] = (stats.ruleStats[log.rule_id] || 0) + 1
      })
      
      return stats
    } catch (error) {
      const sanitizedError = sanitizeForLog(error instanceof Error ? error.message : 'Unknown error')
      console.error('Error getting workflow stats:', { error: sanitizedError })
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        ruleStats: {}
      }
    }
  }
}

export const workflowAutomation = WorkflowAutomationEngine.getInstance()