import { useState, useEffect } from 'react'
import { applicationService } from '@/services/applications'

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

  const createDraft = async (draftName: string, draftData: Record<string, unknown>) => {
    if (!userId) return null

    try {
      const result = await applicationService.create({
        ...draftData,
        status: 'draft',
        draft_name: draftName
      })
      await fetchDrafts()
      return result
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      return null
    }
  }

  const updateDraft = async (draftId: string, draftData: Record<string, unknown>) => {
    try {
      await applicationService.update(draftId, draftData)
      await fetchDrafts()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
    }
  }

  const renameDraft = async (draftId: string, newName: string) => {
    try {
      await applicationService.update(draftId, { draft_name: newName })
      await fetchDrafts()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to rename draft')
    }
  }

  const deleteDraft = async (draftId: string) => {
    try {
      await applicationService.delete(draftId)
    } catch (err: unknown) {
      // 404 means the draft is already gone — treat as success
      const status = (err as { status?: number })?.status
      const message = err instanceof Error ? err.message : ''
      const is404 = status === 404 || message.includes('404') || message.includes('Not Found')
      if (!is404) {
        setError(err instanceof Error ? err.message : 'An error occurred')
        return
      }
    }
    await fetchDrafts()
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

  return {
    drafts,
    loading,
    error,
    createDraft,
    updateDraft,
    renameDraft,
    deleteDraft,
    loadDraft,
    refreshDrafts: fetchDrafts
  }
}
