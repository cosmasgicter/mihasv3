import { useEffect } from 'react'
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form'
import { getBestValue, getUserMetadata, normalizeSexForWizard } from '@/hooks/useProfileAutoPopulation'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import {
  getCanonicalResidenceCountry,
  getCanonicalResidenceTown,
  normalizeDateInputValue,
} from '@/lib/profileFieldMapping'
import type { User } from '@/types/auth'
import type { WizardFormData } from '../../types'

interface ProfileShape {
  full_name?: string | null
  phone?: string | null
  date_of_birth?: string | null
  sex?: string | null
  residence_town?: string | null
  country?: string | null
  nationality?: string | null
  nrc_number?: string | null
  passport_number?: string | null
  next_of_kin_name?: string | null
  next_of_kin_phone?: string | null
}

interface UseWizardProfileAutoPopulateParams {
  user: User | null
  profile: ProfileShape | null | undefined
  authLoading: boolean
  restoringDraft: boolean
  draftLoaded: boolean
  getValues: UseFormGetValues<WizardFormData>
  setValue: UseFormSetValue<WizardFormData>
}

/**
 * Auto-populates wizard form fields from user profile/metadata when the form
 * is empty and no draft has been loaded yet.
 */
export function useWizardProfileAutoPopulate({
  user,
  profile,
  authLoading,
  restoringDraft,
  draftLoaded,
  getValues,
  setValue,
}: UseWizardProfileAutoPopulateParams) {
  useEffect(() => {
    if (user && !authLoading && !restoringDraft && !draftLoaded) {
      const metadata = getUserMetadata(user)
      const email = user.email || ''
      const setIfEmpty = (field: keyof WizardFormData, value: string) => {
        const normalizedValue = value.trim()
        if (!normalizedValue) return

        const currentValue = getValues(field)
        if (typeof currentValue === 'string' && currentValue.trim()) {
          return
        }

        setValue(field, normalizedValue as WizardFormData[typeof field], {
          shouldDirty: false,
          shouldTouch: false,
          shouldValidate: false,
        })
      }

      const fullName = getBestValue(profile?.full_name, metadata.full_name, email.split('@')[0] || '')
      const phone = getBestValue(profile?.phone, metadata.phone, '')
      const dateOfBirth = normalizeDateInputValue(
        getBestValue(profile?.date_of_birth, metadata.date_of_birth, '')
      )
      const sex = normalizeSexForWizard(getBestValue(profile?.sex, metadata.sex, ''))
      const residenceTown = getCanonicalResidenceTown(profile, metadata)
      const residenceCountry = getCanonicalResidenceCountry(profile, metadata)
      const nationality = getBestValue(profile?.nationality, metadata.nationality, 'Zambian')
      const nrcNumber = getBestValue(profile?.nrc_number, metadata.nrc_number, '')
      const passportNumber = getBestValue(profile?.passport_number, metadata.passport_number, '')
      const nextOfKinName = getBestValue(profile?.next_of_kin_name, metadata.next_of_kin_name, '')
      const nextOfKinPhone = getBestValue(profile?.next_of_kin_phone, metadata.next_of_kin_phone, '')

      setIfEmpty('email', email)
      setIfEmpty('full_name', fullName)
      setIfEmpty('phone', phone)
      setIfEmpty('date_of_birth', dateOfBirth)
      setIfEmpty('sex', sex)
      setIfEmpty('residence_town', normalizeResidenceTown(residenceTown))
      setIfEmpty('country', residenceCountry)
      setIfEmpty('nationality', nationality)
      setIfEmpty('nrc_number', nrcNumber)
      setIfEmpty('passport_number', passportNumber)
      setIfEmpty('next_of_kin_name', nextOfKinName)
      setIfEmpty('next_of_kin_phone', nextOfKinPhone)
    }
  }, [
    user,
    profile?.full_name,
    profile?.phone,
    profile?.date_of_birth,
    profile?.sex,
    profile?.residence_town,
    profile?.country,
    profile?.nationality,
    profile?.nrc_number,
    profile?.passport_number,
    profile?.next_of_kin_name,
    profile?.next_of_kin_phone,
    authLoading,
    draftLoaded,
    getValues,
    restoringDraft,
    setValue,
  ])
}
