import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

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
      const { data, error: fetchError } = await supabase
        .from('application_drafts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('updated_at', { ascending: false })

      if (fetchError) throw fetchError
      setDrafts(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const createDraft = async (draftName: string, draftData: any) => {
    if (!userId) return null

    try {
      const { data, error: createError } = await supabase
        .from('application_drafts')
        .insert({
          user_id: userId,
          draft_name: draftName,
          draft_data: draftData,
          is_active: true
        })
        .select()
        .single()

      if (createError) throw createError
      await fetchDrafts()
      return data
    } catch (err: any) {
      setError(err.message)
      return null
    }
  }

  const updateDraft = async (draftId: string, draftData: any) => {
    try {
      const { error: updateError } = await supabase
        .from('application_drafts')
        .update({ 
          draft_data: draftData,
          updated_at: new Date().toISOString()
        })
        .eq('id', draftId)

      if (updateError) throw updateError
      await fetchDrafts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const renameDraft = async (draftId: string, newName: string) => {
    try {
      const { error: renameError } = await supabase
        .from('application_drafts')
        .update({ draft_name: newName })
        .eq('id', draftId)

      if (renameError) throw renameError
      await fetchDrafts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const deleteDraft = async (draftId: string) => {
    try {
      const { error: deleteError } = await supabase
        .from('application_drafts')
        .update({ is_active: false })
        .eq('id', draftId)

      if (deleteError) throw deleteError
      await fetchDrafts()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const loadDraft = async (draftId: string) => {
    try {
      const { data, error: loadError } = await supabase
        .from('application_drafts')
        .select('draft_data')
        .eq('id', draftId)
        .single()

      if (loadError) throw loadError
      return data?.draft_data
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
