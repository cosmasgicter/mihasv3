export interface PublicApplicationStatus {
  public_tracking_code: string
  application_number: string
  status: string
  payment_status: string | null
  submitted_at: string | null
  updated_at: string | null
  program_name: string | null
  intake_name: string | null
  institution: string | null
  institution_name?: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  nationality?: string | null
  admin_feedback?: string | null
  admin_feedback_date?: string | null
}

export type ApplicationSlipData = PublicApplicationStatus & {
  email: string
  userId?: string
  application_id?: string
  slip_url?: string
  slip_document_reference?: string
}
