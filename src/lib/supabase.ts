import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sanitizeUrl } from './security'

// Supabase project configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const SUPABASE_STATUS_EVENT = 'mihas:supabase-status'

export interface SupabaseStatusDetail {
  available: boolean
  message?: string
}

export const SUPABASE_MISSING_CONFIG_MESSAGE =
  'Supabase environment variables are missing. Database features are disabled in this build.'

function resolveSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_MISSING_CONFIG_MESSAGE)
  }

  return {
    url: supabaseUrl as string,
    anonKey: supabaseAnonKey as string
  }
}

let supabaseClient: SupabaseClient | null = null

/**
 * Create or return the Supabase client
 * 
 * NOTE: This client is now used ONLY for:
 * - Supabase Storage (file uploads)
 * - Direct database queries (when needed)
 * 
 * Authentication is handled by HTTP-only cookies via /api/auth endpoints.
 * Do NOT use supabase.auth.* methods - use the custom auth API instead.
 */
export function createSupabaseClient(): SupabaseClient {
  if (supabaseClient) {
    return supabaseClient
  }

  const { url, anonKey } = resolveSupabaseConfig()

  supabaseClient = createClient(url, anonKey, {
    auth: {
      // Disable Supabase Auth SDK - we use custom JWT auth with HTTP-only cookies
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        'x-client-info': 'mihas-app@1.0.0'
      },
      fetch: (url, options = {}) => {
        // Validate URL to prevent SSRF attacks
        const sanitizedUrl = sanitizeUrl(url)
        if (!sanitizedUrl) {
          return Promise.reject(new Error('Invalid URL rejected for security'))
        }
        
        return fetch(sanitizedUrl, options)
      }
    }
  })

  return supabaseClient
}

export const getSupabaseClient = createSupabaseClient

/**
 * Proxy for backward compatibility
 * Allows using `supabase.from()`, `supabase.storage`, etc.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = createSupabaseClient();
    const propValue = (client as any)[prop];
    if (typeof propValue === 'function') {
      return propValue.bind(client);
    }
    return propValue;
  },
  set(_target, prop, newValue) {
    const client = createSupabaseClient();
    (client as any)[prop] = newValue;
    return true;
  }
});

// ============================================================================
// Database Type Definitions
// ============================================================================

export interface UserProfile {
  id: string
  user_id: string
  full_name?: string
  email?: string
  phone?: string
  role: string
  date_of_birth?: string
  sex?: string
  nationality?: string
  address?: string
  city?: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  avatar_url?: string
  bio?: string
  created_at: string
  updated_at: string
  [key: string]: unknown
}

export interface Institution {
  id: string
  slug: string
  name: string
  full_name: string
  description?: string
  logo_url?: string
  contact_email?: string
  contact_phone?: string
  address?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Program {
  id: string
  name: string
  description?: string
  duration_years: number
  department?: string
  qualification_level?: string
  entry_requirements?: string
  fees_per_year?: number
  institution_id: string
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Intake {
  id: string
  name: string
  year: number
  semester?: string
  start_date: string
  end_date: string
  application_deadline: string
  total_capacity: number
  available_spots: number
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface Application {
  id: string
  application_number: string
  user_id: string
  
  // Step 1: Basic KYC
  full_name: string
  nrc_number?: string
  passport_number?: string
  date_of_birth: string
  sex: 'Male' | 'Female'
  phone: string
  email: string
  residence_town: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  program: 'Clinical Medicine' | 'Environmental Health' | 'Registered Nursing'
  intake: string
  institution: 'KATC' | 'MIHAS'
  
  // Step 2: Education & Documents
  result_slip_url?: string
  extra_kyc_url?: string
  
  // Step 3: Payment
  application_fee: number
  payment_method?: string
  payer_name?: string
  payer_phone?: string
  amount?: number
  paid_at?: string
  momo_ref?: string
  pop_url?: string
  payment_status: 'pending_review' | 'verified' | 'rejected'
  payment_verified_at?: string | null
  payment_verified_by?: string | null

  // Step 4: Status tracking
  status: 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected'
  submitted_at?: string
  
  // Tracking
  public_tracking_code?: string
  created_at: string
  updated_at: string
  
  // Admin fields
  reviewed_by?: string
  reviewed_at?: string
  review_started_at?: string
  review_notes?: string
  decision_reason?: string
  decision_date?: string
}

export interface ApplicationDocument {
  id: string
  application_id: string
  document_type: string
  document_name: string
  file_url: string
  file_size?: number
  mime_type?: string
  system_generated: boolean
  verification_status: 'pending' | 'verified' | 'rejected'
  verified_by?: string
  verified_at?: string
  verification_notes?: string
  uploaded_at: string
  created_at: string
  updated_at: string
}

export interface ApplicationInterview {
  id: string
  application_id: string
  scheduled_at: string
  mode: 'in_person' | 'virtual' | 'phone'
  location?: string | null
  status: 'scheduled' | 'rescheduled' | 'completed' | 'cancelled'
  notes?: string | null
  created_by?: string | null
  updated_by?: string | null
  created_at: string
  updated_at: string
}

export interface ApplicationWithDetails extends Application {
  programs?: Program
  intakes?: Intake
  documents?: ApplicationDocument[]
  interview?: ApplicationInterview | null
}

// Legacy type alias - use Subject instead
export interface Grade12Subject {
  id: string
  name: string
  code?: string
  is_active: boolean
  created_at: string
}

// Preferred: Use Subject type
export type Subject = Grade12Subject

export interface ApplicationGrade {
  id: string
  application_id: string
  subject_id: string
  grade: number
  created_at: string
}

export interface UserRole {
  id: string
  user_id: string
  role: string
  permissions: string[]
  department?: string
  assigned_by?: string
  is_active: boolean
  assigned_at: string
  created_at: string
  updated_at: string
}

export interface SystemSetting {
  id: string
  setting_key: string
  setting_value?: string
  setting_type: string
  description?: string
  is_public: boolean
  updated_by?: string
  created_at: string
  updated_at: string
}

export interface ApplicationDraft {
  id: string
  user_id: string
  form_data: Record<string, any>
  uploaded_files: any[]
  current_step: number
  version: number
  is_offline_sync: boolean
  created_at: string
  updated_at: string
}
