/**
 * The assigned-school checkpoint (admissions-v2 task 11.2, MAINT-01).
 *
 * Lifted **verbatim** out of `useWizardController` — the third of MAINT-01's seams,
 * after the forward command (`useWizardStepAdvance`) and the submit command
 * (`useWizardSubmission`). One bounded workflow: resolve the assignment preview for
 * the chosen canonical programme + intake, decide whether it is *resolved* (R10.3
 * needs an assigned school **and** a fee), and turn any failure into a recoverable
 * path rather than a dead end (R10.4, R2.6, R2.7).
 *
 * The body is the block as it stood, character for character, including its section
 * comments and its `useMemo`/`useCallback` dependency lists. Only the surrounding
 * closure changed: what was read from the controller's scope now arrives as a
 * parameter, and what the controller still reads is returned.
 *
 * `submitAssignmentFailureCode` stays owned by the controller and is passed in with
 * its setter. It is written by the submit command and read here, so moving the state
 * would change who owns it — a redesign, not a lift, and MAINT-01 asks for the lift.
 *
 * Requirements: **R10.2**, **R10.3** (nothing past the checkpoint moves until the
 * platform has resolved the school and the fee), **R10.4**, **R2.6**, **R2.7**.
 */
import { useCallback, useEffect, useMemo } from 'react'

import { catalogData } from '@/data/catalog'
import { getBestValue, getUserMetadata } from '@/hooks/useProfileAutoPopulation'
import { getCanonicalResidenceCountry } from '@/lib/profileFieldMapping'
import { toError } from '@/lib/toError'
import type { User } from '@/types/auth'

import {
  buildAdmissionsMailto,
  getAssignmentFailureCode,
  hasRecordedAssignmentInterest,
  recordAssignmentInterest,
  resolveAssignmentRecovery,
  type AssignmentFailureCode,
  type AssignmentRecoveryGuidance,
} from '../../lib/assignmentRecovery'
import type { WizardIntake, WizardProgram } from '../../types'

export interface UseWizardAssignmentParams {
  user: User | null | undefined
  profile: { nationality?: string | null } | null | undefined
  selectedProgram: string
  selectedIntake: string
  programIds: string[]
  intakeIds: string[]
  selectedProgramDetails: WizardProgram | undefined
  intakes: WizardIntake[]
  submitAssignmentFailureCode: AssignmentFailureCode | null
  setSubmitAssignmentFailureCode: (code: AssignmentFailureCode | null) => void
  assignmentInterestTick: number
  setAssignmentInterestTick: React.Dispatch<React.SetStateAction<number>>
  showSuccess: (message: string) => void
}

export function useWizardAssignment({
  user,
  profile,
  selectedProgram,
  selectedIntake,
  programIds,
  intakeIds,
  selectedProgramDetails,
  intakes,
  submitAssignmentFailureCode,
  setSubmitAssignmentFailureCode,
  assignmentInterestTick,
  setAssignmentInterestTick,
  showSuccess,
}: UseWizardAssignmentParams) {
  // ── Program-first assignment preview (R10.2 / R10.3) ──────────────────────
  // Once the student has chosen a canonical programme + intake, resolve the
  // assigned school + fee + required documents + contact from the backend.
  // The result drives the assigned-school checkpoint (step 2) and gates the
  // payment step: payment is unreachable until `assignmentResolved` is true.
  const { data: wizardCatalogContext } = catalogData.useContext()
  const whiteLabelInstitutionId =
    wizardCatalogContext?.portal_type === 'white_label' ? wizardCatalogContext.institution_id : null
  const previewNationality = getBestValue(profile?.nationality, getUserMetadata(user).nationality, 'Zambian')
  const previewCountry = getCanonicalResidenceCountry(profile, getUserMetadata(user))
  const {
    data: assignmentPreview,
    isFetching: assignmentPreviewFetching,
    error: assignmentPreviewErrorRaw,
    refetch: refetchAssignmentPreview,
  } = catalogData.useAssignmentPreview({
    programId: selectedProgram && programIds.includes(selectedProgram) ? selectedProgram : null,
    intakeId: selectedIntake && intakeIds.includes(selectedIntake) ? selectedIntake : null,
    nationality: previewNationality,
    country: previewCountry,
    institution: whiteLabelInstitutionId,
  })
  // R10.3 gate: assignment is "resolved" only when the backend returned an
  // assigned school AND a resolved fee for the chosen program+intake.
  const assignmentResolved = Boolean(assignmentPreview?.assigned_school?.id && assignmentPreview?.fee)
  const assignmentPreviewError = assignmentPreviewErrorRaw
    ? toError(assignmentPreviewErrorRaw).message || 'We could not confirm your assigned school. Please try again.'
    : null

  // ── Recoverable assignment-failure guidance (R10.4, R2.6, R2.7) ───────────
  // A failure is either: a preview failure carrying a stable code (R2.6:
  // NO_ELIGIBLE_OFFERING), a submit-time re-assignment failure (R2.7:
  // OFFERING_NO_LONGER_AVAILABLE / OFFERING_CAPACITY_FULL), or a transient
  // network/unknown failure. In every case the student gets a recoverable path
  // (choose another intake, interest list, contact admissions) — never a
  // dead-end. The submit-time code takes precedence because it is the most
  // recent, decisive signal.
  const previewFailureCode = getAssignmentFailureCode(assignmentPreviewErrorRaw)
  const activeAssignmentFailureCode = submitAssignmentFailureCode ?? previewFailureCode
  const assignmentContactMailto = useMemo(
    () =>
      buildAdmissionsMailto({
        email:
          assignmentPreview?.contact?.email ??
          wizardCatalogContext?.brand?.admissions_email ??
          wizardCatalogContext?.brand?.support_email ??
          null,
        programName: assignmentPreview?.program_name ?? selectedProgramDetails?.name,
        intakeName: assignmentPreview?.intake_name,
      }),
    [
      assignmentPreview?.contact?.email,
      assignmentPreview?.program_name,
      assignmentPreview?.intake_name,
      wizardCatalogContext?.brand?.admissions_email,
      wizardCatalogContext?.brand?.support_email,
      selectedProgramDetails?.name,
    ],
  )
  const assignmentRecovery: AssignmentRecoveryGuidance | null = useMemo(() => {
    // Only surface recovery when there is an actual failure: a stable code, or
    // a transient preview error while ids are present and nothing resolved.
    const hasFailure =
      activeAssignmentFailureCode !== null ||
      (Boolean(assignmentPreviewError) && !assignmentResolved)
    if (!hasFailure) return null
    return resolveAssignmentRecovery({
      code: activeAssignmentFailureCode,
      programName: assignmentPreview?.program_name ?? selectedProgramDetails?.name,
      intakeName:
        assignmentPreview?.intake_name ??
        intakes.find(intake => intake.id === selectedIntake)?.name,
    })
  }, [
    activeAssignmentFailureCode,
    assignmentPreviewError,
    assignmentResolved,
    assignmentPreview?.program_name,
    assignmentPreview?.intake_name,
    selectedProgramDetails?.name,
    intakes,
    selectedIntake,
  ])
  const assignmentInterestRecorded = useMemo(() => {
    void assignmentInterestTick
    return hasRecordedAssignmentInterest({ programId: selectedProgram, intakeId: selectedIntake })
  }, [assignmentInterestTick, selectedProgram, selectedIntake])
  const joinAssignmentInterestList = useCallback(() => {
    const recorded = recordAssignmentInterest({
      programId: selectedProgram,
      intakeId: selectedIntake,
      code: activeAssignmentFailureCode,
    })
    if (recorded) {
      setAssignmentInterestTick(tick => tick + 1)
      showSuccess('Added to the interest list. We will contact you if a place opens.')
    }
  }, [selectedProgram, selectedIntake, activeAssignmentFailureCode, showSuccess])

  // Clear a stale submit-time failure once the student changes their selection
  // and a fresh assignment resolves successfully.
  useEffect(() => {
    if (assignmentResolved && submitAssignmentFailureCode) {
      setSubmitAssignmentFailureCode(null)
    }
  }, [assignmentResolved, submitAssignmentFailureCode])
  return {
    wizardCatalogContext,
    assignmentPreview,
    assignmentPreviewFetching,
    assignmentResolved,
    assignmentPreviewError,
    assignmentRecovery,
    assignmentContactMailto,
    assignmentInterestRecorded,
    joinAssignmentInterestList,
    refetchAssignmentPreview,
  }
}
