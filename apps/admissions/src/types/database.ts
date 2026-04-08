/**
 * Centralized database type definitions.
 *
 * These interfaces were extracted into a dedicated shared types module
 * so every frontend file can import from `@/types/database`.
 * Shapes match the existing interfaces exactly.
 */

export interface Application {
  id: string;
  user_id: string;
  application_number?: string;
  tracking_code?: string;
  status: string;
  program?: string;
  intake?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  nrc?: string;
  nrc_number?: string;
  date_of_birth?: string;
  gender?: string;
  sex?: 'Male' | 'Female' | (string & {});
  nationality?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  residence_town?: string;
  guardian_name?: string;
  guardian_phone?: string;
  result_slip_url?: string;
  extra_kyc_url?: string;
  /** @deprecated Legacy field — kept for backward compat with existing DB rows */
  pop_url?: string;
  payment_reference?: string;
  /** @deprecated Use payments table data instead */
  payment_method?: string;
  /** @deprecated Use payments table data instead */
  paid_amount?: string | number;
  /** @deprecated Use payments table data instead */
  amount?: string | number;
  application_fee?: string | number;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  payment_status?: string;
  payment_verified_at?: string;
  payment_verified_by?: string | null;
  payment_verified_by_name?: string | null;
  payment_verified_by_email?: string | null;
  last_payment_audit_id?: string | null;
  last_payment_audit_at?: string | null;
  last_payment_audit_by_name?: string | null;
  last_payment_audit_by_email?: string | null;
  last_payment_audit_notes?: string | null;
  last_payment_reference?: string | null;
  review_started_at?: string;
  decision_date?: string;
  decision_reason?: string;
  admin_feedback?: string;
  [key: string]: unknown;
}

export interface ApplicationInterview {
  id: string;
  application_id: string;
  scheduled_at: string;
  mode: 'in_person' | 'virtual' | 'phone';
  location?: string | null;
  interviewer_id?: string;
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled';
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  /** Legacy field aliases for backward compatibility */
  scheduled_date?: string;
  scheduled_time?: string;
}

export interface Program {
  id: string;
  name: string;
  code?: string;
  description?: string;
  duration_months?: number;
  institution_id?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Intake {
  id: string;
  name: string;
  start_date?: string;
  end_date?: string;
  application_deadline?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserProfile {
  id: string;
  user_id?: string;
  email: string;
  role: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  date_of_birth?: string;
  sex?: string;
  residence_town?: string;
  nationality?: string;
  next_of_kin_name?: string;
  next_of_kin_phone?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  avatar_url?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  [key: string]: unknown;
}

export interface Subject {
  id: string;
  name: string;
  code?: string;
  category?: string;
  is_active?: boolean;
}

export interface ApplicationDocument {
  id: string;
  application_id: string;
  document_type: string;
  file_path?: string;
  file_url?: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationGrade {
  id: string;
  application_id: string;
  subject_id: string;
  grade: string;
  points?: number;
  created_at?: string;
  updated_at?: string;
}

export interface ApplicationWithDetails extends Application {
  programs?: Program;
  intakes?: Intake;
  documents?: ApplicationDocument[];
  interview?: ApplicationInterview;
}

export interface Institution {
  id: string;
  slug?: string;
  name: string;
  full_name?: string;
  description?: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}
