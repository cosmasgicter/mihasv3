import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'
import type { User, UserProfile } from '@/types/auth'
import {
  calculateCanonicalProfileCompletion,
  getMissingProfileFields,
  getCanonicalResidenceCountry,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
} from '@/lib/profileFieldMapping'

interface UserMetadata {
  full_name?: string
  first_name?: string
  last_name?: string
  email?: string
  phone?: string
  residence_town?: string
  residence_country?: string
  country?: string
  city?: string
  sex?: string
  date_of_birth?: string
  nrc_number?: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  address?: string
  nationality?: string
}

// Helper function to safely get user metadata
export const getUserMetadata = (user: User | null | undefined): UserMetadata => {
  if (!user) return {}
  
  // Start with the user's direct email as a baseline
  const result: UserMetadata = {}
  if (user.email) {
    result.email = user.email
  }
  
  if (!user.user_metadata) return result
  
  try {
    const metadata = user.user_metadata as Record<string, unknown>
    let signupData: Record<string, unknown> = {}
    
    if (metadata.signup_data) {
      signupData = typeof metadata.signup_data === 'string' 
        ? JSON.parse(metadata.signup_data) as Record<string, unknown>
        : metadata.signup_data as Record<string, unknown>
    }
    
    return {
      full_name: (metadata.full_name as string | undefined) || (signupData.full_name as string | undefined),
      first_name: (metadata.first_name as string | undefined) || (signupData.first_name as string | undefined),
      last_name: (metadata.last_name as string | undefined) || (signupData.last_name as string | undefined),
      email: (metadata.email as string | undefined) || (signupData.email as string | undefined),
      phone: (metadata.phone as string | undefined) || (signupData.phone as string | undefined),
      residence_town: (metadata.residence_town as string | undefined) || (signupData.residence_town as string | undefined),
      residence_country:
        (metadata.residence_country as string | undefined) ||
        (metadata.country as string | undefined) ||
        (signupData.residence_country as string | undefined) ||
        (signupData.country as string | undefined),
      country:
        (metadata.country as string | undefined) ||
        (metadata.residence_country as string | undefined) ||
        (signupData.country as string | undefined) ||
        (signupData.residence_country as string | undefined),
      city: (metadata.city as string | undefined) || (signupData.city as string | undefined),
      sex: (metadata.sex as string | undefined) || (signupData.sex as string | undefined),
      date_of_birth: (metadata.date_of_birth as string | undefined) || (signupData.date_of_birth as string | undefined),
      nrc_number: (metadata.nrc_number as string | undefined) || (signupData.nrc_number as string | undefined),
      next_of_kin_name: (metadata.next_of_kin_name as string | undefined) || (signupData.next_of_kin_name as string | undefined),
      next_of_kin_phone: (metadata.next_of_kin_phone as string | undefined) || (signupData.next_of_kin_phone as string | undefined),
      address: (metadata.address as string | undefined) || (signupData.address as string | undefined),
      nationality: (metadata.nationality as string | undefined) || (signupData.nationality as string | undefined)
    }
  } catch {
    return {}
  }
}

// Get the best available value from profile and metadata
export const getBestValue = (profileValue: unknown, metadataValue: unknown, fallback = ''): string => {
  // Return the first non-empty, non-null, non-undefined value
  if (profileValue && typeof profileValue === 'string' && profileValue.trim() !== '' && profileValue !== 'Not provided') {
    return profileValue.trim()
  }
  if (metadataValue && typeof metadataValue === 'string' && metadataValue.trim() !== '' && metadataValue !== 'Not provided') {
    return metadataValue.trim()
  }
  return fallback
}

// Calculate profile completion percentage
export const calculateProfileCompletion = (profile: UserProfile | null | undefined, metadata: UserMetadata): number => {
  return calculateCanonicalProfileCompletion(profile, metadata)
}

// Get list of missing required profile fields
export const getProfileMissingFields = (profile: UserProfile | null | undefined, metadata: UserMetadata): { key: string; label: string }[] => {
  return getMissingProfileFields(profile, metadata)
}

type SetValueFn = (field: string, value: string) => void

// Hook for auto-populating form fields
export const useProfileAutoPopulation = (setValue?: SetValueFn) => {
  const { user } = useAuth()
  const { profile } = useProfileQuery()
  
  useEffect(() => {
    if (user && setValue && typeof setValue === 'function') {
      try {
        const metadata = getUserMetadata(user)
        
        // Auto-populate form fields with best available data
        const email = user.email || ''
        const fullName = getBestValue(profile?.full_name, metadata.full_name, email.split('@')[0] || '')
        const phone = getBestValue(profile?.phone, metadata.phone, '')
        const dateOfBirth = normalizeDateInputValue(
          getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
        )
        const sex = getBestValue(profile?.sex, metadata.sex, '')
        const residenceTown = getCanonicalResidenceTown(profile, metadata)
        const residenceCountry = getCanonicalResidenceCountry(profile, metadata)
        const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
        const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')
        
        // Set values with validation
        if (email) setValue('email', email)
        if (fullName) setValue('full_name', fullName)
        if (phone) setValue('phone', phone)
        if (dateOfBirth) setValue('date_of_birth', dateOfBirth)
        if (sex && (sex === 'Male' || sex === 'Female')) setValue('sex', sex)
        if (residenceTown) setValue('residence_town', residenceTown)
        if (residenceCountry) setValue('country', residenceCountry)
        if (nextOfKinName) setValue('next_of_kin_name', nextOfKinName)
        if (nextOfKinPhone) setValue('next_of_kin_phone', nextOfKinPhone)
        
        // Additional fields for settings
        const nationality = getBestValue(profile?.nationality, metadata.nationality, '')
        const address = getBestValue(profile?.address, metadata.address, '')
        
        if (nationality) setValue('nationality', nationality)
        if (address) setValue('address', address)
      } catch (error) {
        console.error('Error in profile auto-population:', error)
      }
    }
  }, [user?.id, profile?.id, profile?.country, setValue])
  
  const metadata = getUserMetadata(user)
  const completionPercentage = calculateProfileCompletion(profile, metadata)
  const missingFields = getProfileMissingFields(profile, metadata)
  
  return { 
    user, 
    profile, 
    metadata, 
    completionPercentage,
    missingFields,
    hasAutoPopulatedData: completionPercentage > 0
  }
}
