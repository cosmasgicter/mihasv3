import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabaseClient, UserProfile } from '@/lib/supabase'
import { sanitizeForDisplay } from '@/lib/sanitize'
import { secureDisplay } from '@/lib/secureDisplay'
import { sanitizeForLog } from '@/lib/security'

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
    console.warn('Error parsing signup data:', error)
  }

  return {}
}

async function createUserProfile(user: User): Promise<UserProfile | null> {
  try {
    const supabase = getSupabaseClient()
    const signupData = parseSignupData(user)
    const metadata = user.user_metadata || {}

    const fullName = metadata.full_name ||
      signupData.full_name ||
      user.email?.split('@')[0] ||
      'Student'

    const profileData = {
      user_id: user.id,
      full_name: sanitizeForDisplay(fullName),
      phone: sanitizeForDisplay(signupData.phone || metadata.phone || null),
      sex: signupData.sex || metadata.sex || null,
      date_of_birth: signupData.date_of_birth || metadata.date_of_birth || null,
      city: signupData.city || metadata.city || null,
      address: signupData.address || metadata.address || null,
      nationality: signupData.nationality || metadata.nationality || null,
      next_of_kin_name: signupData.next_of_kin_name || metadata.next_of_kin_name || null,
      next_of_kin_phone: signupData.next_of_kin_phone || metadata.next_of_kin_phone || null,
      role: 'student',
      email: user.email
    }

    const { data: newProfile, error } = await supabase
      .from('user_profiles')
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
    enabled,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      if (!user) return null

      const supabase = getSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token

      if (!accessToken) {
        return null
      }

      // Try direct Supabase query first (for students)
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
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
      if (!user) {
        throw new Error('User not authenticated')
      }

      const supabase = getSupabaseClient()

      const allowedFields = [
        'full_name',
        'phone',
        'role',
        'avatar_url',
        'bio',
        'date_of_birth',
        'sex',
        'nationality',
        'address',
        'city',
        'next_of_kin_name',
        'next_of_kin_phone'
      ]

      const sanitizedUpdates = Object.entries(updates).reduce((acc, [key, value]) => {
        if (typeof key !== 'string' || !allowedFields.includes(key)) {
          return acc
        }

        if (value === null || value === undefined) {
          acc[key] = value
          return acc
        }

        if (typeof value === 'string') {
          acc[key] = secureDisplay.text(value.trim())
        } else {
          acc[key] = value
        }

        return acc
      }, {} as Record<string, any>)

      const { data, error } = await supabase
        .from('user_profiles')
        .update(sanitizedUpdates)
        .eq('user_id', user.id)
        .select()
        .maybeSingle()

      if (error) {
        console.error('Database update error:', sanitizeForLog(error.message))
        throw error
      }

      if (!data) {
        throw new Error('Profile update failed')
      }

      return sanitizeProfile(data) as UserProfile
    },
    onSuccess: (data) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY(user?.id), data)
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
