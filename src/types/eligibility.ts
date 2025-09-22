import { EligibilityAssessment, MissingRequirement } from '@/lib/eligibilityEngine'

export interface SupabaseEligibilityAssessmentRow extends EligibilityAssessment {
  id: string
  created_at: string
  updated_at?: string | null
  detailed_breakdown: string | EligibilityAssessment['detailed_breakdown']
  missing_requirements: string | MissingRequirement[]
  recommendations: string | string[]
}

export interface EligibilityAssessmentWithProgram extends SupabaseEligibilityAssessmentRow {
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
