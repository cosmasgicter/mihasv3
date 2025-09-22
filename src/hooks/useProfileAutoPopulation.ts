import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useProfileQuery } from '@/hooks/auth/useProfileQuery'

// Helper function to safely get user metadata
export const getUserMetadata = (user: any) => {
  if (!user?.user_metadata) return {}
  
  try {
    const metadata = user.user_metadata
    let signupData = {}
    
    if (metadata.signup_data) {
      signupData = typeof metadata.signup_data === 'string' 
        ? JSON.parse(metadata.signup_data) 
        : metadata.signup_data
    }
    
    return {
      full_name: metadata.full_name || signupData.full_name,
      phone: metadata.phone || signupData.phone,
      city: metadata.city || signupData.city,
      sex: metadata.sex || signupData.sex,
      date_of_birth: metadata.date_of_birth || signupData.date_of_birth,
      next_of_kin_name: metadata.next_of_kin_name || signupData.next_of_kin_name,
      next_of_kin_phone: metadata.next_of_kin_phone || signupData.next_of_kin_phone,
      address: metadata.address || signupData.address,
      nationality: metadata.nationality || signupData.nationality
    }
  } catch (error) {
    console.warn('Error parsing user metadata:', error)
    return {}
  }
}

// Get the best available value from profile and metadata
export const getBestValue = (profileValue: any, metadataValue: any, fallback = '') => {
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
export const calculateProfileCompletion = (profile: any, metadata: any) => {
  const fields = [
    'full_name', 'phone', 'date_of_birth', 'sex', 
    'city', 'nationality', 'address'
  ]
  
  let completedFields = 0
  
  fields.forEach(field => {
    const value = getBestValue(profile?.[field], metadata?.[field], '')
    if (value && value !== 'Not provided') {
      completedFields++
    }
  })
  
  return Math.round((completedFields / fields.length) * 100)
}

// Hook for auto-populating form fields
export const useProfileAutoPopulation = (setValue?: any) => {
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
        const dateOfBirth = getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
        const sex = getBestValue(profile?.sex, metadata.sex, '')
        const residenceTown = getBestValue(profile?.city || profile?.address, metadata.city, '')
        const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
        const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')
        
        // Set values with validation
        if (email) setValue('email', email)
        if (fullName) setValue('full_name', fullName)
        if (phone) setValue('phone', phone)
        if (dateOfBirth) setValue('date_of_birth', dateOfBirth)
        if (sex && (sex === 'Male' || sex === 'Female')) setValue('sex', sex)
        if (residenceTown) setValue('residence_town', residenceTown)
        if (nextOfKinName) setValue('next_of_kin_name', nextOfKinName)
        if (nextOfKinPhone) setValue('next_of_kin_phone', nextOfKinPhone)
        
        // Additional fields for settings
        const nationality = getBestValue(profile?.nationality, metadata.nationality, '')
        const address = getBestValue(profile?.address, metadata.address, '')
        
        if (nationality) setValue('nationality', nationality)
        if (address) setValue('address', address)
        
        console.log('Profile auto-population completed:', {
          hasProfile: !!profile,
          hasMetadata: Object.keys(metadata).length > 0
        })
      } catch (error) {
        console.error('Error in profile auto-population:', error)
      }
    }
  }, [user?.id, profile?.id, setValue])
  
  const metadata = getUserMetadata(user)
  const completionPercentage = calculateProfileCompletion(profile, metadata)
  
  return { 
    user, 
    profile, 
    metadata, 
    completionPercentage,
    hasAutoPopulatedData: completionPercentage > 0
  }
}