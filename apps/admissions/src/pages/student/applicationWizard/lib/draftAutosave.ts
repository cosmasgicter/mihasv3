import { normalizePhoneNumberInput, type WizardFormData, type WizardProgram } from '../types'
import { normalizeResidenceTown } from '@/lib/residenceTown'

type DraftApplicationPayload = {
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
}: {
  formData: WizardFormData
  selectedProgramDetails?: WizardProgram
  institutionCode: string
  nationality: string
}): DraftApplicationPayload {
  // Django validates program/intake/institution by name, not by ID.
  // The caller is expected to pass the canonical intake name here.
  const programName = selectedProgramDetails?.name?.trim() || formData.program
  return {
    full_name: formData.full_name.trim(),
    nrc_number: formData.nrc_number?.trim() || null,
    passport_number: formData.passport_number?.trim() || null,
    date_of_birth: formData.date_of_birth,
    sex: formData.sex?.toLowerCase() || formData.sex,
    phone: normalizePhoneNumberInput(formData.phone).trim(),
    email: formData.email.trim(),
    residence_town: normalizeResidenceTown(formData.residence_town),
    country: formData.country?.trim() || 'Zambia',
    next_of_kin_name: formData.next_of_kin_name?.trim() || null,
    next_of_kin_phone: formData.next_of_kin_phone ? normalizePhoneNumberInput(formData.next_of_kin_phone).trim() : null,
    program: programName,
    intake: formData.intake,
    institution: institutionCode,
    nationality: nationality.trim() || 'Zambian',
  }
}
