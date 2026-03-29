export interface EligibilityAssessment {
  id: string
  application_id: string
  program_id: string
  overall_score: number
  eligibility_status: 'eligible' | 'conditional' | 'not_eligible'
  missing_requirements: unknown[]
  created_at: string
  programs?: {
    name: string
    code?: string
  } | null
}
