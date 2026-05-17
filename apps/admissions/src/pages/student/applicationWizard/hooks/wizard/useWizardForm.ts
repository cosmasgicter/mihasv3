/**
 * useWizardForm — Phase 2 wizard hook.
 *
 * Owns the React Hook Form setup, Zod schema instantiation, and the
 * watchValues helper for the application wizard. Replaces the inline
 * useForm()/createWizardSchema() block in useWizardController.ts.
 *
 * Decision A6 in the canonical-truth program: six sequential wizard hook
 * extractions over one sprint. This is Phase 2 of 6.
 *
 * Migration plan:
 * - Phase 2 (this hook): Extract form setup. Wire into useWizardController.
 * - Phase 3: useWizardProfile (auto-populate from profile).
 * - Phase 4: useWizardDraft (load/save/sync).
 * - Phase 5: useWizardSubmission (submit + eligibility).
 * - Phase 6: useWizardRecovery (session recovery, stale draft handling).
 *
 * Stream 8 of canonical-truth program (admissions-canonical-truth-2026-05).
 */

import { useMemo } from 'react'
import { useForm, type UseFormReturn, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

import { createWizardSchema, type WizardFormData } from '../../types'

export interface UseWizardFormOptions {
  /** Program IDs allowed by the current intake catalog. */
  validProgramIds: string[]
  /** Intake IDs allowed by the current catalog. */
  validIntakeIds: string[]
  /** Optional initial defaults — typically derived from profile or draft. */
  defaultValues?: Partial<WizardFormData>
}

export interface UseWizardFormResult {
  form: UseFormReturn<WizardFormData>
  /** Snapshot of current form values (use sparingly — prefer `watch`). */
  watchValues: () => WizardFormData
}

/**
 * Build the wizard's React Hook Form instance with the canonical Zod schema.
 *
 * The schema is rebuilt whenever the valid program/intake ID lists change,
 * so a new intake catalog being loaded mid-flight will refresh validation
 * without remounting the form.
 */
export function useWizardForm(options: UseWizardFormOptions): UseWizardFormResult {
  const { validProgramIds, validIntakeIds, defaultValues } = options

  const schema = useMemo(
    () => createWizardSchema(validProgramIds, validIntakeIds),
    [validProgramIds, validIntakeIds]
  )

  const form = useForm<WizardFormData>({
    resolver: zodResolver(schema) as unknown as Resolver<WizardFormData>,
    defaultValues: defaultValues as WizardFormData | undefined,
    mode: 'onTouched',
    reValidateMode: 'onChange',
    shouldFocusError: true,
  })

  const watchValues = (): WizardFormData => form.watch()

  return { form, watchValues }
}
