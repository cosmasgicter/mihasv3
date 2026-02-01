// @ts-nocheck
/**
 * Application Flow Analyzer - Maps user journeys and identifies workflow bottlenecks
 * Implements Requirements 3.1, 3.2, 3.4 from MIHAS System Analysis spec
 */

export interface JourneyStep {
  id: string
  name: string
  description: string
  type: 'user_action' | 'system_process' | 'admin_action' | 'decision_point'
  estimatedDuration: number // in minutes
  dependencies: string[]
  touchpoints: string[]
  isBottleneck?: boolean
  automationPotential?: 'high' | 'medium' | 'low' | 'none'
}

export interface UserJourney {
  id: string
  name: string
  description: string
  userType: 'student' | 'admin' | 'super_admin'
  steps: JourneyStep[]
  totalEstimatedTime: number
  criticalPath: string[]
  bottlenecks: string[]
}

export interface TouchPoint {
  id: string
  name: string
  type: 'ui_component' | 'api_endpoint' | 'database_table' | 'external_service'
  location: string
  interactions: string[]
}

export interface DecisionNode {
  id: string
  name: string
  condition: string
  outcomes: Array<{
    condition: string
    nextStep: string
    probability?: number
  }>
  automationPotential: 'high' | 'medium' | 'low' | 'none'
}

/**
 * User Journey Mapper - Maps complete workflows from start to finish
 * Validates: Requirements 3.1
 */
export class UserJourneyMapper {
  private journeys: Map<string, UserJourney> = new Map()
  private touchpoints: Map<string, TouchPoint> = new Map()
  private decisionNodes: Map<string, DecisionNode> = new Map()

  constructor() {
    this.initializeJourneys()
    this.initializeTouchpoints()
    this.initializeDecisionNodes()
  }

  /**
   * Get complete student application workflow from registration to decision
   */
  getStudentApplicationJourney(): UserJourney {
    return this.journeys.get('student_application') || this.createStudentApplicationJourney()
  }

  /**
   * Get admin review workflow from application receipt to final decision
   */
  getAdminReviewJourney(): UserJourney {
    return this.journeys.get('admin_review') || this.createAdminReviewJourney()
  }

  /**
   * Get all touchpoints in the system
   */
  getAllTouchpoints(): TouchPoint[] {
    return Array.from(this.touchpoints.values())
  }

  /**
   * Get all decision nodes in the workflow
   */
  getAllDecisionNodes(): DecisionNode[] {
    return Array.from(this.decisionNodes.values())
  }

  /**
   * Get touchpoints for a specific journey
   */
  getTouchpointsForJourney(journeyId: string): TouchPoint[] {
    const journey = this.journeys.get(journeyId)
    if (!journey) return []

    const touchpointIds = new Set<string>()
    journey.steps.forEach(step => {
      step.touchpoints.forEach(id => touchpointIds.add(id))
    })

    return Array.from(touchpointIds)
      .map(id => this.touchpoints.get(id))
      .filter(Boolean) as TouchPoint[]
  }

  /**
   * Get decision nodes for a specific journey
   */
  getDecisionNodesForJourney(journeyId: string): DecisionNode[] {
    const journey = this.journeys.get(journeyId)
    if (!journey) return []

    return journey.steps
      .filter(step => step.type === 'decision_point')
      .map(step => this.decisionNodes.get(step.id))
      .filter(Boolean) as DecisionNode[]
  }

  private initializeJourneys(): void {
    this.journeys.set('student_application', this.createStudentApplicationJourney())
    this.journeys.set('admin_review', this.createAdminReviewJourney())
  }

  private createStudentApplicationJourney(): UserJourney {
    const steps: JourneyStep[] = [
      {
        id: 'registration',
        name: 'User Registration',
        description: 'Student creates account and verifies email',
        type: 'user_action',
        estimatedDuration: 5,
        dependencies: [],
        touchpoints: ['auth_signup', 'email_verification', 'user_profiles_table'],
        automationPotential: 'low'
      },
      {
        id: 'profile_creation',
        name: 'Profile Creation',
        description: 'Student completes basic profile information',
        type: 'user_action',
        estimatedDuration: 10,
        dependencies: ['registration'],
        touchpoints: ['student_dashboard', 'profile_form', 'user_profiles_table'],
        automationPotential: 'medium'
      },
      {
        id: 'application_start',
        name: 'Start Application',
        description: 'Student initiates new application wizard',
        type: 'user_action',
        estimatedDuration: 2,
        dependencies: ['profile_creation'],
        touchpoints: ['application_wizard', 'applications_table'],
        automationPotential: 'low'
      },
      {
        id: 'basic_kyc',
        name: 'Basic KYC Information',
        description: 'Student provides personal details and selects program',
        type: 'user_action',
        estimatedDuration: 15,
        dependencies: ['application_start'],
        touchpoints: ['kyc_form', 'program_selector', 'applications_table'],
        automationPotential: 'medium'
      },
      {
        id: 'education_grades',
        name: 'Education & Grades Entry',
        description: 'Student enters Grade 12 subjects and grades',
        type: 'user_action',
        estimatedDuration: 20,
        dependencies: ['basic_kyc'],
        touchpoints: ['grades_form', 'subject_selector', 'application_grades_table'],
        automationPotential: 'high'
      },
      {
        id: 'document_upload',
        name: 'Document Upload',
        description: 'Student uploads required documents',
        type: 'user_action',
        estimatedDuration: 15,
        dependencies: ['education_grades'],
        touchpoints: ['file_upload', 'document_storage', 'application_documents_table'],
        automationPotential: 'medium'
      },
      {
        id: 'eligibility_check',
        name: 'Eligibility Validation',
        description: 'System validates eligibility against program requirements',
        type: 'system_process',
        estimatedDuration: 2,
        dependencies: ['education_grades'],
        touchpoints: ['eligibility_engine', 'regulatory_apis', 'eligibility_results_table'],
        automationPotential: 'none'
      },
      {
        id: 'payment_submission',
        name: 'Payment Information',
        description: 'Student submits payment details and proof',
        type: 'user_action',
        estimatedDuration: 10,
        dependencies: ['document_upload'],
        touchpoints: ['payment_form', 'file_upload', 'payment_records_table'],
        automationPotential: 'medium'
      },
      {
        id: 'application_review',
        name: 'Application Review',
        description: 'Student reviews complete application before submission',
        type: 'user_action',
        estimatedDuration: 10,
        dependencies: ['payment_submission', 'eligibility_check'],
        touchpoints: ['application_preview', 'applications_table'],
        automationPotential: 'low'
      },
      {
        id: 'application_submission',
        name: 'Final Submission',
        description: 'Student submits application for processing',
        type: 'user_action',
        estimatedDuration: 2,
        dependencies: ['application_review'],
        touchpoints: ['submission_api', 'applications_table', 'notification_system'],
        automationPotential: 'low'
      },
      {
        id: 'confirmation_notification',
        name: 'Submission Confirmation',
        description: 'System sends confirmation and tracking information',
        type: 'system_process',
        estimatedDuration: 1,
        dependencies: ['application_submission'],
        touchpoints: ['email_service', 'sms_service', 'notification_system'],
        automationPotential: 'none'
      }
    ]

    const totalTime = steps.reduce((sum, step) => sum + step.estimatedDuration, 0)
    const criticalPath = steps.map(step => step.id)
    const bottlenecks = steps
      .filter(step => step.estimatedDuration > 15 || step.dependencies.length > 1)
      .map(step => step.id)

    return {
      id: 'student_application',
      name: 'Student Application Journey',
      description: 'Complete workflow from registration to application submission',
      userType: 'student',
      steps,
      totalEstimatedTime: totalTime,
      criticalPath,
      bottlenecks
    }
  }

  private createAdminReviewJourney(): UserJourney {
    const steps: JourneyStep[] = [
      {
        id: 'application_receipt',
        name: 'Application Receipt',
        description: 'System receives and queues new application',
        type: 'system_process',
        estimatedDuration: 1,
        dependencies: [],
        touchpoints: ['applications_table', 'admin_dashboard', 'notification_system'],
        automationPotential: 'none'
      },
      {
        id: 'initial_screening',
        name: 'Initial Screening',
        description: 'Admin performs initial completeness check',
        type: 'admin_action',
        estimatedDuration: 10,
        dependencies: ['application_receipt'],
        touchpoints: ['admin_applications_page', 'application_detail_modal'],
        automationPotential: 'high'
      },
      {
        id: 'document_verification',
        name: 'Document Verification',
        description: 'Admin verifies uploaded documents for authenticity',
        type: 'admin_action',
        estimatedDuration: 15,
        dependencies: ['initial_screening'],
        touchpoints: ['document_viewer', 'verification_tools', 'application_documents_table'],
        automationPotential: 'medium'
      },
      {
        id: 'payment_verification',
        name: 'Payment Verification',
        description: 'Admin verifies payment proof and amount',
        type: 'admin_action',
        estimatedDuration: 5,
        dependencies: ['initial_screening'],
        touchpoints: ['payment_verification_panel', 'payment_records_table'],
        automationPotential: 'high'
      },
      {
        id: 'eligibility_assessment',
        name: 'Eligibility Assessment',
        description: 'Admin reviews automated eligibility results and makes adjustments',
        type: 'admin_action',
        estimatedDuration: 20,
        dependencies: ['document_verification'],
        touchpoints: ['eligibility_dashboard', 'grade_verification', 'regulatory_compliance'],
        automationPotential: 'medium'
      },
      {
        id: 'compliance_check',
        name: 'Regulatory Compliance Check',
        description: 'Verify compliance with HPCZ, GNC/NMCZ, ECZ requirements',
        type: 'admin_action',
        estimatedDuration: 15,
        dependencies: ['eligibility_assessment'],
        touchpoints: ['compliance_dashboard', 'regulatory_apis', 'compliance_reports'],
        automationPotential: 'high'
      },
      {
        id: 'decision_making',
        name: 'Admission Decision',
        description: 'Admin makes final admission decision',
        type: 'decision_point',
        estimatedDuration: 10,
        dependencies: ['compliance_check', 'payment_verification'],
        touchpoints: ['decision_panel', 'applications_table', 'status_history'],
        automationPotential: 'low'
      },
      {
        id: 'decision_notification',
        name: 'Decision Notification',
        description: 'System notifies student of admission decision',
        type: 'system_process',
        estimatedDuration: 2,
        dependencies: ['decision_making'],
        touchpoints: ['notification_system', 'email_service', 'sms_service'],
        automationPotential: 'none'
      },
      {
        id: 'document_generation',
        name: 'Document Generation',
        description: 'Generate acceptance letter or rejection notice',
        type: 'system_process',
        estimatedDuration: 3,
        dependencies: ['decision_making'],
        touchpoints: ['pdf_generator', 'document_templates', 'file_storage'],
        automationPotential: 'none'
      },
      {
        id: 'record_keeping',
        name: 'Record Keeping',
        description: 'Update records and maintain audit trail',
        type: 'system_process',
        estimatedDuration: 1,
        dependencies: ['decision_notification', 'document_generation'],
        touchpoints: ['audit_logs', 'status_history', 'reporting_system'],
        automationPotential: 'none'
      }
    ]

    const totalTime = steps.reduce((sum, step) => sum + step.estimatedDuration, 0)
    const criticalPath = ['application_receipt', 'initial_screening', 'document_verification', 
                         'eligibility_assessment', 'compliance_check', 'decision_making', 'decision_notification']
    const bottlenecks = ['eligibility_assessment', 'document_verification', 'compliance_check']

    return {
      id: 'admin_review',
      name: 'Admin Review Journey',
      description: 'Complete workflow from application receipt to final decision',
      userType: 'admin',
      steps,
      totalEstimatedTime: totalTime,
      criticalPath,
      bottlenecks
    }
  }

  private initializeTouchpoints(): void {
    const touchpoints: TouchPoint[] = [
      // Authentication & User Management
      {
        id: 'auth_signup',
        name: 'Authentication Signup',
        type: 'ui_component',
        location: '/auth/signup',
        interactions: ['user_registration', 'email_verification']
      },
      {
        id: 'email_verification',
        name: 'Email Verification',
        type: 'external_service',
        location: 'Supabase Auth',
        interactions: ['account_activation', 'email_confirmation']
      },
      {
        id: 'user_profiles_table',
        name: 'User Profiles Database',
        type: 'database_table',
        location: 'supabase.user_profiles',
        interactions: ['profile_storage', 'user_data_retrieval']
      },

      // Student Dashboard & Application
      {
        id: 'student_dashboard',
        name: 'Student Dashboard',
        type: 'ui_component',
        location: '/student/dashboard',
        interactions: ['application_management', 'status_tracking']
      },
      {
        id: 'application_wizard',
        name: 'Application Wizard',
        type: 'ui_component',
        location: '/apply',
        interactions: ['step_navigation', 'form_completion', 'auto_save']
      },
      {
        id: 'applications_table',
        name: 'Applications Database',
        type: 'database_table',
        location: 'supabase.applications',
        interactions: ['application_storage', 'status_updates', 'data_retrieval']
      },

      // Forms & Data Entry
      {
        id: 'kyc_form',
        name: 'KYC Information Form',
        type: 'ui_component',
        location: '/apply - Step 1',
        interactions: ['personal_data_entry', 'program_selection']
      },
      {
        id: 'grades_form',
        name: 'Grades Entry Form',
        type: 'ui_component',
        location: '/apply - Step 2',
        interactions: ['subject_selection', 'grade_entry', 'validation']
      },
      {
        id: 'application_grades_table',
        name: 'Application Grades Database',
        type: 'database_table',
        location: 'supabase.application_grades',
        interactions: ['grade_storage', 'eligibility_calculation']
      },

      // File Management
      {
        id: 'file_upload',
        name: 'File Upload Component',
        type: 'ui_component',
        location: 'Multiple locations',
        interactions: ['document_upload', 'file_validation', 'progress_tracking']
      },
      {
        id: 'document_storage',
        name: 'Document Storage',
        type: 'external_service',
        location: 'Supabase Storage',
        interactions: ['file_storage', 'access_control', 'retrieval']
      },

      // Eligibility & Compliance
      {
        id: 'eligibility_engine',
        name: 'Eligibility Engine',
        type: 'api_endpoint',
        location: '/functions/eligibility',
        interactions: ['requirement_checking', 'score_calculation', 'compliance_validation']
      },
      {
        id: 'regulatory_apis',
        name: 'Regulatory APIs',
        type: 'external_service',
        location: 'HPCZ/GNC/ECZ Systems',
        interactions: ['compliance_checking', 'requirement_validation']
      },

      // Admin Interface
      {
        id: 'admin_dashboard',
        name: 'Admin Dashboard',
        type: 'ui_component',
        location: '/admin/dashboard',
        interactions: ['application_overview', 'metrics_display', 'quick_actions']
      },
      {
        id: 'admin_applications_page',
        name: 'Admin Applications Page',
        type: 'ui_component',
        location: '/admin/applications',
        interactions: ['application_listing', 'filtering', 'bulk_actions']
      },
      {
        id: 'application_detail_modal',
        name: 'Application Detail Modal',
        type: 'ui_component',
        location: 'Admin Applications',
        interactions: ['detailed_review', 'status_updates', 'document_viewing']
      },

      // Notifications
      {
        id: 'notification_system',
        name: 'Notification System',
        type: 'api_endpoint',
        location: '/functions/notifications',
        interactions: ['multi_channel_delivery', 'template_processing', 'delivery_tracking']
      },
      {
        id: 'email_service',
        name: 'Email Service',
        type: 'external_service',
        location: 'Resend API',
        interactions: ['email_delivery', 'template_rendering', 'delivery_confirmation']
      },
      {
        id: 'sms_service',
        name: 'SMS Service',
        type: 'external_service',
        location: 'Twilio API',
        interactions: ['sms_delivery', 'delivery_status', 'international_support']
      }
    ]

    touchpoints.forEach(tp => this.touchpoints.set(tp.id, tp))
  }

  private initializeDecisionNodes(): void {
    const decisionNodes: DecisionNode[] = [
      {
        id: 'eligibility_check',
        name: 'Eligibility Validation',
        condition: 'Student meets program requirements',
        outcomes: [
          { condition: 'Eligible', nextStep: 'payment_submission', probability: 0.75 },
          { condition: 'Not Eligible', nextStep: 'eligibility_feedback', probability: 0.20 },
          { condition: 'Needs Review', nextStep: 'manual_review', probability: 0.05 }
        ],
        automationPotential: 'high'
      },
      {
        id: 'payment_verification',
        name: 'Payment Verification',
        condition: 'Payment proof is valid and amount correct',
        outcomes: [
          { condition: 'Verified', nextStep: 'eligibility_assessment', probability: 0.85 },
          { condition: 'Rejected', nextStep: 'payment_resubmission', probability: 0.15 }
        ],
        automationPotential: 'high'
      },
      {
        id: 'document_verification',
        name: 'Document Verification',
        condition: 'All required documents are authentic and complete',
        outcomes: [
          { condition: 'Verified', nextStep: 'eligibility_assessment', probability: 0.80 },
          { condition: 'Incomplete', nextStep: 'document_request', probability: 0.15 },
          { condition: 'Invalid', nextStep: 'document_resubmission', probability: 0.05 }
        ],
        automationPotential: 'medium'
      },
      {
        id: 'decision_making',
        name: 'Admission Decision',
        condition: 'All requirements met and capacity available',
        outcomes: [
          { condition: 'Approved', nextStep: 'acceptance_letter', probability: 0.60 },
          { condition: 'Rejected', nextStep: 'rejection_notice', probability: 0.30 },
          { condition: 'Waitlisted', nextStep: 'waitlist_notification', probability: 0.10 }
        ],
        automationPotential: 'low'
      }
    ]

    decisionNodes.forEach(node => this.decisionNodes.set(node.id, node))
  }
}

export interface BottleneckMetrics {
  stepId: string
  stepName: string
  averageProcessingTime: number
  maxProcessingTime: number
  minProcessingTime: number
  standardDeviation: number
  throughputPerHour: number
  queueLength: number
  errorRate: number
  userExperienceImpact: 'high' | 'medium' | 'low'
  optimizationPotential: number // 0-100 scale
}

export interface ProcessingTimeData {
  stepId: string
  startTime: Date
  endTime: Date
  userId: string
  applicationId: string
  success: boolean
  errorType?: string
}

export interface UserExperienceMetrics {
  stepId: string
  abandonmentRate: number
  retryRate: number
  satisfactionScore: number
  completionRate: number
  averageAttempts: number
}

export interface OptimizationRecommendation {
  stepId: string
  type: 'automation' | 'ui_improvement' | 'process_change' | 'resource_allocation'
  priority: 'high' | 'medium' | 'low'
  description: string
  expectedImpact: {
    timeReduction: number // percentage
    errorReduction: number // percentage
    userSatisfactionIncrease: number // percentage
  }
  implementationEffort: 'low' | 'medium' | 'high'
  estimatedROI: number
}

/**
 * Bottleneck Detection Engine - Analyzes processing times and identifies delays
 * Validates: Requirements 3.2
 */
export class BottleneckDetectionEngine {
  private processingData: ProcessingTimeData[] = []
  private userExperienceData: Map<string, UserExperienceMetrics> = new Map()

  /**
   * Analyze application processing times and identify delays
   */
  async analyzeProcessingTimes(journeyId: string): Promise<BottleneckMetrics[]> {
    const journey = new UserJourneyMapper().journeys.get(journeyId)
    if (!journey) {
      throw new Error(`Journey not found: ${journeyId}`)
    }

    const metrics: BottleneckMetrics[] = []

    for (const step of journey.steps) {
      const stepData = this.processingData.filter(d => d.stepId === step.id)
      
      if (stepData.length === 0) {
        // Use estimated times if no real data available
        metrics.push(this.createEstimatedMetrics(step))
        continue
      }

      const processingTimes = stepData.map(d => 
        (d.endTime.getTime() - d.startTime.getTime()) / (1000 * 60) // minutes
      )

      const avgTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length
      const maxTime = Math.max(...processingTimes)
      const minTime = Math.min(...processingTimes)
      const variance = processingTimes.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / processingTimes.length
      const stdDev = Math.sqrt(variance)

      const successfulSteps = stepData.filter(d => d.success)
      const errorRate = ((stepData.length - successfulSteps.length) / stepData.length) * 100

      const throughput = this.calculateThroughput(stepData)
      const queueLength = this.estimateQueueLength(step.id)
      const uxImpact = this.assessUserExperienceImpact(step.id, avgTime, errorRate)
      const optimizationPotential = this.calculateOptimizationPotential(step, avgTime, errorRate)

      metrics.push({
        stepId: step.id,
        stepName: step.name,
        averageProcessingTime: avgTime,
        maxProcessingTime: maxTime,
        minProcessingTime: minTime,
        standardDeviation: stdDev,
        throughputPerHour: throughput,
        queueLength,
        errorRate,
        userExperienceImpact: uxImpact,
        optimizationPotential
      })
    }

    return metrics.sort((a, b) => b.optimizationPotential - a.optimizationPotential)
  }

  /**
   * Quantify impact of bottlenecks on user experience metrics
   */
  quantifyBottleneckImpact(bottlenecks: BottleneckMetrics[]): {
    totalTimeImpact: number
    userSatisfactionImpact: number
    conversionImpact: number
    revenueImpact: number
  } {
    const totalTimeImpact = bottlenecks.reduce((sum, bottleneck) => {
      // Calculate excess time beyond optimal
      const optimalTime = this.getOptimalProcessingTime(bottleneck.stepId)
      const excessTime = Math.max(0, bottleneck.averageProcessingTime - optimalTime)
      return sum + excessTime
    }, 0)

    const userSatisfactionImpact = bottlenecks.reduce((impact, bottleneck) => {
      const uxMetrics = this.userExperienceData.get(bottleneck.stepId)
      if (!uxMetrics) return impact

      // Higher processing times and error rates reduce satisfaction
      const timeImpact = Math.min(50, bottleneck.averageProcessingTime * 2) // Cap at 50%
      const errorImpact = bottleneck.errorRate * 0.5
      return impact + timeImpact + errorImpact
    }, 0) / bottlenecks.length

    const conversionImpact = bottlenecks.reduce((impact, bottleneck) => {
      const uxMetrics = this.userExperienceData.get(bottleneck.stepId)
      if (!uxMetrics) return impact

      // Abandonment rate directly impacts conversion
      return impact + uxMetrics.abandonmentRate
    }, 0) / bottlenecks.length

    // Estimate revenue impact based on conversion loss
    const averageApplicationValue = 153 // K153 application fee
    const monthlyApplications = 100 // Estimated
    const revenueImpact = (conversionImpact / 100) * monthlyApplications * averageApplicationValue

    return {
      totalTimeImpact,
      userSatisfactionImpact,
      conversionImpact,
      revenueImpact
    }
  }

  /**
   * Calculate processing time improvements from optimization
   */
  calculateOptimizationImpact(
    bottlenecks: BottleneckMetrics[],
    recommendations: OptimizationRecommendation[]
  ): {
    timeReduction: number
    errorReduction: number
    throughputIncrease: number
    costSavings: number
  } {
    let totalTimeReduction = 0
    let totalErrorReduction = 0
    let totalThroughputIncrease = 0
    let totalCostSavings = 0

    recommendations.forEach(rec => {
      const bottleneck = bottlenecks.find(b => b.stepId === rec.stepId)
      if (!bottleneck) return

      // Calculate time reduction
      const timeReduction = (bottleneck.averageProcessingTime * rec.expectedImpact.timeReduction) / 100
      totalTimeReduction += timeReduction

      // Calculate error reduction
      const errorReduction = (bottleneck.errorRate * rec.expectedImpact.errorReduction) / 100
      totalErrorReduction += errorReduction

      // Calculate throughput increase
      const currentThroughput = bottleneck.throughputPerHour
      const throughputIncrease = (currentThroughput * rec.expectedImpact.timeReduction) / 100
      totalThroughputIncrease += throughputIncrease

      // Estimate cost savings from reduced processing time
      const hourlyAdminCost = 50 // Estimated K50/hour for admin time
      const hoursPerMonth = (bottleneck.averageProcessingTime / 60) * 100 // 100 applications/month
      const monthlySavings = (timeReduction / 60) * 100 * hourlyAdminCost
      totalCostSavings += monthlySavings
    })

    return {
      timeReduction: totalTimeReduction,
      errorReduction: totalErrorReduction,
      throughputIncrease: totalThroughputIncrease,
      costSavings: totalCostSavings
    }
  }

  /**
   * Generate optimization recommendations for identified bottlenecks
   */
  generateOptimizationRecommendations(bottlenecks: BottleneckMetrics[]): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = []

    bottlenecks.forEach(bottleneck => {
      // High processing time recommendations
      if (bottleneck.averageProcessingTime > 15) {
        recommendations.push({
          stepId: bottleneck.stepId,
          type: 'automation',
          priority: 'high',
          description: `Automate ${bottleneck.stepName} to reduce processing time from ${bottleneck.averageProcessingTime.toFixed(1)} to ~5 minutes`,
          expectedImpact: {
            timeReduction: 70,
            errorReduction: 50,
            userSatisfactionIncrease: 40
          },
          implementationEffort: 'medium',
          estimatedROI: this.calculateROI(bottleneck, 70, 50)
        })
      }

      // High error rate recommendations
      if (bottleneck.errorRate > 10) {
        recommendations.push({
          stepId: bottleneck.stepId,
          type: 'ui_improvement',
          priority: 'high',
          description: `Improve UI/UX for ${bottleneck.stepName} to reduce ${bottleneck.errorRate.toFixed(1)}% error rate`,
          expectedImpact: {
            timeReduction: 20,
            errorReduction: 60,
            userSatisfactionIncrease: 50
          },
          implementationEffort: 'low',
          estimatedROI: this.calculateROI(bottleneck, 20, 60)
        })
      }

      // High queue length recommendations
      if (bottleneck.queueLength > 10) {
        recommendations.push({
          stepId: bottleneck.stepId,
          type: 'resource_allocation',
          priority: 'medium',
          description: `Allocate additional resources to ${bottleneck.stepName} to reduce queue from ${bottleneck.queueLength} items`,
          expectedImpact: {
            timeReduction: 40,
            errorReduction: 20,
            userSatisfactionIncrease: 30
          },
          implementationEffort: 'low',
          estimatedROI: this.calculateROI(bottleneck, 40, 20)
        })
      }

      // Process improvement recommendations
      if (bottleneck.standardDeviation > 10) {
        recommendations.push({
          stepId: bottleneck.stepId,
          type: 'process_change',
          priority: 'medium',
          description: `Standardize ${bottleneck.stepName} process to reduce variability (σ=${bottleneck.standardDeviation.toFixed(1)})`,
          expectedImpact: {
            timeReduction: 30,
            errorReduction: 40,
            userSatisfactionIncrease: 25
          },
          implementationEffort: 'medium',
          estimatedROI: this.calculateROI(bottleneck, 30, 40)
        })
      }
    })

    return recommendations.sort((a, b) => b.estimatedROI - a.estimatedROI)
  }

  /**
   * Add processing time data for analysis
   */
  addProcessingData(data: ProcessingTimeData[]): void {
    this.processingData.push(...data)
  }

  /**
   * Add user experience metrics
   */
  addUserExperienceData(stepId: string, metrics: UserExperienceMetrics): void {
    this.userExperienceData.set(stepId, metrics)
  }

  private createEstimatedMetrics(step: JourneyStep): BottleneckMetrics {
    // Use estimated values based on step configuration
    const baseTime = step.estimatedDuration
    const variance = baseTime * 0.3 // 30% variance
    
    return {
      stepId: step.id,
      stepName: step.name,
      averageProcessingTime: baseTime,
      maxProcessingTime: baseTime + variance,
      minProcessingTime: Math.max(1, baseTime - variance),
      standardDeviation: variance / 2,
      throughputPerHour: 60 / baseTime,
      queueLength: step.dependencies.length * 2,
      errorRate: step.type === 'user_action' ? 5 : 1,
      userExperienceImpact: baseTime > 15 ? 'high' : baseTime > 8 ? 'medium' : 'low',
      optimizationPotential: step.automationPotential === 'high' ? 80 : 
                           step.automationPotential === 'medium' ? 60 : 
                           step.automationPotential === 'low' ? 30 : 10
    }
  }

  private calculateThroughput(stepData: ProcessingTimeData[]): number {
    if (stepData.length === 0) return 0

    const timeSpan = Math.max(...stepData.map(d => d.endTime.getTime())) - 
                    Math.min(...stepData.map(d => d.startTime.getTime()))
    const hours = timeSpan / (1000 * 60 * 60)
    
    return stepData.length / hours
  }

  private estimateQueueLength(stepId: string): number {
    // Simulate queue length based on processing patterns
    const currentHour = new Date().getHours()
    const peakHours = [9, 10, 11, 14, 15, 16] // Business hours
    const isPeakTime = peakHours.includes(currentHour)
    
    return isPeakTime ? Math.floor(Math.random() * 20) + 5 : Math.floor(Math.random() * 10)
  }

  private assessUserExperienceImpact(stepId: string, avgTime: number, errorRate: number): 'high' | 'medium' | 'low' {
    const timeImpact = avgTime > 20 ? 3 : avgTime > 10 ? 2 : 1
    const errorImpact = errorRate > 15 ? 3 : errorRate > 5 ? 2 : 1
    const totalImpact = timeImpact + errorImpact

    return totalImpact >= 5 ? 'high' : totalImpact >= 3 ? 'medium' : 'low'
  }

  private calculateOptimizationPotential(step: JourneyStep, avgTime: number, errorRate: number): number {
    let potential = 0

    // Base potential from automation capability
    switch (step.automationPotential) {
      case 'high': potential += 40; break
      case 'medium': potential += 25; break
      case 'low': potential += 10; break
      case 'none': potential += 0; break
    }

    // Additional potential from current performance issues
    if (avgTime > step.estimatedDuration * 1.5) potential += 20
    if (errorRate > 10) potential += 20
    if (step.dependencies.length > 2) potential += 10
    if (step.type === 'admin_action') potential += 10

    return Math.min(100, potential)
  }

  private getOptimalProcessingTime(stepId: string): number {
    // Define optimal processing times for each step type
    const optimalTimes: Record<string, number> = {
      'registration': 3,
      'profile_creation': 5,
      'application_start': 1,
      'basic_kyc': 8,
      'education_grades': 10,
      'document_upload': 8,
      'eligibility_check': 1,
      'payment_submission': 5,
      'application_review': 5,
      'application_submission': 1,
      'initial_screening': 5,
      'document_verification': 8,
      'payment_verification': 2,
      'eligibility_assessment': 10,
      'compliance_check': 8,
      'decision_making': 5
    }

    return optimalTimes[stepId] || 5
  }

  private calculateROI(bottleneck: BottleneckMetrics, timeReduction: number, errorReduction: number): number {
    // Calculate monthly savings from time reduction
    const hourlyAdminCost = 50 // K50/hour
    const monthlyApplications = 100
    const currentTimeHours = (bottleneck.averageProcessingTime / 60)
    const timeSavingsHours = (currentTimeHours * timeReduction) / 100
    const monthlySavings = timeSavingsHours * monthlyApplications * hourlyAdminCost

    // Calculate savings from error reduction
    const errorCost = 25 // K25 per error (rework cost)
    const currentErrors = (bottleneck.errorRate / 100) * monthlyApplications
    const errorSavings = (currentErrors * errorReduction / 100) * errorCost

    const totalMonthlySavings = monthlySavings + errorSavings
    const annualSavings = totalMonthlySavings * 12

    // Estimate implementation cost based on effort
    const implementationCosts = {
      'low': 5000,    // K5,000
      'medium': 15000, // K15,000
      'high': 30000   // K30,000
    }

    const implementationCost = implementationCosts['medium'] // Default to medium
    
    return (annualSavings / implementationCost) * 100 // ROI percentage
  }
}
export interface AutomationTask {
  id: string
  name: string
  description: string
  currentMethod: 'manual' | 'semi_automated' | 'automated'
  frequency: 'daily' | 'weekly' | 'monthly' | 'per_application'
  timePerExecution: number // minutes
  executionsPerMonth: number
  errorProne: boolean
  complexity: 'low' | 'medium' | 'high'
  dataInputs: string[]
  dataOutputs: string[]
  dependencies: string[]
}

export interface AutomationPattern {
  id: string
  name: string
  description: string
  applicableTasks: string[]
  automationApproach: 'rule_based' | 'ml_based' | 'workflow_engine' | 'api_integration'
  implementationComplexity: 'low' | 'medium' | 'high'
  expectedAccuracy: number // percentage
  maintenanceRequirement: 'low' | 'medium' | 'high'
}

export interface AutomationOpportunity {
  taskId: string
  taskName: string
  automationPattern: AutomationPattern
  priority: 'high' | 'medium' | 'low'
  potentialSavings: {
    timePerMonth: number // hours
    costPerMonth: number // currency
    errorReduction: number // percentage
  }
  implementationApproach: {
    technology: string
    estimatedEffort: number // person-days
    prerequisites: string[]
    risks: string[]
  }
  roi: {
    implementationCost: number
    monthlySavings: number
    paybackPeriod: number // months
    annualROI: number // percentage
  }
}

export interface WorkflowAutomationRecommendation {
  id: string
  title: string
  description: string
  targetTasks: string[]
  automationType: 'full_automation' | 'assisted_automation' | 'process_optimization'
  businessImpact: {
    efficiency: number // percentage improvement
    accuracy: number // percentage improvement
    userSatisfaction: number // percentage improvement
    costReduction: number // percentage
  }
  technicalRequirements: {
    systems: string[]
    integrations: string[]
    dataRequirements: string[]
    securityConsiderations: string[]
  }
  implementationPlan: {
    phases: Array<{
      name: string
      duration: number // weeks
      deliverables: string[]
      resources: string[]
    }>
    totalDuration: number // weeks
    totalCost: number
  }
}

/**
 * Automation Opportunity Identifier - Analyzes repetitive tasks and identifies automation potential
 * Validates: Requirements 3.4
 */
export class AutomationOpportunityIdentifier {
  private tasks: Map<string, AutomationTask> = new Map()
  private patterns: Map<string, AutomationPattern> = new Map()

  constructor() {
    this.initializeAutomationTasks()
    this.initializeAutomationPatterns()
  }

  /**
   * Analyze repetitive manual tasks in application review process
   */
  analyzeRepetitiveTasks(): AutomationTask[] {
    const repetitiveTasks = Array.from(this.tasks.values()).filter(task => {
      // Identify tasks that are repetitive and time-consuming
      const isRepetitive = task.executionsPerMonth > 10
      const isTimeConsuming = task.timePerExecution > 5
      const isManual = task.currentMethod === 'manual'
      const isErrorProne = task.errorProne

      return (isRepetitive && isTimeConsuming) || (isManual && isErrorProne)
    })

    return repetitiveTasks.sort((a, b) => {
      // Sort by potential impact (time * frequency * error factor)
      const impactA = a.timePerExecution * a.executionsPerMonth * (a.errorProne ? 2 : 1)
      const impactB = b.timePerExecution * b.executionsPerMonth * (b.errorProne ? 2 : 1)
      return impactB - impactA
    })
  }

  /**
   * Identify patterns suitable for workflow automation
   */
  identifyAutomationPatterns(tasks: AutomationTask[]): Map<string, AutomationTask[]> {
    const patternMatches = new Map<string, AutomationTask[]>()

    this.patterns.forEach((pattern, patternId) => {
      const matchingTasks = tasks.filter(task => 
        pattern.applicableTasks.includes(task.id) || 
        this.isTaskSuitableForPattern(task, pattern)
      )

      if (matchingTasks.length > 0) {
        patternMatches.set(patternId, matchingTasks)
      }
    })

    return patternMatches
  }

  /**
   * Generate automation recommendations with implementation approaches
   */
  generateAutomationRecommendations(tasks: AutomationTask[]): AutomationOpportunity[] {
    const opportunities: AutomationOpportunity[] = []

    tasks.forEach(task => {
      const suitablePatterns = Array.from(this.patterns.values())
        .filter(pattern => this.isTaskSuitableForPattern(task, pattern))
        .sort((a, b) => this.calculatePatternScore(task, b) - this.calculatePatternScore(task, a))

      if (suitablePatterns.length > 0) {
        const bestPattern = suitablePatterns[0]
        const opportunity = this.createAutomationOpportunity(task, bestPattern)
        opportunities.push(opportunity)
      }
    })

    return opportunities.sort((a, b) => b.roi.annualROI - a.roi.annualROI)
  }

  /**
   * Generate comprehensive workflow automation recommendations
   */
  generateWorkflowRecommendations(opportunities: AutomationOpportunity[]): WorkflowAutomationRecommendation[] {
    const recommendations: WorkflowAutomationRecommendation[] = []

    // Group opportunities by workflow area
    const workflowGroups = this.groupOpportunitiesByWorkflow(opportunities)

    workflowGroups.forEach((groupOpportunities, workflowName) => {
      const recommendation = this.createWorkflowRecommendation(workflowName, groupOpportunities)
      recommendations.push(recommendation)
    })

    return recommendations.sort((a, b) => 
      b.businessImpact.efficiency - a.businessImpact.efficiency
    )
  }

  /**
   * Calculate automation ROI and feasibility scores
   */
  calculateAutomationROI(opportunity: AutomationOpportunity): {
    roi: number
    feasibilityScore: number
    riskScore: number
    recommendationLevel: 'highly_recommended' | 'recommended' | 'consider' | 'not_recommended'
  } {
    const { roi, implementationApproach } = opportunity

    // Calculate feasibility based on complexity and prerequisites
    let feasibilityScore = 100
    if (implementationApproach.prerequisites.length > 3) feasibilityScore -= 20
    if (implementationApproach.estimatedEffort > 30) feasibilityScore -= 30
    if (implementationApproach.risks.length > 2) feasibilityScore -= 25

    // Calculate risk score
    const riskScore = implementationApproach.risks.length * 20 + 
                     (implementationApproach.estimatedEffort > 60 ? 30 : 0)

    // Determine recommendation level
    let recommendationLevel: 'highly_recommended' | 'recommended' | 'consider' | 'not_recommended'
    if (roi.annualROI > 200 && feasibilityScore > 70) {
      recommendationLevel = 'highly_recommended'
    } else if (roi.annualROI > 100 && feasibilityScore > 50) {
      recommendationLevel = 'recommended'
    } else if (roi.annualROI > 50 && feasibilityScore > 30) {
      recommendationLevel = 'consider'
    } else {
      recommendationLevel = 'not_recommended'
    }

    return {
      roi: roi.annualROI,
      feasibilityScore,
      riskScore,
      recommendationLevel
    }
  }

  private initializeAutomationTasks(): void {
    const tasks: AutomationTask[] = [
      {
        id: 'document_verification',
        name: 'Document Verification',
        description: 'Verify authenticity and completeness of uploaded documents',
        currentMethod: 'manual',
        frequency: 'per_application',
        timePerExecution: 15,
        executionsPerMonth: 100,
        errorProne: true,
        complexity: 'medium',
        dataInputs: ['document_files', 'document_metadata', 'verification_checklist'],
        dataOutputs: ['verification_status', 'verification_notes', 'flagged_issues'],
        dependencies: ['file_storage', 'document_templates']
      },
      {
        id: 'payment_verification',
        name: 'Payment Verification',
        description: 'Verify payment proof and amount correctness',
        currentMethod: 'manual',
        frequency: 'per_application',
        timePerExecution: 5,
        executionsPerMonth: 100,
        errorProne: true,
        complexity: 'low',
        dataInputs: ['payment_proof', 'application_fee', 'payment_method'],
        dataOutputs: ['payment_status', 'verification_notes'],
        dependencies: ['payment_records', 'fee_structure']
      },
      {
        id: 'eligibility_calculation',
        name: 'Eligibility Calculation',
        description: 'Calculate eligibility scores based on grades and requirements',
        currentMethod: 'semi_automated',
        frequency: 'per_application',
        timePerExecution: 20,
        executionsPerMonth: 100,
        errorProne: true,
        complexity: 'high',
        dataInputs: ['student_grades', 'program_requirements', 'regulatory_rules'],
        dataOutputs: ['eligibility_score', 'requirement_analysis', 'recommendations'],
        dependencies: ['grading_system', 'regulatory_apis', 'program_catalog']
      },
      {
        id: 'compliance_checking',
        name: 'Regulatory Compliance Checking',
        description: 'Verify compliance with HPCZ, GNC/NMCZ, ECZ requirements',
        currentMethod: 'manual',
        frequency: 'per_application',
        timePerExecution: 15,
        executionsPerMonth: 100,
        errorProne: true,
        complexity: 'high',
        dataInputs: ['application_data', 'regulatory_requirements', 'compliance_rules'],
        dataOutputs: ['compliance_status', 'violations', 'recommendations'],
        dependencies: ['regulatory_apis', 'compliance_database']
      },
      {
        id: 'status_notifications',
        name: 'Status Update Notifications',
        description: 'Send notifications when application status changes',
        currentMethod: 'manual',
        frequency: 'per_application',
        timePerExecution: 3,
        executionsPerMonth: 200,
        errorProne: false,
        complexity: 'low',
        dataInputs: ['status_change', 'user_preferences', 'notification_templates'],
        dataOutputs: ['notification_sent', 'delivery_status'],
        dependencies: ['notification_system', 'user_preferences']
      },
      {
        id: 'report_generation',
        name: 'Administrative Report Generation',
        description: 'Generate periodic reports for administrators',
        currentMethod: 'manual',
        frequency: 'weekly',
        timePerExecution: 60,
        executionsPerMonth: 4,
        errorProne: false,
        complexity: 'medium',
        dataInputs: ['application_data', 'metrics', 'report_templates'],
        dataOutputs: ['formatted_reports', 'charts', 'summaries'],
        dependencies: ['database', 'reporting_engine']
      },
      {
        id: 'data_entry_validation',
        name: 'Data Entry Validation',
        description: 'Validate and clean user-entered data',
        currentMethod: 'semi_automated',
        frequency: 'per_application',
        timePerExecution: 8,
        executionsPerMonth: 100,
        errorProne: true,
        complexity: 'medium',
        dataInputs: ['form_data', 'validation_rules', 'reference_data'],
        dataOutputs: ['validated_data', 'error_flags', 'suggestions'],
        dependencies: ['validation_engine', 'reference_databases']
      },
      {
        id: 'interview_scheduling',
        name: 'Interview Scheduling',
        description: 'Schedule and manage applicant interviews',
        currentMethod: 'manual',
        frequency: 'per_application',
        timePerExecution: 10,
        executionsPerMonth: 60,
        errorProne: true,
        complexity: 'medium',
        dataInputs: ['applicant_availability', 'interviewer_schedule', 'interview_requirements'],
        dataOutputs: ['scheduled_interviews', 'calendar_events', 'notifications'],
        dependencies: ['calendar_system', 'notification_system']
      }
    ]

    tasks.forEach(task => this.tasks.set(task.id, task))
  }

  private initializeAutomationPatterns(): void {
    const patterns: AutomationPattern[] = [
      {
        id: 'rule_based_validation',
        name: 'Rule-Based Validation',
        description: 'Automate validation using predefined business rules',
        applicableTasks: ['payment_verification', 'data_entry_validation'],
        automationApproach: 'rule_based',
        implementationComplexity: 'low',
        expectedAccuracy: 95,
        maintenanceRequirement: 'low'
      },
      {
        id: 'document_ai_processing',
        name: 'AI Document Processing',
        description: 'Use AI/ML to process and verify documents',
        applicableTasks: ['document_verification'],
        automationApproach: 'ml_based',
        implementationComplexity: 'high',
        expectedAccuracy: 85,
        maintenanceRequirement: 'medium'
      },
      {
        id: 'workflow_orchestration',
        name: 'Workflow Orchestration',
        description: 'Automate multi-step workflows with orchestration engine',
        applicableTasks: ['eligibility_calculation', 'compliance_checking'],
        automationApproach: 'workflow_engine',
        implementationComplexity: 'medium',
        expectedAccuracy: 90,
        maintenanceRequirement: 'medium'
      },
      {
        id: 'api_integration',
        name: 'API Integration Automation',
        description: 'Automate through external API integrations',
        applicableTasks: ['compliance_checking', 'status_notifications'],
        automationApproach: 'api_integration',
        implementationComplexity: 'medium',
        expectedAccuracy: 98,
        maintenanceRequirement: 'low'
      },
      {
        id: 'scheduled_automation',
        name: 'Scheduled Task Automation',
        description: 'Automate recurring tasks with scheduling',
        applicableTasks: ['report_generation', 'status_notifications'],
        automationApproach: 'workflow_engine',
        implementationComplexity: 'low',
        expectedAccuracy: 99,
        maintenanceRequirement: 'low'
      },
      {
        id: 'intelligent_scheduling',
        name: 'Intelligent Scheduling',
        description: 'AI-powered scheduling optimization',
        applicableTasks: ['interview_scheduling'],
        automationApproach: 'ml_based',
        implementationComplexity: 'high',
        expectedAccuracy: 80,
        maintenanceRequirement: 'high'
      }
    ]

    patterns.forEach(pattern => this.patterns.set(pattern.id, pattern))
  }

  private isTaskSuitableForPattern(task: AutomationTask, pattern: AutomationPattern): boolean {
    // Check if task characteristics match pattern capabilities
    if (pattern.applicableTasks.includes(task.id)) return true

    // Rule-based patterns work well for structured, low-complexity tasks
    if (pattern.automationApproach === 'rule_based') {
      return task.complexity === 'low' && task.dataInputs.length <= 3
    }

    // ML-based patterns work for complex, data-rich tasks
    if (pattern.automationApproach === 'ml_based') {
      return task.complexity === 'high' && task.dataInputs.length > 2
    }

    // Workflow engines work for multi-step processes
    if (pattern.automationApproach === 'workflow_engine') {
      return task.dependencies.length > 1 || task.complexity === 'medium'
    }

    // API integration works for external system interactions
    if (pattern.automationApproach === 'api_integration') {
      return task.dependencies.some(dep => dep.includes('api') || dep.includes('external'))
    }

    return false
  }

  private calculatePatternScore(task: AutomationTask, pattern: AutomationPattern): number {
    let score = 0

    // Base score from expected accuracy
    score += pattern.expectedAccuracy

    // Bonus for low implementation complexity
    if (pattern.implementationComplexity === 'low') score += 20
    else if (pattern.implementationComplexity === 'medium') score += 10

    // Bonus for low maintenance requirement
    if (pattern.maintenanceRequirement === 'low') score += 15
    else if (pattern.maintenanceRequirement === 'medium') score += 8

    // Penalty for high-risk combinations
    if (task.errorProne && pattern.expectedAccuracy < 90) score -= 20

    return score
  }

  private createAutomationOpportunity(task: AutomationTask, pattern: AutomationPattern): AutomationOpportunity {
    const timePerMonth = (task.timePerExecution / 60) * task.executionsPerMonth
    const hourlyRate = 50 // K50/hour
    const costPerMonth = timePerMonth * hourlyRate

    const timeSavingsPercentage = pattern.expectedAccuracy / 100 * 0.8 // 80% of accuracy as time savings
    const timeSavings = timePerMonth * timeSavingsPercentage
    const costSavings = timeSavings * hourlyRate

    const errorReduction = task.errorProne ? 70 : 20 // Percentage

    const implementationEffort = this.estimateImplementationEffort(task, pattern)
    const implementationCost = implementationEffort * 500 // K500 per person-day

    const monthlySavings = costSavings + (task.errorProne ? costSavings * 0.2 : 0) // Error cost savings
    const paybackPeriod = implementationCost / monthlySavings
    const annualROI = ((monthlySavings * 12 - implementationCost) / implementationCost) * 100

    return {
      taskId: task.id,
      taskName: task.name,
      automationPattern: pattern,
      priority: this.calculatePriority(task, pattern, annualROI),
      potentialSavings: {
        timePerMonth: timeSavings,
        costPerMonth: costSavings,
        errorReduction
      },
      implementationApproach: {
        technology: this.getTechnologyStack(pattern),
        estimatedEffort: implementationEffort,
        prerequisites: this.getPrerequisites(task, pattern),
        risks: this.getRisks(task, pattern)
      },
      roi: {
        implementationCost,
        monthlySavings,
        paybackPeriod,
        annualROI
      }
    }
  }

  private estimateImplementationEffort(task: AutomationTask, pattern: AutomationPattern): number {
    let baseDays = 10

    // Adjust based on pattern complexity
    switch (pattern.implementationComplexity) {
      case 'low': baseDays = 5; break
      case 'medium': baseDays = 15; break
      case 'high': baseDays = 30; break
    }

    // Adjust based on task complexity
    switch (task.complexity) {
      case 'low': baseDays *= 0.8; break
      case 'medium': baseDays *= 1.0; break
      case 'high': baseDays *= 1.5; break
    }

    // Adjust based on dependencies
    baseDays += task.dependencies.length * 2

    return Math.ceil(baseDays)
  }

  private calculatePriority(task: AutomationTask, pattern: AutomationPattern, roi: number): 'high' | 'medium' | 'low' {
    const impact = task.timePerExecution * task.executionsPerMonth
    const urgency = task.errorProne ? 2 : 1

    const priorityScore = (impact * urgency) + (roi / 10)

    if (priorityScore > 200) return 'high'
    if (priorityScore > 100) return 'medium'
    return 'low'
  }

  private getTechnologyStack(pattern: AutomationPattern): string {
    const stacks = {
      'rule_based': 'TypeScript + Business Rules Engine',
      'ml_based': 'Python + TensorFlow/PyTorch + API Gateway',
      'workflow_engine': 'Node.js + Temporal/Zeebe Workflow Engine',
      'api_integration': 'TypeScript + REST/GraphQL APIs'
    }

    return stacks[pattern.automationApproach] || 'Custom Solution'
  }

  private getPrerequisites(task: AutomationTask, pattern: AutomationPattern): string[] {
    const prerequisites: string[] = []

    if (pattern.automationApproach === 'ml_based') {
      prerequisites.push('Training data collection', 'ML model development environment')
    }

    if (pattern.automationApproach === 'workflow_engine') {
      prerequisites.push('Workflow engine setup', 'Process modeling')
    }

    if (task.dependencies.includes('regulatory_apis')) {
      prerequisites.push('Regulatory API access', 'Compliance approval')
    }

    if (task.errorProne) {
      prerequisites.push('Comprehensive testing framework', 'Rollback procedures')
    }

    return prerequisites
  }

  private getRisks(task: AutomationTask, pattern: AutomationPattern): string[] {
    const risks: string[] = []

    if (pattern.expectedAccuracy < 90) {
      risks.push('Accuracy below manual process')
    }

    if (pattern.implementationComplexity === 'high') {
      risks.push('Complex implementation may cause delays')
    }

    if (task.errorProne && pattern.maintenanceRequirement === 'high') {
      risks.push('High maintenance overhead')
    }

    if (task.dependencies.includes('regulatory_apis')) {
      risks.push('External API dependency risk')
    }

    return risks
  }

  private groupOpportunitiesByWorkflow(opportunities: AutomationOpportunity[]): Map<string, AutomationOpportunity[]> {
    const groups = new Map<string, AutomationOpportunity[]>()

    const workflowMapping = {
      'document_verification': 'Document Processing Workflow',
      'payment_verification': 'Payment Processing Workflow',
      'eligibility_calculation': 'Eligibility Assessment Workflow',
      'compliance_checking': 'Compliance Verification Workflow',
      'status_notifications': 'Communication Workflow',
      'report_generation': 'Reporting Workflow',
      'data_entry_validation': 'Data Management Workflow',
      'interview_scheduling': 'Interview Management Workflow'
    }

    opportunities.forEach(opportunity => {
      const workflowName = workflowMapping[opportunity.taskId] || 'General Workflow'
      
      if (!groups.has(workflowName)) {
        groups.set(workflowName, [])
      }
      
      groups.get(workflowName)!.push(opportunity)
    })

    return groups
  }

  private createWorkflowRecommendation(
    workflowName: string, 
    opportunities: AutomationOpportunity[]
  ): WorkflowAutomationRecommendation {
    const totalSavings = opportunities.reduce((sum, opp) => sum + opp.roi.monthlySavings, 0)
    const totalCost = opportunities.reduce((sum, opp) => sum + opp.roi.implementationCost, 0)
    const avgROI = opportunities.reduce((sum, opp) => sum + opp.roi.annualROI, 0) / opportunities.length

    const efficiency = Math.min(80, opportunities.length * 15) // Cap at 80%
    const accuracy = opportunities.reduce((sum, opp) => sum + opp.automationPattern.expectedAccuracy, 0) / opportunities.length
    const userSatisfaction = Math.min(60, opportunities.length * 10) // Cap at 60%
    const costReduction = (totalSavings * 12 / (totalSavings * 12 + totalCost)) * 100

    return {
      id: workflowName.toLowerCase().replace(/\s+/g, '_'),
      title: `Automate ${workflowName}`,
      description: `Comprehensive automation of ${opportunities.length} tasks in ${workflowName}`,
      targetTasks: opportunities.map(opp => opp.taskId),
      automationType: opportunities.length > 2 ? 'full_automation' : 'assisted_automation',
      businessImpact: {
        efficiency,
        accuracy: accuracy - 5, // Account for integration overhead
        userSatisfaction,
        costReduction
      },
      technicalRequirements: {
        systems: ['Application Database', 'Notification System', 'File Storage'],
        integrations: ['Supabase', 'Cloudflare Functions', 'External APIs'],
        dataRequirements: ['Historical processing data', 'Business rules', 'User preferences'],
        securityConsiderations: ['Data encryption', 'Access controls', 'Audit logging']
      },
      implementationPlan: {
        phases: [
          {
            name: 'Analysis & Design',
            duration: 2,
            deliverables: ['Requirements analysis', 'Technical design', 'Implementation plan'],
            resources: ['Business Analyst', 'Solution Architect']
          },
          {
            name: 'Development',
            duration: Math.ceil(opportunities.length * 2),
            deliverables: ['Automation components', 'Integration layer', 'Testing framework'],
            resources: ['Developers', 'QA Engineers']
          },
          {
            name: 'Testing & Deployment',
            duration: 2,
            deliverables: ['Test results', 'Deployment package', 'Documentation'],
            resources: ['QA Engineers', 'DevOps Engineers']
          }
        ],
        totalDuration: Math.ceil(opportunities.length * 2) + 4,
        totalCost
      }
    }
  }
}