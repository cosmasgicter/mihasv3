import { useState, useEffect } from 'react'
import { applicationService } from '@/services/applications'

interface Draft {
  id: string
  draft_name: string
  draft_data: any
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
      const result = await applicationService.list({ mine: true, status: 'draft' })
      const apps = result?.applications ?? []
      // Map applications to draft shape
      const mappedDrafts: Draft[] = apps.map((app: any) => ({
        id: app.id,
        draft_name: app.draft_name || `Draft - ${app.program || 'Untitled'}`,
        draft_data: app,
        updated_at: app.updated_at || app.created_at,
        last_accessed_at: app.updated_at || app.created_at,
        is_active: true
      }))
      setDrafts(mappedDrafts)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createDraft = async (draftName: string, draftData: any) => {
    if (!userId) return null

    try {
      const result = await applicationService.create({
        ...draftData,
        status: 'draft',
        draft_name: draftName
      })
      await fetchDrafts()
      return result
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }

  const updateDraft = async (draftId: string, draftData: any) => {
    try {
      await applicationService.update(draftId, draftData)
      await fetchDrafts()
    } catch (err: any) {
      setError(err.message)
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
    } catch (err: any) {
      // 404 means the draft is already gone — treat as success
      const is404 = err?.status === 404 || err?.message?.includes('404') || err?.message?.includes('Not Found')
      if (!is404) {
        setError(err.message)
        return
      }
    }
    await fetchDrafts()
  }

  const loadDraft = async (draftId: string) => {
    try {
      const result = await applicationService.getById(draftId)
      return result?.application ?? null
    } catch (err: any) {
      setError(err.message)
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
