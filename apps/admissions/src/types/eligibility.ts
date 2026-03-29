// @ts-nocheck
import { EligibilityAssessment, MissingRequirement } from '@/lib/eligibilityEngine'

export interface EligibilityAssessmentRow extends EligibilityAssessment {
  id: string
  created_at: string
  updated_at?: string | null
  detailed_breakdown: string | EligibilityAssessment['detailed_breakdown']
  missing_requirements: string | MissingRequirement[]
  recommendations: string | string[]
}

export interface EligibilityAssessmentWithProgram extends EligibilityAssessmentRow {
  programs?: {
    name: string | null
    code?: string | null
  } | null
}

export interface DashboardEligibilityAssessment {
  id: string
  application_id: string
  program_id: string
  overall_score: number
  eligibility_status: EligibilityAssessment['eligibility_status']
  missing_requirements: MissingRequirement[]
  programs?: {
    name: string | null
    code?: string | null
  } | null
}
