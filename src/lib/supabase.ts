import { createClient, type SupabaseClient, type SupportedStorage } from '@supabase/supabase-js'
import { sanitizeForLog } from './security'

// Supabase project configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
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
  const { storage, isServerStorage } = resolveStorage(options.storage)
  const shouldRecreateClient =
    !supabaseClient || (!isServerStorage && usingServerStorage)

  if (shouldRecreateClient) {
    if (sessionInterval) {
      clearInterval(sessionInterval)
      sessionInterval = null
    }

    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
        storage,
        storageKey: AUTH_STORAGE_KEY,
        debug: false
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
          // Skip realtime connections in development to prevent WebSocket errors
          if (url.includes('/realtime/') && import.meta.env.DEV) {
            return Promise.reject(new Error('Realtime disabled in development'))
          }
          
          // Longer timeout for auth requests
          const isAuthRequest = url.includes('/auth/') || url.includes('/token')
          const timeout = isAuthRequest ? 30000 : 8000

          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)

          return fetch(url, {
            ...options,
            signal: controller.signal
          }).finally(() => {
            clearTimeout(timeoutId)
          })
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

  client.auth.onAuthStateChange(async (event, session) => {
    console.log('Auth event:', sanitizeForLog(event))

    if (event === 'TOKEN_REFRESHED') {
      console.log('Token refreshed successfully')
      refreshRetryCount = 0
    }

    if (event === 'SIGNED_OUT') {
      console.log('User signed out')
      await Promise.resolve(storage.removeItem(AUTH_STORAGE_KEY))
    }

    if (event === 'SIGNED_IN' && session) {
      console.log('User signed in:', sanitizeForLog(session.user?.id || ''))
      startSessionMonitoring(client)
    }
  })

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
      console.warn('Session check failed:', error)
    }
  }, 60000)
}

async function retryTokenRefresh(client: SupabaseClient) {
  for (let i = 0; i < MAX_REFRESH_RETRIES; i++) {
    try {
      const { error } = await client.auth.refreshSession()
      if (!error) {
        console.log('Token refresh successful')
        return
      }
      console.warn(`Token refresh attempt ${i + 1} failed:`, error.message)
    } catch (error) {
      console.warn(`Token refresh attempt ${i + 1} error:`, error)
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
  interview_date: string
  interview_time: string
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

export interface Grade12Subject {
  id: string
  name: string
  code?: string
  is_active: boolean
  created_at: string
}

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
