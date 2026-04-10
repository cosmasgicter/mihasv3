import { applicationService } from '@/services/applications'

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  existingApplicationId?: string
  existingStatus?: string
  resumeUrl?: string
  message?: string
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
  program: string,
  intake: string
): Promise<DuplicateCheckResult> {
  try {
    // Query backend for the user's non-terminal applications matching program+intake
    const result = await applicationService.list({
      mine: true,
      program,
      intake,
      status: 'draft,submitted,under_review,approved,waitlisted',
      pageSize: 1,
    })

    const applications = result?.applications ?? []

    if (applications.length > 0) {
      const existing = applications[0]!
      return {
        hasDuplicate: true,
        existingApplicationId: existing.id,
        existingStatus: existing.status,
        resumeUrl: `/student/applications/${existing.id}`,
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
