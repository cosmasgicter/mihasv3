/**
 * Optimized Authentication Service
 * 
 * Implements parallel data fetching and caching strategies for login flow optimization.
 * Requirements: 4.2, 4.3, 4.4
 */

import { User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured, UserProfile } from '@/lib/supabase'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { sanitizeForLog } from '@/lib/security'
import { QueryClient } from '@tanstack/react-query'
import { preloadDashboardData } from './dashboardPreloader'

export interface OptimizedLoginResult {
  session: any
  user: User
  profile: UserProfile | null
  error?: never
}

export interface OptimizedLoginError {
  session?: never
  user?: never
  profile?: never
  error: string
}

export type OptimizedLoginResponse = OptimizedLoginResult | OptimizedLoginError

/**
 * Parse signup data from user metadata
 */
function parseSignupData(user: User) {
  const metadata = user.user_metadata || {}
  const rawSignupData = metadata.signup_data

  if (!rawSignupData) {
    return {}
  }

  try {
    if (typeof rawSignupData === 'string') {
      return JSON.parse(rawSignupData)
    }

    if (typeof rawSignupData === 'object') {
      return rawSignupData as Record<string, any>
    }
  } catch (error) {
    console.error('Error parsing signup data:', error)
  }

  return {}
}

/**
 * Sanitize profile data
 */
function sanitizeProfile(data: any | null): UserProfile | null {
  if (!data) return null

  return Object.entries(data).reduce((acc, [key, value]) => {
    (acc as any)[key] = typeof value === 'string'
      ? sanitizeForDisplay(value)
      : value
    return acc
  }, {} as UserProfile)
}

/**
 * Create user profile if it doesn't exist
 */
async function createUserProfile(user: User): Promise<UserProfile | null> {
  try {
    if (!isSupabaseConfigured) {
      return null
    }

    const supabase = getSupabaseClient()
    const signupData = parseSignupData(user)
    const metadata = user.user_metadata || {}

    const fullName = metadata.full_name ||
      signupData.full_name ||
      user.email?.split('@')[0] ||
      'Student'

    const profileData = {
      id: user.id,
      full_name: sanitizeForDisplay(fullName),
      phone: sanitizeForDisplay(signupData.phone || metadata.phone || null),
      date_of_birth: signupData.date_of_birth || metadata.date_of_birth || null,
      sex: signupData.sex || metadata.sex || null,
      residence_town: signupData.residence_town || metadata.residence_town || null,
      nationality: signupData.nationality || metadata.nationality || null,
      next_of_kin_name: signupData.next_of_kin_name || metadata.next_of_kin_name || null,
      next_of_kin_phone: signupData.next_of_kin_phone || metadata.next_of_kin_phone || null,
      role: 'student',
      email: user.email
    }

    const { data: newProfile, error } = await supabase
      .from('profiles')
      .insert(profileData)
      .select()
      .single()

    if (error) {
      console.error('Error creating profile:', sanitizeForLog(error.message))
      return null
    }

    return sanitizeProfile(newProfile)
  } catch (error) {
    console.error('Error creating user profile:', error)
    return null
  }
}

/**
 * Fetch user profile with error handling
 */
async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    if (!isSupabaseConfigured) {
      return null
    }

    const supabase = getSupabaseClient()
    
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) {
      console.error('Profile query error:', profileError)
      return null
    }

    if (!profileData) {
      // Profile doesn't exist, try to create it
      const user = (await supabase.auth.getUser()).data.user
      if (user) {
        return await createUserProfile(user)
      }
      return null
    }

    return sanitizeProfile(profileData)
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
}

/**
 * Track device session (non-blocking)
 */
function trackDeviceSession(accessToken: string): void {
  try {
    const deviceId = localStorage.getItem('device_id') || 
      (crypto?.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`)
    
    if (deviceId) {
      localStorage.setItem('device_id', deviceId)
    }
    
    // Fire and forget - don't await
    fetch('/api/sessions?action=track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        device_id: deviceId,
        device_info: navigator.userAgent
      })
    }).catch(() => {
      // Silent fail for session tracking
    })
  } catch (e) {
    // Silent fail for session tracking
  }
}

/**
 * Optimized login with parallel data fetching and dashboard preloading
 * 
 * This function:
 * 1. Authenticates the user
 * 2. Fetches user profile in parallel with session establishment
 * 3. Tracks device session (non-blocking)
 * 4. Preloads dashboard data (non-blocking)
 * 5. Returns all data in a single response
 * 
 * Requirements: 4.2, 4.3, 4.4
 */
export async function optimizedLogin(
  email: string,
  password: string,
  queryClient?: QueryClient
): Promise<OptimizedLoginResponse> {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase is not configured' }
  }

  try {
    const supabase = getSupabaseClient()
    
    // Step 1: Authenticate user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        return { error: 'Invalid email or password' }
      }
      if (error.message.includes('Email not confirmed')) {
        return { error: 'Please verify your email address before signing in' }
      }
      return { error: error.message }
    }

    if (!data.session || !data.user) {
      return { error: 'Unable to sign in. Please try again.' }
    }

    // Step 2: Fetch profile in parallel with session tracking (non-blocking)
    // This reduces sequential API calls by running profile fetch immediately
    const profilePromise = fetchUserProfile(data.user.id)
    
    // Step 3: Track device session (non-blocking - fire and forget)
    trackDeviceSession(data.session.access_token)
    
    // Step 4: Wait for profile fetch to complete
    const profile = await profilePromise

    // Step 5: Preload dashboard data (non-blocking - fire and forget)
    // This happens in the background while the user is being redirected
    if (queryClient && profile) {
      preloadDashboardData(queryClient, data.user.id, profile).catch(() => {
        // Silent fail - preloading is optional
      })
    }

    return {
      session: data.session,
      user: data.user,
      profile
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch')) {
        return { error: 'Network error. Please check your connection.' }
      }
      return { error: error.message }
    }
    return { error: 'An unexpected error occurred. Please try again.' }
  }
}

/**
 * Validate session and fetch profile in parallel
 * Used for session restoration on app load
 */
export async function validateSessionWithProfile(): Promise<{
  session: any | null
  user: User | null
  profile: UserProfile | null
}> {
  if (!isSupabaseConfigured) {
    return { session: null, user: null, profile: null }
  }

  try {
    const supabase = getSupabaseClient()
    
    // Fetch session and user in parallel
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error || !session?.user) {
      return { session: null, user: null, profile: null }
    }

    // Fetch profile
    const profile = await fetchUserProfile(session.user.id)

    return {
      session,
      user: session.user,
      profile
    }
  } catch (error) {
    console.error('Error validating session:', error)
    return { session: null, user: null, profile: null }
  }
}
