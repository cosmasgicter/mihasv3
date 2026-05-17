/**
 * useWizardProfile — Phase 3 wizard hook (scaffold).
 *
 * Owns profile auto-population: when a profile is loaded (via
 * useProfileQuery), apply its values to the form fields the user has not
 * already filled in.
 *
 * This is a Phase 3 scaffold. Full integration happens when the next-sprint
 * PR wires it into useWizardController, replacing the inline profile
 * auto-population block. The scaffold defines the public API and a minimal
 * field-merge implementation that callers can extend.
 *
 * Stream 8 of canonical-truth program. Decision A6 — Phase 3 of 6.
 */

import { useEffect, useState, useCallback } from 'react'
import type { UseFormReturn } from 'react-hook-form'

import type { WizardFormData } from '../../types'

export interface UseWizardProfileOptions<T = Record<string, unknown>> {
  form: UseFormReturn<WizardFormData>
  /** Profile object from useProfileQuery() (any shape consumed by the resolver). */
  profile: T | null | undefined
  /**
   * Resolve the value for a single form field from the profile object.
   * Returning `undefined` leaves the field untouched. Caller-supplied so
   * the hook stays decoupled from the specific profile shape.
   */
  resolveField?: (
    field: keyof WizardFormData,
    profile: T | null | undefined
  ) => string | undefined
  /** Skip auto-population (e.g. while a draft is being restored). */
  skip?: boolean
}

export interface UseWizardProfileResult {
  /** True once the hook has applied profile values to the form. */
  hasAutoPopulatedData: boolean
  /** Manually re-run the auto-population pass. */
  applyAutoPopulation: () => void
}

const TARGET_FIELDS: ReadonlyArray<keyof WizardFormData> = [
  'full_name',
  'email',
  'phone',
  'nrc_number',
  'passport_number',
  'date_of_birth',
  'sex',
  'nationality',
  'residence_town',
  'country',
  'next_of_kin_name',
  'next_of_kin_phone',
]

/**
 * Auto-populate the wizard form from the user's profile.
 *
 * The hook only fills fields that are currently empty so the user's edits
 * aren't stomped on. Field resolution is delegated to `resolveField` so
 * callers can plug in the canonical mapping from `lib/profileFieldMapping.ts`.
 */
export function useWizardProfile<T = Record<string, unknown>>(
  options: UseWizardProfileOptions<T>
): UseWizardProfileResult {
  const { form, profile, resolveField, skip = false } = options
  const [hasAutoPopulatedData, setHasAutoPopulatedData] = useState(false)

  const applyAutoPopulation = useCallback(() => {
    if (!profile || !resolveField) return

    const current = form.getValues()
    let mutated = false

    for (const field of TARGET_FIELDS) {
      const currentValue = (current[field] ?? '') as string
      if (currentValue && currentValue.trim().length > 0) continue
      const next = resolveField(field, profile)
      if (next === undefined || next === null) continue
      const trimmed = String(next).trim()
      if (!trimmed) continue
      form.setValue(field, trimmed as never, {
        shouldDirty: false,
        shouldValidate: false,
      })
      mutated = true
    }

    if (mutated) {
      setHasAutoPopulatedData(true)
    }
  }, [form, profile, resolveField])

  useEffect(() => {
    if (skip) return
    if (!profile) return
    if (hasAutoPopulatedData) return
    applyAutoPopulation()
  }, [profile, skip, hasAutoPopulatedData, applyAutoPopulation])

  return { hasAutoPopulatedData, applyAutoPopulation }
}
