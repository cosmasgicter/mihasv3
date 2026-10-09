import { useState, useEffect } from 'react'
import { applicationService } from '@/services/applications'
import { deleteStudentDraft, type StudentDraftDeleteResult } from '@/lib/studentDraftCleanup'
import { useDraftRevision } from '@/stores/draftStore'

interface Draft {
  id: string
  draft_name: string
  draft_data: Record<string, unknown>
  updated_at: string
  last_accessed_at: string
  is_active: boolean
}

export const useMultiDraft = (userId: string | undefined) => {
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDrafts = async () => {
    if (!userId) return
    
    setLoading(true)
    setError(null)
    
    try {
      const result = await applicationService.list(
        { mine: true, status: 'draft', page: 1, pageSize: 100, sortBy: 'date', sortOrder: 'desc' }
      )
      const apps = result?.applications ?? []
      // Map applications to draft shape
      const mappedDrafts: Draft[] = apps.map((app: Record<string, unknown>) => ({
        id: String(app.id ?? ''),
        draft_name: String(app.draft_name || `Draft - ${app.program || 'Untitled'}`),
        draft_data: app,
        updated_at: String(app.updated_at || app.created_at || ''),
        last_accessed_at: String(app.updated_at || app.created_at || ''),
        is_active: true
      }))
      setDrafts(mappedDrafts)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  // Canonical draft START (task 6.2, R10.1/R10.3/R10.9). A start requires the
  // minimum canonical selection (program_id + intake_id); it is NEVER an empty
  // payload (finding STU-12). Errors are surfaced, not suppressed.
  const createDraft = async (draftData: Record<string, unknown>) => {
    if (!userId) return null

    if (!draftData?.program_id || !draftData?.intake_id) {
      setError('Select a programme and intake to start an application.')
      return null
    }

    try {
      const result = await applicationService.startDraft({ ...draftData, status: 'draft' })
      setError(null)
      await fetchDrafts()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to start application'
      setError(message)
      return null
    }
  }

  // Rename via the dedicated, validated server field (task 6.2, R10.9). The old
  // path sent draft_name through the generic application update, where it was
  // silently dropped (finding STU-12).
  const renameDraft = async (draftId: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setError('Enter a name for this draft.')
      return
    }
    try {
      await applicationService.renameDraft(draftId, trimmed)
      setError(null)
      await fetchDrafts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename draft')
    }
  }

  /**
   * Delete one draft (admissions-v2 task 11.1, R10.10, finding STU-12).
   *
   * Delegates to the one scoped command. The version this replaces deleted the
   * server row and left that `(user, application)` local snapshot behind, so the
   * wizard could restore a draft the platform had already removed; it also read a
   * payment-linked refusal as a generic error, hiding the fact that the draft was
   * protected rather than broken.
   */
  const deleteDraft = async (draftId: string): Promise<StudentDraftDeleteResult> => {
    const result = await deleteStudentDraft({ userId, applicationId: draftId })
    if (!result.success) {
      setError(result.error ?? 'An error occurred')
      return result
    }
    setError(null)
    await fetchDrafts()
    return result
  }

  const loadDraft = async (draftId: string) => {
    try {
      const result = await applicationService.getById(draftId)
      return result?.application ?? null
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      return null
    }
  }

  useEffect(() => {
    fetchDrafts()
  }, [userId])

  // Refetch automatically whenever any consumer of the unified draft
  // store reports a save / clear / stale event.
  const draftRevision = useDraftRevision()
  useEffect(() => {
    if (draftRevision === 0) return
    fetchDrafts()
  }, [draftRevision])

  return {
    drafts,
    loading,
    error,
    createDraft,
    renameDraft,
    deleteDraft,
    loadDraft,
    refreshDrafts: fetchDrafts
  }
}
