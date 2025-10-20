import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { sanitizeForLog, sanitizeUrl } from './security'

// Supabase project configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const passwordResetRedirectOverride = import.meta.env
  .VITE_SUPABASE_PASSWORD_RESET_REDIRECT as string | undefined
const appBaseUrl = import.meta.env.VITE_APP_BASE_URL as string | undefined

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const SUPABASE_STATUS_EVENT = 'mihas:supabase-status'

export interface SupabaseStatusDetail {
  available: boolean
  message?: string
}

export const SUPABASE_MISSING_CONFIG_MESSAGE =
  'Supabase environment variables are missing. Authentication features are disabled in this build.'

const PASSWORD_RESET_PATH = '/auth/reset-password'

function appendPasswordResetPath(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) {
    return undefined
  }

  const trimmed = baseUrl.trim()
  if (!trimmed) {
    return undefined
  }

  const sanitizedBase = sanitizeUrl(trimmed)
  if (!sanitizedBase) {
    return undefined
  }

  try {
    const url = new URL(sanitizedBase)
    if (url.pathname === PASSWORD_RESET_PATH) {
      return sanitizeUrl(url.toString()) ?? undefined
    }

    url.pathname = PASSWORD_RESET_PATH
    url.search = ''
    url.hash = ''

    return sanitizeUrl(url.toString()) ?? undefined
  } catch {
    return undefined
  }
}

export function getPasswordResetRedirectUrl(): string | undefined {
  if (passwordResetRedirectOverride) {
    const override = sanitizeUrl(passwordResetRedirectOverride.trim())
    if (override) {
      return override
    }
  }

  const candidates: Array<string | undefined> = [appBaseUrl]

  if (typeof window !== 'undefined') {
    candidates.push(window.location.origin)
  }

  for (const candidate of candidates) {
    const redirectUrl = appendPasswordResetPath(candidate)
    if (redirectUrl) {
      return redirectUrl
    }
  }

  return undefined
}

function resolveSupabaseConfig() {
  if (!isSupabaseConfigured) {
    throw new Error(SUPABASE_MISSING_CONFIG_MESSAGE)
  }

  return {
    url: supabaseUrl as string,
    anonKey: supabaseAnonKey as string
  }
}

const AUTH_STORAGE_KEY = 'mihas-auth-token'

type SupabaseFactoryOptions = {
  storage?: SupportedStorage
}

let supabaseClient: SupabaseClient | null = null
let usingServerStorage = false
let authHandlersInitialized = false
let sessionInterval: NodeJS.Timeout | null = null
let refreshRetryCount = 0

const MAX_REFRESH_RETRIES = 3

function createMemoryStorage(): SupportedStorage {
  const store = new Map<string, string>()

  return {
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value)
    },
    removeItem: key => {
      store.delete(key)
    },
    isServer: true
  }
}

function resolveStorage(adapter?: SupportedStorage) {
  if (adapter) {
    return { storage: adapter, isServerStorage: adapter.isServer === true }
  }

  if (typeof window !== 'undefined' && window.localStorage) {
    return { storage: window.localStorage, isServerStorage: false }
  }

  const memoryStorage = createMemoryStorage()
  return { storage: memoryStorage, isServerStorage: true }
}

export function createSupabaseClient(options: SupabaseFactoryOptions = {}): SupabaseClient {
  const { url, anonKey } = resolveSupabaseConfig()
  const { storage, isServerStorage } = resolveStorage(options.storage)
  const shouldRecreateClient =
    !supabaseClient || (!isServerStorage && usingServerStorage)

  if (shouldRecreateClient) {
    if (sessionInterval) {
      clearInterval(sessionInterval)
      sessionInterval = null
    }

    supabaseClient = createClient(url, anonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        storage,
        storageKey: AUTH_STORAGE_KEY,
        debug: true
      },
      realtime: {
        params: {
          eventsPerSecond: 2
        }
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
          
          // Skip realtime connections in development to prevent WebSocket errors
          if (sanitizedUrl.includes('/realtime/') && import.meta.env.DEV) {
            return Promise.reject(new Error('Realtime disabled in development'))
          }
          
          return fetch(sanitizedUrl, options)
        }
      }
    })

    usingServerStorage = isServerStorage
    authHandlersInitialized = false
    refreshRetryCount = 0
  }

  if (typeof window !== 'undefined' && supabaseClient && !authHandlersInitialized) {
    initializeBrowserAuthHandlers(supabaseClient, storage)
  }

  return supabaseClient!
}

export const getSupabaseClient = createSupabaseClient

function initializeBrowserAuthHandlers(client: SupabaseClient, storage: SupportedStorage) {
  if (authHandlersInitialized || typeof window === 'undefined') {
    return
  }

  // Auth state changes are handled by useSessionListener hook
  // Removed duplicate listener to prevent race conditions
  
  authHandlersInitialized = true
}

// Session monitoring with retry logic
function startSessionMonitoring(client: SupabaseClient) {
  if (typeof window === 'undefined') {
    return
  }

  if (sessionInterval) clearInterval(sessionInterval)

  sessionInterval = setInterval(async () => {
    try {
      const { data: { session }, error } = await client.auth.getSession()

      if (!session || error) return

      const timeUntilExpiry = (session.expires_at! * 1000) - Date.now()
      const fiveMinutes = 5 * 60 * 1000

      if (timeUntilExpiry < fiveMinutes && timeUntilExpiry > 0) {
        await retryTokenRefresh(client)
      }
    } catch (error) {
    }
  }, 60000)
}

async function retryTokenRefresh(client: SupabaseClient) {
  for (let i = 0; i < MAX_REFRESH_RETRIES; i++) {
    try {
      const { error } = await client.auth.refreshSession()
      if (!error) {
        return
      }
    } catch (error) {
    }

    if (i < MAX_REFRESH_RETRIES - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1))) // Exponential backoff
    }
  }
  console.error('All token refresh attempts failed')
}

export const supabase = new Proxy({}, {
  get(_target, prop) {
    const client = createSupabaseClient()
    const value = (client as any)[prop]
    if (typeof value === 'function') {
      return value.bind(client)
    }
    return value
  },
  set(_target, prop, value) {
    const client = createSupabaseClient()
    (client as any)[prop] = value
    return true
  }
}) as SupabaseClient

// Database type definitions (keeping existing types)
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
