/**
 * User Journey Mapper
 * 
 * Maps complete student application workflow from registration to decision
 * and admin review workflow from application receipt to final decision.
 * Identifies all touchpoints and decision nodes in the process.
 * 
 * Requirements: 3.1
 */

export interface JourneyStep {
  id: string
  name: string
  description: string
  type: 'action' | 'decision' | 'system' | 'touchpoint'
  actor: 'student' | 'admin' | 'system'
  duration_estimate_minutes: number
  prerequisites: string[]
  outcomes: string[]
  data_collected?: string[]
  documents_required?: string[]
  validations?: string[]
  notifications_sent?: string[]
}

export interface UserJourney {
  id: string
  name: string
  description: string
  actor_type: 'student' | 'admin'
  start_trigger: string
  end_conditions: string[]
  steps: JourneyStep[]
  decision_points: DecisionPoint[]
  touchpoints: Touchpoint[]
  total_estimated_duration_minutes: number
  success_rate_percentage?: number
  abandonment_points?: string[]
}

export interface DecisionPoint {
  id: string
  step_id: string
  name: string
  criteria: string[]
  possible_outcomes: string[]
  automation_potential: 'high' | 'medium' | 'low' | 'none'
  current_automation_level: 'manual' | 'semi_automated' | 'automated'
}

export interface Touchpoint {
  id: string
  step_id: string
  name: string
  channel: 'web' | 'email' | 'sms' | 'whatsapp' | 'phone' | 'in_person'
  purpose: string
  frequency: 'once' | 'multiple' | 'conditional'
  user_satisfaction_score?: number
}

export interface JourneyAnalysis {
  journey_id: string
  total_steps: number
  manual_steps: number
  automated_steps: number
  decision_points: number
  touchpoints: number
  estimated_completion_time: number
  bottleneck_steps: string[]
  improvement_opportunities: string[]
  automation_candidates: string[]
}

export class UserJourneyMapper {
  private studentJourney: UserJourney
  private adminJourney: UserJourney

  constructor() {
    this.studentJourney = this.createStudentJourney()
    this.adminJourney = this.createAdminJourney()
  }

  /**
   * Maps the complete student application workflow
   */
  private createStudentJourney(): UserJourney {
    const steps: JourneyStep[] = [
      {
        id: 'student_registration',
        name: 'User Registration',
        description: 'Student creates account and verifies email',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 5,
        prerequisites: [],
        outcomes: ['account_created', 'email_verified'],
        data_collected: ['email', 'password', 'basic_profile'],
        notifications_sent: ['welcome_email', 'verification_email']
      },
      {
        id: 'profile_creation',
        name: 'Profile Creation',
        description: 'Student completes basic profile information',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 10,
        prerequisites: ['account_created'],
        outcomes: ['profile_completed'],
        data_collected: ['full_name', 'phone', 'address', 'emergency_contact']
      },
      {
        id: 'application_wizard_step1',
        name: 'Basic KYC Information',
        description: 'Student provides personal details and selects program',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 15,
        prerequisites: ['profile_completed'],
        outcomes: ['basic_info_completed', 'program_selected'],
        data_collected: ['nrc_passport', 'date_of_birth', 'sex', 'program', 'institution'],
        validations: ['age_validation', 'document_format_validation']
      },
      {
        id: 'application_wizard_step2',
        name: 'Education & Documents',
        description: 'Student enters grades and uploads required documents',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 25,
        prerequisites: ['basic_info_completed'],
        outcomes: ['grades_entered', 'documents_uploaded'],
        data_collected: ['grade_12_results', 'subject_grades'],
        documents_required: ['result_slip', 'nrc_passport_copy'],
        validations: ['grade_format_validation', 'document_size_validation', 'eligibility_check']
      },
      {
        id: 'eligibility_check',
        name: 'Eligibility Assessment',
        description: 'System automatically checks student eligibility',
        type: 'system',
        actor: 'system',
        duration_estimate_minutes: 1,
        prerequisites: ['grades_entered'],
        outcomes: ['eligible', 'not_eligible', 'conditional_eligible'],
        validations: ['regulatory_compliance_check', 'grade_requirements_check']
      },
      {
        id: 'application_wizard_step3',
        name: 'Payment Information',
        description: 'Student submits payment details and proof of payment',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 10,
        prerequisites: ['documents_uploaded'],
        outcomes: ['payment_info_submitted'],
        data_collected: ['payment_method', 'payer_details', 'transaction_reference'],
        documents_required: ['proof_of_payment']
      },
      {
        id: 'application_wizard_step4',
        name: 'Review & Submit',
        description: 'Student reviews application and submits for processing',
        type: 'action',
        actor: 'student',
        duration_estimate_minutes: 5,
        prerequisites: ['payment_info_submitted'],
        outcomes: ['application_submitted'],
        notifications_sent: ['submission_confirmation_email', 'submission_sms']
      },
      {
        id: 'application_tracking',
        name: 'Application Tracking',
        description: 'Student monitors application status and receives updates',
        type: 'touchpoint',
        actor: 'student',
        duration_estimate_minutes: 0,
        prerequisites: ['application_submitted'],
        outcomes: ['status_viewed', 'updates_received'],
        notifications_sent: ['status_update_email', 'status_update_sms']
      }
    ]

    const decisionPoints: DecisionPoint[] = [
      {
        id: 'eligibility_decision',
        step_id: 'eligibility_check',
        name: 'Eligibility Assessment Decision',
        criteria: ['grade_requirements', 'regulatory_compliance', 'program_capacity'],
        possible_outcomes: ['eligible', 'not_eligible', 'conditional_eligible'],
        automation_potential: 'high',
        current_automation_level: 'automated'
      },
      {
        id: 'document_validation_decision',
        step_id: 'application_wizard_step2',
        name: 'Document Validation Decision',
        criteria: ['document_format', 'document_clarity', 'document_completeness'],
        possible_outcomes: ['documents_valid', 'documents_invalid', 'documents_need_review'],
        automation_potential: 'medium',
        current_automation_level: 'semi_automated'
      }
    ]

    const touchpoints: Touchpoint[] = [
      {
        id: 'email_verification',
        step_id: 'student_registration',
        name: 'Email Verification',
        channel: 'email',
        purpose: 'Account verification and security',
        frequency: 'once'
      },
      {
        id: 'submission_confirmation',
        step_id: 'application_wizard_step4',
        name: 'Submission Confirmation',
        channel: 'email',
        purpose: 'Confirm successful application submission',
        frequency: 'once'
      },
      {
        id: 'status_updates',
        step_id: 'application_tracking',
        name: 'Status Updates',
        channel: 'email',
        purpose: 'Keep student informed of application progress',
        frequency: 'multiple'
      }
    ]

    return {
      id: 'student_application_journey',
      name: 'Student Application Journey',
      description: 'Complete workflow from registration to application submission',
      actor_type: 'student',
      start_trigger: 'User decides to apply for admission',
      end_conditions: ['application_submitted', 'application_abandoned'],
      steps,
      decision_points: decisionPoints,
      touchpoints,
      total_estimated_duration_minutes: steps.reduce((total, step) => total + step.duration_estimate_minutes, 0)
    }
  }

  /**
   * Maps the complete admin review workflow
   */
  private createAdminJourney(): UserJourney {
    const steps: JourneyStep[] = [
      {
        id: 'application_receipt',
        name: 'Application Receipt',
        description: 'System receives and queues new application for review',
        type: 'system',
        actor: 'system',
        duration_estimate_minutes: 1,
        prerequisites: [],
        outcomes: ['application_queued'],
        notifications_sent: ['admin_new_application_notification']
      },
      {
        id: 'initial_review',
        name: 'Initial Application Review',
        description: 'Admin performs initial completeness check',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 10,
        prerequisites: ['application_queued'],
        outcomes: ['complete_application', 'incomplete_application'],
        validations: ['completeness_check', 'basic_eligibility_check']
      },
      {
        id: 'document_verification',
        name: 'Document Verification',
        description: 'Admin verifies uploaded documents for authenticity and clarity',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 15,
        prerequisites: ['complete_application'],
        outcomes: ['documents_verified', 'documents_rejected'],
        validations: ['document_authenticity', 'document_clarity', 'document_completeness']
      },
      {
        id: 'payment_verification',
        name: 'Payment Verification',
        description: 'Admin verifies payment details and proof of payment',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 5,
        prerequisites: ['documents_verified'],
        outcomes: ['payment_verified', 'payment_rejected'],
        validations: ['payment_amount_check', 'payment_method_validation']
      },
      {
        id: 'eligibility_assessment',
        name: 'Detailed Eligibility Assessment',
        description: 'Admin performs comprehensive eligibility evaluation',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 20,
        prerequisites: ['payment_verified'],
        outcomes: ['eligible', 'not_eligible', 'conditional_eligible'],
        validations: ['grade_verification', 'regulatory_compliance', 'program_requirements']
      },
      {
        id: 'interview_scheduling',
        name: 'Interview Scheduling',
        description: 'Admin schedules interview for eligible candidates',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 5,
        prerequisites: ['eligible'],
        outcomes: ['interview_scheduled'],
        notifications_sent: ['interview_invitation_email', 'interview_sms']
      },
      {
        id: 'interview_conduct',
        name: 'Interview Conduct',
        description: 'Admin conducts student interview and evaluation',
        type: 'action',
        actor: 'admin',
        duration_estimate_minutes: 30,
        prerequisites: ['interview_scheduled'],
        outcomes: ['interview_passed', 'interview_failed'],
        data_collected: ['interview_notes', 'interview_score']
      },
      {
        id: 'final_decision',
        name: 'Final Admission Decision',
        description: 'Admin makes final admission decision based on all criteria',
        type: 'decision',
        actor: 'admin',
        duration_estimate_minutes: 10,
        prerequisites: ['interview_passed'],
        outcomes: ['approved', 'rejected', 'waitlisted'],
        notifications_sent: ['decision_notification_email', 'decision_sms']
      },
      {
        id: 'acceptance_letter_generation',
        name: 'Acceptance Letter Generation',
        description: 'System generates acceptance letter for approved applications',
        type: 'system',
        actor: 'system',
        duration_estimate_minutes: 2,
        prerequisites: ['approved'],
        outcomes: ['acceptance_letter_generated'],
        notifications_sent: ['acceptance_letter_email']
      }
    ]

    const decisionPoints: DecisionPoint[] = [
      {
        id: 'completeness_decision',
        step_id: 'initial_review',
        name: 'Application Completeness Decision',
        criteria: ['all_fields_completed', 'required_documents_uploaded', 'payment_submitted'],
        possible_outcomes: ['complete', 'incomplete'],
        automation_potential: 'high',
        current_automation_level: 'manual'
      },
      {
        id: 'document_verification_decision',
        step_id: 'document_verification',
        name: 'Document Verification Decision',
        criteria: ['document_authenticity', 'document_clarity', 'document_validity'],
        possible_outcomes: ['verified', 'rejected', 'needs_clarification'],
        automation_potential: 'medium',
        current_automation_level: 'manual'
      },
      {
        id: 'eligibility_decision',
        step_id: 'eligibility_assessment',
        name: 'Eligibility Assessment Decision',
        criteria: ['grade_requirements', 'regulatory_compliance', 'program_capacity'],
        possible_outcomes: ['eligible', 'not_eligible', 'conditional'],
        automation_potential: 'high',
        current_automation_level: 'semi_automated'
      },
      {
        id: 'final_admission_decision',
        step_id: 'final_decision',
        name: 'Final Admission Decision',
        criteria: ['eligibility_score', 'interview_performance', 'program_capacity', 'institutional_priorities'],
        possible_outcomes: ['approved', 'rejected', 'waitlisted'],
        automation_potential: 'low',
        current_automation_level: 'manual'
      }
    ]

    const touchpoints: Touchpoint[] = [
      {
        id: 'admin_notifications',
        step_id: 'application_receipt',
        name: 'Admin Notifications',
        channel: 'email',
        purpose: 'Notify admins of new applications requiring review',
        frequency: 'multiple'
      },
      {
        id: 'student_status_updates',
        step_id: 'final_decision',
        name: 'Student Status Updates',
        channel: 'email',
        purpose: 'Inform students of application status changes',
        frequency: 'multiple'
      },
      {
        id: 'interview_communications',
        step_id: 'interview_scheduling',
        name: 'Interview Communications',
        channel: 'email',
        purpose: 'Schedule and coordinate interviews',
        frequency: 'multiple'
      }
    ]

    return {
      id: 'admin_review_journey',
      name: 'Admin Review Journey',
      description: 'Complete workflow from application receipt to final decision',
      actor_type: 'admin',
      start_trigger: 'New application submitted by student',
      end_conditions: ['application_approved', 'application_rejected', 'application_waitlisted'],
      steps,
      decision_points: decisionPoints,
      touchpoints,
      total_estimated_duration_minutes: steps.reduce((total, step) => total + step.duration_estimate_minutes, 0)
    }
  }

  /**
   * Get the complete student application journey
   */
  getStudentJourney(): UserJourney {
    return this.studentJourney
  }

  /**
   * Get the complete admin review journey
   */
  getAdminJourney(): UserJourney {
    return this.adminJourney
  }

  /**
   * Get all journeys
   */
  getAllJourneys(): UserJourney[] {
    return [this.studentJourney, this.adminJourney]
  }

  /**
   * Analyze a specific journey for insights
   */
  analyzeJourney(journeyId: string): JourneyAnalysis {
    const journey = journeyId === 'student_application_journey' 
      ? this.studentJourney 
      : this.adminJourney

    const manualSteps = journey.steps.filter(step => 
      step.actor === 'student' || step.actor === 'admin'
    ).length

    const automatedSteps = journey.steps.filter(step => 
      step.actor === 'system'
    ).length

    const bottleneckSteps = journey.steps
      .filter(step => step.duration_estimate_minutes > 15)
      .map(step => step.id)

    const improvementOpportunities = [
      ...journey.decision_points
        .filter(dp => dp.automation_potential === 'high' && dp.current_automation_level === 'manual')
        .map(dp => `Automate ${dp.name}`),
      ...journey.steps
        .filter(step => step.duration_estimate_minutes > 20)
        .map(step => `Optimize ${step.name} duration`),
      ...journey.touchpoints
        .filter(tp => tp.frequency === 'multiple')
        .map(tp => `Consolidate ${tp.name} communications`)
    ]

    const automationCandidates = journey.decision_points
      .filter(dp => dp.automation_potential !== 'none' && dp.current_automation_level !== 'automated')
      .map(dp => dp.name)

    return {
      journey_id: journey.id,
      total_steps: journey.steps.length,
      manual_steps: manualSteps,
      automated_steps: automatedSteps,
      decision_points: journey.decision_points.length,
      touchpoints: journey.touchpoints.length,
      estimated_completion_time: journey.total_estimated_duration_minutes,
      bottleneck_steps: bottleneckSteps,
      improvement_opportunities: improvementOpportunities,
      automation_candidates: automationCandidates
    }
  }

  /**
   * Get all touchpoints across journeys
   */
  getAllTouchpoints(): Touchpoint[] {
    return [
      ...this.studentJourney.touchpoints,
      ...this.adminJourney.touchpoints
    ]
  }

  /**
   * Get all decision points across journeys
   */
  getAllDecisionPoints(): DecisionPoint[] {
    return [
      ...this.studentJourney.decision_points,
      ...this.adminJourney.decision_points
    ]
  }

  /**
   * Generate journey visualization data
   */
  generateVisualizationData(journeyId: string) {
    const journey = journeyId === 'student_application_journey' 
      ? this.studentJourney 
      : this.adminJourney

    return {
      nodes: journey.steps.map(step => ({
        id: step.id,
        label: step.name,
        type: step.type,
        actor: step.actor,
        duration: step.duration_estimate_minutes
      })),
      edges: journey.steps.slice(0, -1).map((step, index) => ({
        from: step.id,
        to: journey.steps[index + 1].id,
        label: step.outcomes.join(', ')
      })),
      decisionPoints: journey.decision_points,
      touchpoints: journey.touchpoints
    }
  }
}