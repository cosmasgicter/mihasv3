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
  passport_number?: string
  next_of_kin_name?: string
  next_of_kin_phone?: string
  address?: string
  nationality?: string
}

// Extract user fields into a UserMetadata shape (Django sends top-level fields only)
export const getUserMetadata = (user: User | null | undefined): UserMetadata => {
  if (!user) return {}
  
  const result: UserMetadata = {}
  if (user.email) result.email = user.email
  if (user.full_name) result.full_name = user.full_name
  if (user.first_name) result.first_name = user.first_name
  if (user.last_name) result.last_name = user.last_name
  return result
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

export const normalizeSexForWizard = (value: unknown): 'Male' | 'Female' | '' => {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'male' || normalized === 'm') {
    return 'Male'
  }

  if (normalized === 'female' || normalized === 'f') {
    return 'Female'
  }

  return ''
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
        const sex = normalizeSexForWizard(getBestValue(profile?.sex, metadata.sex, ''))
        const residenceTown = getCanonicalResidenceTown(profile, metadata)
        const residenceCountry = getCanonicalResidenceCountry(profile, metadata)
        const nrcNumber = getBestValue(profile?.nrc_number, metadata.nrc_number, '')
        const passportNumber = getBestValue(profile?.passport_number, metadata.passport_number, '')
        const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
        const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')
        
        // Set values with validation
        if (email) setValue('email', email)
        if (fullName) setValue('full_name', fullName)
        if (phone) setValue('phone', phone)
        if (dateOfBirth) setValue('date_of_birth', dateOfBirth)
        if (sex) setValue('sex', sex)
        if (residenceTown) setValue('residence_town', residenceTown)
        if (residenceCountry) setValue('country', residenceCountry)
        if (nrcNumber) setValue('nrc_number', nrcNumber)
        if (passportNumber) setValue('passport_number', passportNumber)
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
  }, [
    user,
    profile?.id,
    profile?.full_name,
    profile?.email,
    profile?.phone,
    profile?.date_of_birth,
    profile?.sex,
    profile?.residence_town,
    profile?.country,
    profile?.nationality,
    profile?.next_of_kin_name,
    profile?.next_of_kin_phone,
    profile?.nrc_number,
    profile?.passport_number,
    profile?.address,
    setValue,
  ])
  
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
