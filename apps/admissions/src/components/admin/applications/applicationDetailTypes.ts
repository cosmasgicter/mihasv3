import type { ApplicationInterview } from '@/types/database'

/** Payment record from the `payments` table */
export interface PaymentRecord {
  id: string
  status: string
  amount: number | null
  currency: string | null
  payment_method?: string | null
  transaction_reference?: string | null
  lenco_reference?: string | null
  created_at: string
  updated_at?: string
}

export interface PaymentListResponse {
  results?: PaymentRecord[]
  [key: string]: unknown
}

export interface ApplicationWithDetails {
  id: string
  user_id?: string
  application_number: string
  full_name: string
  email: string
  phone?: string
  date_of_birth?: string
  sex?: string
  nrc_number?: string
  passport_number?: string
  residence_town?: string
  next_of_kin_name?: string
  program: string
  intake: string
  institution?: string
  application_fee?: number
  payment_status?: string
  payment_verified_at?: string | null
  payment_verified_by_name?: string | null
  payment_verified_by_email?: string | null
  last_payment_audit_at?: string | null
  last_payment_audit_by_name?: string | null
  last_payment_audit_by_email?: string | null
  last_payment_audit_notes?: string | null
  last_payment_reference?: string | null
  status: string
  submitted_at?: string
  created_at?: string
  updated_at?: string
  result_slip_url?: string
  extra_kyc_url?: string
  admin_feedback?: string
  admin_feedback_date?: string | null
  admin_feedback_by?: string | null
  review_started_at?: string
  decision_date?: string
  total_subjects?: number
  points?: number
  grades_summary?: string
  interview?: ApplicationInterview | null
  intake_capacity?: number | null
  intake_enrollment?: number | null
  assigned_reviewer_id?: string | null
  assigned_reviewer_name?: string | null
  is_late_submission?: boolean
  fee_waiver?: { waiver_type: string; reason_code: string; discount_percentage: number } | null
  pending_amendments?: Array<{ id: string; field_name: string; new_value: string; reason: string; status: string; created_at: string }> | null
}

export interface StatusHistoryItem {
  id?: string
  status?: string
  old_status?: string | null
  new_status?: string | null
  changed_by?: string | null
  changed_by_name?: string | null
  notes?: string
  created_at: string
  changed_by_profile?: {
    email: string
    full_name?: string
  }
}

export interface DocumentItem {
  id: string
  document_type: string
  document_name: string
  file_url: string
  file_size?: number
  mime_type?: string
  verification_status: string
  verified_by?: string
  verified_at?: string
  verification_notes?: string
  system_generated: boolean
  created_at?: string
  uploaded_at?: string
  ecz_exam_number?: string
  ecz_exam_year?: string | number
}

export interface Grade {
  subject_id: string
  grade: number
  subject_name?: string
}

export interface ApplicationDetailResponse {
  application: ApplicationWithDetails
  grades?: Grade[]
  statusHistory?: StatusHistoryItem[]
  documents?: DocumentItem[]
  interview?: ApplicationInterview | null
}

// Institution code to name mapping
export const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Applied Sciences',
  'mihas': 'Mukuba Institute of Health and Applied Sciences'
}

export const getInstitutionName = (code?: string) => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}
