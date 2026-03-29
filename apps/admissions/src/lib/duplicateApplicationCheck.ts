import { applicationService } from '@/services/applications'

export interface DuplicateCheckResult {
  hasDuplicate: boolean
  existingApplicationId?: string
  existingStatus?: string
  message?: string
}

export async function checkDuplicateApplication(
  userId: string,
  programId: string,
  intake: string
): Promise<DuplicateCheckResult> {
  try {
    // Fetch user's own applications and check for duplicates client-side
    const result = await applicationService.list({
      mine: true,
      status: 'submitted,under_review,approved',
    })

    const applications = result?.applications ?? []

    const duplicate = applications.find(
      (app: any) =>
        (app.program === programId || app.program_id === programId) &&
        (app.intake === intake || app.intake_id === intake)
    )

    if (duplicate) {
      return {
        hasDuplicate: true,
        existingApplicationId: duplicate.id,
        existingStatus: duplicate.status,
        message: `You already have a ${duplicate.status} application (#${duplicate.application_number || duplicate.id?.slice(0, 8)}) for this program and intake.`,
      }
    }

    return { hasDuplicate: false }
  } catch (error) {
    console.error('Duplicate check error:', error)
    // Non-blocking — allow the student to proceed
    return { hasDuplicate: false }
  }
}
