import { supabase } from './supabase'

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
    const { data, error } = await supabase
      .from('applications')
      .select('id, status, application_number')
      .eq('id', userId)
      .eq('program', programId)
      .eq('intake', intake)
      .in('status', ['submitted', 'under_review', 'approved'])
      .limit(1)
      .maybeSingle()

    if (error) throw error

    if (data) {
      return {
        hasDuplicate: true,
        existingApplicationId: data.id,
        existingStatus: data.status,
        message: `You already have a ${data.status} application (#${data.application_number}) for this program and intake.`
      }
    }

    return { hasDuplicate: false }
  } catch (error) {
    console.error('Duplicate check error:', error)
    return { hasDuplicate: false }
  }
}
