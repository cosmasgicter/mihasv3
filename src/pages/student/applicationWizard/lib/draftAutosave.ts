import type { WizardFormData, WizardProgram } from '../types'
import { normalizeResidenceTown } from '@/lib/residenceTown'

type DraftApplicationPayload = {
  application_number: string
  public_tracking_code: string
  full_name: string
  nrc_number: string | null
  passport_number: string | null
  date_of_birth: string
  sex: string
  phone: string
  email: string
  residence_town: string
  country: string
  next_of_kin_name: string | null
  next_of_kin_phone: string | null
  program: string
  intake: string
  institution: string
  nationality: string
  status: 'draft'
}

const hasText = (value?: string | null) => Boolean(value?.trim())

export function canCreateServerDraft(formData: WizardFormData): boolean {
  return [
    formData.full_name,
    formData.date_of_birth,
    formData.sex,
    formData.phone,
    formData.email,
    formData.residence_town,
    formData.program,
    formData.intake,
  ].every(hasText) && (hasText(formData.nrc_number) || hasText(formData.passport_number))
}

export function buildServerDraftPayload({
  formData,
  selectedProgramDetails,
  institutionCode,
  nationality,
  applicationNumber,
  trackingCode,
}: {
  formData: WizardFormData
  selectedProgramDetails?: WizardProgram
  institutionCode: string
  nationality: string
  applicationNumber: string
  trackingCode: string
}): DraftApplicationPayload {
  return {
    application_number: applicationNumber,
    public_tracking_code: trackingCode,
    full_name: formData.full_name.trim(),
    nrc_number: formData.nrc_number?.trim() || null,
    passport_number: formData.passport_number?.trim() || null,
    date_of_birth: formData.date_of_birth,
    sex: formData.sex,
    phone: formData.phone.trim(),
    email: formData.email.trim(),
    residence_town: normalizeResidenceTown(formData.residence_town),
    country: formData.country?.trim() || 'Zambia',
    next_of_kin_name: formData.next_of_kin_name?.trim() || null,
    next_of_kin_phone: formData.next_of_kin_phone?.trim() || null,
    program: selectedProgramDetails?.id || formData.program,
    intake: formData.intake,
    institution: institutionCode,
    nationality: nationality.trim() || 'Zambian',
    status: 'draft',
  }
}
