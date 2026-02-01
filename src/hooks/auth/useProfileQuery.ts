import { useCallback, useMemo } from 'react'
import { logger } from '@/lib/logger'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient, isSupabaseConfigured, SUPABASE_MISSING_CONFIG_MESSAGE, UserProfile } from '@/lib/supabase'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { sanitizeForLog } from '@/lib/security'

/**
 * Helper for authenticated API calls using HTTP-only cookies
 */
async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

interface User {
  id: string
  email?: string
  user_metadata?: Record<string, any>
}

export interface UseProfileQueryOptions {
  user?: User | null
  enabled?: boolean
}

type ProfileUpdate = Partial<UserProfile>

type ProfileQueryResult = {
  profile: UserProfile | null
  isLoading: boolean
  isFetching: boolean
  error: unknown
  refetch: () => Promise<any>
  updateProfile: (updates: ProfileUpdate) => Promise<UserProfile>
  updatingProfile: boolean
  updateError: unknown
}

const PROFILE_QUERY_KEY = (userId?: string | null) => ['user-profile', userId]

function sanitizeProfile(data: any | null): UserProfile | null {
  if (!data) return null

  return Object.entries(data).reduce((acc, [key, value]) => {
    (acc as any)[key] = typeof value === 'string'
      ? sanitizeForDisplay(value)
      : value
    return acc
  }, {} as UserProfile)
}

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
  }

  return {}
}

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

export function useProfileQuery(options: UseProfileQueryOptions = {}): ProfileQueryResult {
  const { user: contextUser } = useAuth()
  const user = options.user ?? contextUser
  const enabled = options.enabled ?? Boolean(user?.id)
  const queryClient = useQueryClient()

  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY(user?.id),
    enabled: enabled && Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user?.id) {
        console.warn('[ProfileQuery] No user ID available')
        return null
      }

      if (!isSupabaseConfigured) {
        return null
      }

      const supabase = getSupabaseClient()
      
      // Check session via cookie-based auth
      const sessionResponse = await authFetch('/api/auth?action=session')
      
      if (!sessionResponse.ok) {
        logger.log('[ProfileQuery] No valid session')
        return null
      }
      
      logger.log('[ProfileQuery] Fetching profile for user:', user.id)

      // Try direct Supabase query first (for students)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (profileError) {
        console.error('Profile query error:', profileError)
        throw new Error('Failed to load profile')
      }

      if (!profileData) {
        return await createUserProfile(user)
      }

      return sanitizeProfile(profileData)
    }
  })

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: ProfileUpdate) => {
      if (!user?.id) {
        throw new Error('User not authenticated or user ID missing')
      }

      if (!isSupabaseConfigured) {
        throw new Error(SUPABASE_MISSING_CONFIG_MESSAGE)
      }

      const supabase = getSupabaseClient()

      const allowedFields = [
        'full_name',
        'phone',
        'date_of_birth',
        'sex',
        'residence_town',
        'nationality',
        'next_of_kin_name',
        'next_of_kin_phone'
      ]

      const sanitizedUpdates: Record<string, any> = {}

      for (const [key, value] of Object.entries(updates)) {
        // Only process allowed fields
        if (!allowedFields.includes(key)) {
          continue
        }

        // Skip undefined values
        if (value === undefined) {
          continue
        }

        // Handle null or empty string
        if (value === null || value === '') {
          sanitizedUpdates[key] = null
          continue
        }

        // Handle string values
        if (typeof value === 'string') {
          const trimmed = value.trim()
          // Basic sanitization - remove dangerous characters
          const cleaned = trimmed.replace(/[<>]/g, '')
          sanitizedUpdates[key] = cleaned === '' ? null : cleaned
        } else {
          sanitizedUpdates[key] = value
        }
      }

      // Ensure we have at least one field to update
      if (Object.keys(sanitizedUpdates).length === 0) {
        throw new Error('No valid fields to update')
      }

      logger.log('Attempting to update profile for user:', user.id)
      logger.log('Sanitized updates:', sanitizedUpdates)

      const { data, error } = await supabase
        .from('profiles')
        .update(sanitizedUpdates)
        .eq('id', user.id)
        .select()
        .maybeSingle()

      if (error) {
        console.error('Database update error:', error)
        throw new Error(`Database error: ${error.message || 'Unknown error'}`)
      }

      if (!data) {
        throw new Error('Profile update returned no data. The profile may not exist.')
      }

      logger.log('Profile updated successfully:', data)

      return sanitizeProfile(data) as UserProfile
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY(user?.id), data)
      await queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY(user?.id) })
    }
  })

  const updateProfile = useCallback(async (updates: ProfileUpdate) => {
    const result = await updateProfileMutation.mutateAsync(updates)
    return result
  }, [updateProfileMutation])

  return useMemo(() => ({
    profile: profileQuery.data ?? null,
    isLoading: profileQuery.isLoading,
    isFetching: profileQuery.isFetching,
    error: profileQuery.error,
    refetch: profileQuery.refetch,
    updateProfile,
    updatingProfile: updateProfileMutation.isPending,
    updateError: updateProfileMutation.error
  }), [
    profileQuery.data,
    profileQuery.isLoading,
    profileQuery.isFetching,
    profileQuery.error,
    profileQuery.refetch,
    updateProfile,
    updateProfileMutation.isPending,
    updateProfileMutation.error
  ])
}
