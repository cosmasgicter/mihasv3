import { normalizePhoneNumberInput, type WizardFormData, type WizardProgram } from '../types'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { sanitizePhoneInput } from '../hooks/wizard/wizardControllerUtils'

/**
 * The personal answers the canonical draft PATCH carries — and nothing else.
 *
 * Assignment (`program` / `intake` / `institution` and their ids) is immutable
 * after creation and moves only through the reroute command (task 6.4, R10.5),
 * so it is deliberately absent: changing the programme must never produce an
 * answer write.
 */
export const DRAFT_ANSWER_FIELDS = [
  'full_name',
  'nrc_number',
  'passport_number',
  'date_of_birth',
  'sex',
  'phone',
  'email',
  'residence_town',
  'country',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
] as const

export type DraftAnswerField = (typeof DRAFT_ANSWER_FIELDS)[number]

/**
 * The canonical answer projection (admissions-v2 task 6.3): exactly the body of
 * `PATCH /applications/drafts/{id}/` minus `expected_version`. The draft machine
 * compares this — not the whole form — with what the server last acknowledged,
 * so a value the PATCH would not send can never cause a write, and an unchanged
 * draft never writes at all.
 *
 * Lifted unchanged from the `updatePayload` literal `useWizardDraftPersistence`
 * built inline; blank values are omitted (`undefined`), as before.
 */
export function projectDraftAnswers(formData: Partial<WizardFormData>): Record<string, string | undefined> {
  return {
    full_name: formData.full_name || undefined,
    nrc_number: formData.nrc_number || undefined,
    passport_number: formData.passport_number || undefined,
    date_of_birth: formData.date_of_birth || undefined,
    sex: formData.sex?.toLowerCase() || undefined,
    phone: sanitizePhoneInput(formData.phone) || undefined,
    email: formData.email || undefined,
    residence_town: normalizeResidenceTown(formData.residence_town) || undefined,
    country: formData.country || DEFAULT_RESIDENCE_COUNTRY,
    nationality: formData.nationality || undefined,
    next_of_kin_name: formData.next_of_kin_name || undefined,
    next_of_kin_phone: sanitizePhoneInput(formData.next_of_kin_phone) || undefined,
  }
}

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
  program_id?: string
  intake_id?: string
  program: string
  intake: string
  institution: string
  nationality: string
}

export type DuplicateDraftConflictDecision = {
  existingId: string | null
  program: string
  intake: string
  message: string
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
  programId,
  intakeId,
}: {
  formData: WizardFormData
  selectedProgramDetails?: WizardProgram
  institutionCode: string
  nationality: string
  programId?: string
  intakeId?: string
}): DraftApplicationPayload {
  // The backend now accepts IDs for assignment and keeps names as display snapshots.
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
    ...(programId ? { program_id: programId } : {}),
    ...(intakeId ? { intake_id: intakeId } : {}),
    program: programName,
    intake: formData.intake,
    institution: institutionCode,
    nationality: nationality.trim() || 'Zambian',
  }
}

export function buildDuplicateDraftConflictDecision({
  existingId,
  program,
  intake,
}: {
  existingId?: string | null
  program: string
  intake: string
}): DuplicateDraftConflictDecision {
  const normalizedExistingId = existingId?.trim() || null
  return {
    existingId: normalizedExistingId,
    program,
    intake,
    message: normalizedExistingId
      ? 'You already have a draft for this programme and intake. Continue that draft, choose a different intake, or cancel this new application.'
      : 'You already have a draft for this programme and intake. Continue the existing draft, choose a different intake, or cancel this new application.',
  }
}

export function shouldClearDuplicateDraftConflict(
  conflict: DuplicateDraftConflictDecision | null,
  formData: Pick<WizardFormData, 'program' | 'intake'>
): boolean {
  if (!conflict) return false
  return conflict.program !== String(formData.program || '') || conflict.intake !== String(formData.intake || '')
}
