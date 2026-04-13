import { applicationService } from '@/services/applications'

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  existingApplicationId?: string
  existingStatus?: string
  resumeUrl?: string
  message?: string
}

type DuplicateCheckIdentity = string | {
  id?: string
  label: string
}

function normalizeIdentity(identity: DuplicateCheckIdentity) {
  if (typeof identity === 'string') {
    return { id: undefined, label: identity }
  }

  return identity
}

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase() || ''
}

/**
 * Check for duplicate applications by querying the backend with targeted
 * filters instead of fetching all applications and filtering client-side.
 *
 * The backend's ApplicationListCreateView also enforces duplicate prevention
 * at create time (returns 409 DUPLICATE_APPLICATION), so this is an advisory
 * pre-check for better UX.
 *
 * Requirements: 4.5
 */
export async function checkDuplicateApplication(
  userId: string,
  program: DuplicateCheckIdentity,
  intake: DuplicateCheckIdentity
): Promise<DuplicateCheckResult> {
  void userId
  try {
    const nonTerminalStatuses = new Set(['draft', 'submitted', 'under_review', 'waitlisted'])
    const programIdentity = normalizeIdentity(program)
    const intakeIdentity = normalizeIdentity(intake)
    const normalizedPrograms = new Set([
      normalizeKey(programIdentity.label),
      normalizeKey(programIdentity.id),
    ].filter(Boolean))
    const normalizedIntakes = new Set([
      normalizeKey(intakeIdentity.label),
      normalizeKey(intakeIdentity.id),
    ].filter(Boolean))

    // Query backend for likely program matches, then perform exact workflow
    // filtering client-side so this remains advisory even if API filters differ.
    const result = await applicationService.list({
      mine: true,
      program: programIdentity.label,
      pageSize: 50,
    })

    const applications = result?.applications ?? []
    const existing = applications.find((application) => {
      const status = String(application.status ?? '').toLowerCase()
      const candidateProgram = String(application.program ?? '').trim().toLowerCase()
      const candidateIntake = String(application.intake ?? '').trim().toLowerCase()
      return (
        nonTerminalStatuses.has(status) &&
        normalizedPrograms.has(candidateProgram) &&
        normalizedIntakes.has(candidateIntake)
      )
    })

    if (existing) {
      return {
        hasDuplicate: true,
        existingApplicationId: existing.id,
        existingStatus: existing.status,
        resumeUrl: `/student/application/${existing.id}`,
        message: `You already have a ${existing.status} application (#${existing.application_number || existing.id?.slice(0, 8)}) for this program and intake.`,
      }
    }

    return { hasDuplicate: false }
  } catch (error) {
    console.error('Duplicate check error:', error)
    // Non-blocking — allow the student to proceed; backend enforces at create time
    return { hasDuplicate: false }
  }
}
