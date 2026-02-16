/**
 * Centralized database type definitions.
 *
 * These interfaces were extracted from the deprecated `src/lib/supabase.ts` stub
 * so that every frontend file can import types from `@/types/database` instead of
 * the Supabase module.  Shapes match the existing interfaces exactly.
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
  date_of_birth?: string;
  gender?: string;
  nationality?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postal_code?: string;
  result_slip_url?: string;
  created_at?: string;
  updated_at?: string;
  submitted_at?: string;
  payment_status?: string;
  payment_verified_at?: string;
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
