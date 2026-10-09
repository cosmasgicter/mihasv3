/**
 * Canonical profile/settings autosave helpers (admissions-v2 task 6.1).
 *
 * Pure, framework-neutral logic that backs the per-section profile autosave
 * state machine (`useProfileSectionAutosave`). Keeping this logic pure makes the
 * conflict/merge/backoff behaviour unit- and property-testable without React.
 *
 * Design references:
 * - design.md §8.2 Frontend Draft Machine (states: dirty/saving/saved/offline/
 *   conflict; events EDIT, SAVE_DUE, SAVE_NOW, NETWORK_LOST/RESTORED,
 *   SERVER_CONFLICT).
 * - design.md §14.2 Idempotency And Concurrency (mutable aggregates expose a
 *   version; conflicts surface with the current version + safe recovery).
 * - requirements R9.3/R9.8 (one schema, explicit save/error state, versioned
 *   per-section autosave, visible saved/offline/conflict state).
 *
 * Privacy (R9.5): the profile payload is sensitive PII (NRC, DOB, phone,
 * address). The offline outbox for profile edits is therefore held in memory by
 * the hook and never persisted to localStorage. This module intentionally
 * exposes no storage helpers.
 */

import { normalizeDateInputValue } from '@/lib/profileFieldMapping'

export type ProfileSectionId = 'applicant' | 'residence' | 'emergency'

/**
 * Field ownership per editable section. Autosave batches only the dirty fields
 * that belong to the section that changed, so each section reports its own
 * save state independently (R9.8 "versioned per-section autosave").
 */
export const PROFILE_SECTIONS: Record<ProfileSectionId, readonly string[]> = {
  applicant: ['full_name', 'phone', 'date_of_birth', 'sex'],
  residence: ['country', 'residence_town', 'nationality', 'nrc_number', 'address'],
  emergency: ['next_of_kin_name', 'next_of_kin_phone'],
}

export const PROFILE_SECTION_IDS = Object.keys(PROFILE_SECTIONS) as ProfileSectionId[]

/**
 * Explicit, user-visible save state for a section. Every non-idle state is
 * paired with an icon + label in the UI (never colour alone) per the design
 * visual rules.
 */
export type SectionSaveStatus =
  | 'idle'
  | 'dirty'
  | 'saving'
  | 'saved'
  | 'offline'
  | 'retrying'
  | 'error'
  | 'conflict'

/** The 11 editable profile form fields, in a stable order. */
export const PROFILE_FORM_FIELDS = [
  'full_name',
  'phone',
  'date_of_birth',
  'sex',
  'residence_town',
  'country',
  'nrc_number',
  'address',
  'nationality',
  'next_of_kin_name',
  'next_of_kin_phone',
] as const

export type ProfileFormField = (typeof PROFILE_FORM_FIELDS)[number]

/**
 * Backend alignment: `ProfileUpdateSerializer.validate_phone` delegates to
 * `validate_zambian_phone`, which requires `+260` followed by exactly 9 digits.
 * Aligning the client validation removes a needless server round-trip on an
 * obviously invalid number (R9.3 "same validation contract as the backend").
 */
const ZAMBIAN_PHONE_RE = /^\+260\d{9}$/

export function normalizeProfilePhone(value: string | null | undefined): string {
  return (value ?? '').trim()
}

/** True when the (non-empty) phone matches the backend Zambian phone contract. */
export function isAlignedZambianPhone(value: string | null | undefined): boolean {
  return ZAMBIAN_PHONE_RE.test(normalizeProfilePhone(value))
}

/** Resolve the owning section for a form field, or null if it is not editable. */
export function sectionForField(field: string): ProfileSectionId | null {
  for (const sectionId of PROFILE_SECTION_IDS) {
    if (PROFILE_SECTIONS[sectionId].includes(field)) {
      return sectionId
    }
  }
  return null
}

/**
 * Extract the delta of *dirty* fields belonging to a section. Fields listed in
 * `invalidFields` are held back so an invalid value never autosaves (it stays
 * dirty with an inline error until corrected).
 */
export function extractSectionDelta(
  fields: readonly string[],
  values: Record<string, unknown>,
  dirtyFields: Record<string, unknown>,
  invalidFields?: ReadonlySet<string>,
): Record<string, unknown> {
  const delta: Record<string, unknown> = {}
  for (const field of fields) {
    if (!dirtyFields[field]) continue
    if (invalidFields?.has(field)) continue
    delta[field] = values[field]
  }
  return delta
}

/**
 * Null-safe field-by-field merge used to reset the form after a successful
 * save so `isDirty` does not persist. This is the single source of truth for
 * the audit-production Settings fix (previously inlined in `Settings.tsx`):
 * every string field falls back to `''` (never `null`/`undefined`) so it always
 * matches the corresponding controlled input's value.
 *
 * Validates: Requirements R9.3, R9.8 (and preserves the audit-production
 * isDirty-after-save fix).
 */
export function buildProfileResetValues(
  formValues: Record<string, string | undefined>,
  serverResponse: Record<string, string | null | undefined>,
): Record<string, string | undefined> {
  return {
    full_name: serverResponse.full_name ?? formValues.full_name,
    phone: serverResponse.phone ?? formValues.phone ?? '',
    date_of_birth: normalizeDateInputValue(
      serverResponse.date_of_birth ?? formValues.date_of_birth ?? '',
    ),
    sex: ((serverResponse.sex as 'Male' | 'Female') ?? formValues.sex) as string | undefined,
    residence_town: serverResponse.residence_town ?? formValues.residence_town ?? '',
    country: serverResponse.country ?? formValues.country ?? '',
    nrc_number: serverResponse.nrc_number ?? formValues.nrc_number ?? '',
    address: serverResponse.address ?? formValues.address ?? '',
    nationality: serverResponse.nationality ?? formValues.nationality ?? 'Zambian',
    next_of_kin_name: serverResponse.next_of_kin_name ?? formValues.next_of_kin_name ?? '',
    next_of_kin_phone: serverResponse.next_of_kin_phone ?? formValues.next_of_kin_phone ?? '',
  }
}

/**
 * Exponential backoff for autosave retries, capped. Matches the existing
 * wizard autosave policy (1s base, doubling, 30s ceiling).
 */
export function computeBackoffDelay(attempt: number, base = 1000, max = 30000): number {
  const safeAttempt = Math.max(1, attempt)
  return Math.min(base * 2 ** (safeAttempt - 1), max)
}

/**
 * Version-token conflict check. The profile aggregate exposes `updated_at` as
 * its optimistic version. A conflict exists only when we hold a known base
 * version and the server has since advanced to a different version (another
 * tab/device wrote the profile) — design §14.2.
 */
export function isVersionConflict(
  base: string | undefined,
  incoming: string | undefined,
): boolean {
  if (!base || !incoming) return false
  return base !== incoming
}

/** True when the section is holding unsynchronised work that a page unload would lose. */
export function isUnsyncedStatus(status: SectionSaveStatus): boolean {
  return (
    status === 'dirty' ||
    status === 'saving' ||
    status === 'offline' ||
    status === 'retrying' ||
    status === 'error' ||
    status === 'conflict'
  )
}
