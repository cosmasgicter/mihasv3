/**
 * Draft hydration — the one implementation both resume paths use (admissions-v2
 * task 6.3; R10.1, R10.3; findings STU-02, MAINT-01).
 *
 * Before this module there were two copies of "put a server draft into the
 * wizard": the mount loader (`useWizardDraftLoader`) and the draft picker's
 * `handleLoadDraft` (`useWizardDraftPersistence`). They drifted: the loader read
 * the authoritative row and failed closed (task 11.2 / M9), while the picker
 * still hydrated the lightweight list projection — so continuing a draft from
 * the chooser blanked the NRC, date of birth, town and next-of-kin answers the
 * list does not carry (the defect `draftResume.ts` documents). Both now read the
 * authoritative row here, write the form the same way, and hand the machine the
 * same facts.
 *
 * Everything here is an adapter: it reads and writes, it never decides whether
 * to save. The draft machine (`lib/wizardDraftController.ts`) decides that.
 */
import type { UseFormSetValue } from 'react-hook-form'

import { normalizeSexForWizard } from '@/hooks/useProfileAutoPopulation'
import { DEFAULT_RESIDENCE_COUNTRY } from '@/lib/locationOptions'
import { logger } from '@/lib/logger'
import { normalizeDateInputValue } from '@/lib/profileFieldMapping'
import { normalizeResidenceTown } from '@/lib/residenceTown'
import { sanitizeForLog } from '@/lib/security'
import { toError } from '@/lib/toError'
import { positiveDraftVersion } from '@/lib/wizardDraftProjection'
import { applicationService } from '@/services/applications'

import type { WizardFormData, WizardProgram } from '../types'
import { DRAFT_ANSWER_FIELDS, projectDraftAnswers } from './draftAutosave'
import { fillDraftPersonalFieldsFromRecord } from './draftResume'

export const SELECTED_DRAFT_LOAD_ERROR =
  'We could not load your selected draft. Your saved answers were not changed. Reload this page to try again.'

/**
 * Read the authoritative row for a draft and fill the answers the list
 * projection omits.
 *
 * Fails closed (R10.1): an unavailable or empty row throws instead of returning
 * the projection, because hydrating projection blanks and then saving would
 * overwrite real answers.
 */
export async function readAuthoritativeDraftRow<T extends Record<string, unknown>>(listItem: T): Promise<T> {
  const draftId = String(listItem.id ?? '')
  if (!draftId) return listItem
  try {
    const record = await applicationService.getRecord(draftId)
    if (!record) {
      throw new Error('The selected draft record was empty.')
    }
    const filled = fillDraftPersonalFieldsFromRecord(
      listItem,
      record as unknown as Record<string, unknown> | null,
    )
    return {
      ...filled,
      ...(positiveDraftVersion(record.version) !== null ? { version: record.version } : {}),
      ...(positiveDraftVersion(record.assignment_version) !== null
        ? { assignment_version: record.assignment_version }
        : {}),
    }
  } catch (recordError) {
    logger.warn('[Draft] could not read the selected draft row; resume stopped before hydration', {
      error: sanitizeForLog(toError(recordError).message),
    })
    throw new Error(SELECTED_DRAFT_LOAD_ERROR)
  }
}

export interface DraftFormValueOptions {
  findProgramId: (value?: string | null, institutionHint?: string | null, programList?: WizardProgram[]) => string
  programs?: WizardProgram[]
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value)
}

/**
 * A server draft row, in the shape the wizard form holds it. One mapping for
 * every hydration path, so the form — and therefore the machine's baseline — is
 * identical whichever path loaded it.
 */
export function draftRecordToFormValues(
  record: Record<string, unknown>,
  { findProgramId, programs }: DraftFormValueOptions,
): Partial<WizardFormData> {
  const programValue = typeof record.program === 'string' ? record.program : ''
  const institutionHint = typeof record.institution === 'string' ? record.institution : undefined
  const resolvedProgramId = programValue ? findProgramId(programValue, institutionHint, programs) : ''
  // The intake is hydrated by its canonical id. `record.intake` is a display
  // snapshot, and two tenants can run intakes with the same name: resolving the
  // name against the platform-wide intake list (ordered by year and name only)
  // could pick the OTHER tenant's intake, so the wizard previewed — and a
  // Continue could reroute — an assignment the student never chose. Measured in
  // task 6.3 M13: the adversarial matrix's F1 resumed a tenant-A draft and the
  // preview asked for tenant B's same-named intake (409 NO_ELIGIBLE_OFFERING).
  // A legacy draft with no canonical id keeps the name, as before.
  const intakeId = typeof record.intake_id === 'string' ? record.intake_id.trim() : ''
  return {
    full_name: text(record.full_name),
    nrc_number: text(record.nrc_number),
    passport_number: text(record.passport_number),
    date_of_birth: normalizeDateInputValue(record.date_of_birth || ''),
    sex: normalizeSexForWizard(record.sex) as WizardFormData['sex'],
    phone: text(record.phone),
    email: text(record.email),
    residence_town: normalizeResidenceTown(text(record.residence_town)),
    country: text(record.country) || DEFAULT_RESIDENCE_COUNTRY,
    nationality: text(record.nationality) || 'Zambian',
    next_of_kin_name: text(record.next_of_kin_name),
    next_of_kin_phone: text(record.next_of_kin_phone),
    program: programValue ? resolvedProgramId || programValue : '',
    intake: intakeId || text(record.intake),
  }
}

/** Write form values without marking them as the student's edits. */
export function applyDraftFormValues(
  values: Partial<WizardFormData>,
  setValue: UseFormSetValue<WizardFormData>,
  options: { shouldDirty?: boolean } = {},
): void {
  for (const [field, value] of Object.entries(values)) {
    if (value === undefined) continue
    setValue(field as keyof WizardFormData, value as WizardFormData[keyof WizardFormData], {
      shouldValidate: false,
      ...(options.shouldDirty ? { shouldDirty: true } : {}),
    })
  }
}

/**
 * A server record seen through the form: the form-shaped values and the answer
 * projection the machine compares and sends. Used by the explicit merge.
 */
export function draftRecordAnswers(
  record: Record<string, unknown>,
  options: DraftFormValueOptions,
): { formValues: Record<string, unknown>; answers: Record<string, unknown> } {
  const formValues = draftRecordToFormValues(record, options)
  const answerValues: Record<string, unknown> = {}
  for (const field of DRAFT_ANSWER_FIELDS) answerValues[field] = formValues[field]
  return { formValues: answerValues, answers: projectDraftAnswers(formValues) }
}

/**
 * The answers a pending local outbox record holds that differ from the freshly
 * hydrated server answers — what a version-equal replay re-applies (only after
 * `classifyLocalDraftOutbox` said it may), or what an explicit merge of a stale
 * outbox restores. Assignment fields are never replayed: they move only through
 * the reroute command (R10.5).
 */
export function outboxAnswerOverlay(
  outboxFormData: unknown,
  hydrated: Partial<WizardFormData>,
  /** Only these fields — the record's pending answers. All answer fields when omitted. */
  pendingFields?: readonly string[],
): Partial<WizardFormData> {
  if (!outboxFormData || typeof outboxFormData !== 'object') return {}
  const source = outboxFormData as Record<string, unknown>
  const overlay: Partial<WizardFormData> = {}
  const fields = pendingFields
    ? DRAFT_ANSWER_FIELDS.filter((field) => pendingFields.includes(field))
    : DRAFT_ANSWER_FIELDS
  for (const field of fields) {
    const raw = source[field]
    if (typeof raw !== 'string') continue
    const value =
      field === 'date_of_birth'
        ? normalizeDateInputValue(raw)
        : field === 'sex'
          ? (normalizeSexForWizard(raw) as WizardFormData['sex'])
          : field === 'residence_town'
            ? normalizeResidenceTown(raw)
            : raw
    if (value !== (hydrated[field] ?? '')) {
      ;(overlay as Record<string, unknown>)[field] = value
    }
  }
  return overlay
}
