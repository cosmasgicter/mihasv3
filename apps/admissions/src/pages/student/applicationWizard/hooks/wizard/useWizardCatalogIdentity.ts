/**
 * The wizard's catalog lists and its canonical-identity resolvers (admissions-v2
 * task **12.1**, MAINT-01).
 *
 * Lifted **verbatim** out of `useWizardController.ts`. Task 11.2 §22 named this as
 * one of five things it left for 12.1: "state, catalog/identity resolution, the
 * grades/uploads/OCR adapters, the effects and the result object".
 *
 * Why this is the right seam, and why it matters more than line count: this is the
 * code that answers *which canonical program and which canonical intake a student
 * means*. The wizard's form holds whatever the draft restored — which may be a
 * **display name** rather than a UUID — and the canonical truth map is explicit
 * that canonical IDs are the sole authority for routing and scoping while the
 * legacy `applications.program` / `.intake` strings are display snapshots. So
 * `findProgramId`'s fallback ladder (exact id, exact name, institution-hinted
 * tie-break, partial name) is load-bearing, and it belonged in a module with a
 * name rather than in the middle of a 1,110-line hook.
 *
 * Nothing about the ladder changed. Every branch, every `.trim().toLowerCase()`,
 * every tie-break and the `''`-means-"fail validation" contract are byte-identical
 * to what they were; the extraction was performed by line range, not retyped —
 * which is the lesson of 11.2 §10.1, where a re-authored validation function
 * silently lost a hydration guard, a duplicate-subject error, an upload guard and
 * six field labels.
 *
 * What deliberately stayed in the controller, and why:
 *
 *   - The two **reconciliation effects** that write a resolved id back into the
 *     form. They need `setValue`, and the Order-A race they close (catalog cache
 *     resolving before draft restore) is a property of the controller's own effect
 *     ordering.
 *   - The two **population effects** that copy a query payload into `programs` /
 *     `intakes`. They read `catalogData.useProgramsForIntake(watch('intake'))`,
 *     which needs the form, which needs the schema, which needs this hook's
 *     `programIds`. Moving them would mean splitting one concern across two hooks
 *     for a purely mechanical reason, or reordering effects in the file whose
 *     effect ordering is the thing the reconciliation exists to defend. Stated
 *     rather than papered over: this hook owns the state and the resolvers, and the
 *     controller still owns the two writes into that state.
 */
import { useCallback, useMemo, useState } from 'react'

import { resolveWizardIntakeIdentity } from './wizardControllerUtils'
import type { WizardIntake, WizardProgram } from '../../types'

export function useWizardCatalogIdentity() {
  const [programs, setPrograms] = useState<WizardProgram[]>([])
  const [intakes, setIntakes] = useState<WizardIntake[]>([])

  const findProgramId = useCallback(
    (
      value?: string | null,
      institutionHint?: string | null,
      programList?: WizardProgram[]
    ) => {
      const list = programList ?? programs
      if (!value) return ''

      const trimmed = value.trim()
      if (!trimmed) return ''

      // Exact ID match
      const byId = list.find(program => program.id === trimmed)
      if (byId) return byId.id

      const normalized = trimmed.toLowerCase()
      
      // Exact name match
      const exactMatches = list.filter(program => program.name?.trim().toLowerCase() === normalized)
      if (exactMatches.length === 1) return exactMatches[0]!.id

      // Multiple exact matches - use institution hint
      if (exactMatches.length > 1 && institutionHint) {
        const hint = institutionHint.trim().toLowerCase()
        const byInstitution = exactMatches.find(program => {
          const institutionName = program.institutions?.full_name || program.institutions?.name || ''
          const normalizedInstitution = institutionName.trim().toLowerCase()
          return normalizedInstitution === hint || normalizedInstitution.includes(hint) || hint.includes(normalizedInstitution)
        })
        if (byInstitution) return byInstitution.id
        // Return first match if institution hint doesn't help
        return exactMatches[0]!.id
      }

      // Partial name match (fallback)
      const partialMatches = list.filter(program => {
        const programName = program.name?.trim().toLowerCase() || ''
        return programName.includes(normalized) || normalized.includes(programName)
      })
      
      if (partialMatches.length === 1) return partialMatches[0]!.id
      if (partialMatches.length > 1 && institutionHint) {
        const hint = institutionHint.trim().toLowerCase()
        const byInstitution = partialMatches.find(program => {
          const institutionName = program.institutions?.full_name || program.institutions?.name || ''
          const normalizedInstitution = institutionName.trim().toLowerCase()
          return normalizedInstitution === hint || normalizedInstitution.includes(hint)
        })
        if (byInstitution) return byInstitution.id
      }

      // No match found - return empty to trigger validation error
      return ''
    },
    [programs]
  )

  const deriveInstitutionLabel = useCallback((institution?: WizardProgram['institutions']) => {
    if (!institution) return ''
    return institution.full_name?.trim() || institution.name?.trim() || ''
  }, [])

  const resolveProgramIdentity = useCallback(
    (value?: string | null, institutionHint?: string | null) => {
      const programId = findProgramId(value, institutionHint)
      if (!programId) return null

      const program = programs.find(item => item.id === programId)
      if (!program?.name?.trim()) return null

      return {
        id: programId,
        label: program.name.trim(),
        institutionLabel: deriveInstitutionLabel(program.institutions)
      }
    },
    [deriveInstitutionLabel, findProgramId, programs]
  )

  const resolveIntakeIdentity = useCallback(
    (value?: string | null) => resolveWizardIntakeIdentity(intakes, value),
    [intakes]
  )

  const programIds = useMemo(() => programs.map(program => program.id).filter(Boolean), [programs])
  const intakeIds = useMemo(
    () => intakes.map(intake => intake.id).filter(Boolean),
    [intakes]
  )
  return {
    programs,
    setPrograms,
    intakes,
    setIntakes,
    findProgramId,
    deriveInstitutionLabel,
    resolveProgramIdentity,
    resolveIntakeIdentity,
    programIds,
    intakeIds,
  }
}
