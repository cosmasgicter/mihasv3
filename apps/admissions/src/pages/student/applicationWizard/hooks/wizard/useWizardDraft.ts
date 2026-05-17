/**
 * useWizardDraft — Phase 4 wizard hook (scaffold).
 *
 * Owns draft load/save/sync orchestration. Delegates the actual server
 * persistence to a caller-supplied `persist` function so the hook stays
 * decoupled from the specific service module shape.
 *
 * This is a Phase 4 scaffold. Full integration happens when the next-sprint
 * PR wires it into useWizardController, replacing the inline saveDraft
 * orchestration. The scaffold defines the public API and the save-status
 * state machine.
 *
 * Stream 8 of canonical-truth program. Decision A6 — Phase 4 of 6.
 */

import { useCallback, useState, useRef } from 'react'

export type DraftSaveStatus =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'error'
  | 'offline'
  | 'conflict'

export interface UseWizardDraftOptions {
  /** Application ID currently associated with the wizard; null until first save. */
  applicationId: string | null
  /**
   * Caller-supplied persistence function. Resolves with the saved
   * applicationId (or null if no server persistence happened). Throw to
   * surface a save error in the hook's `saveError` state.
   */
  persist: (options: { syncServer: boolean }) => Promise<string | null>
  /** Skip draft sync (e.g. during a restore). */
  skip?: boolean
}

export interface UseWizardDraftResult {
  isDraftSaving: boolean
  draftSaved: boolean
  draftLoaded: boolean
  saveStatus: DraftSaveStatus
  saveError: string | null
  /** Save the draft now. Returns the resolved applicationId, if any. */
  saveDraft: (options?: { syncServer?: boolean }) => Promise<string | null>
  /** Mark the draft as loaded (called after successful initial load). */
  markDraftLoaded: () => void
  /** Reset the saved/error flags (used after a successful submit). */
  reset: () => void
}

/**
 * Encapsulate the wizard's draft sync state machine.
 *
 * Single in-flight save: if a save is already running and another `saveDraft`
 * call comes in, the second is dropped (the running save will pick up the
 * latest form state when it completes via the caller's `persist` snapshot).
 */
export function useWizardDraft(options: UseWizardDraftOptions): UseWizardDraftResult {
  const { applicationId, persist, skip = false } = options
  const [isDraftSaving, setIsDraftSaving] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [draftLoaded, setDraftLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<DraftSaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const isSavingRef = useRef(false)

  const markDraftLoaded = useCallback(() => setDraftLoaded(true), [])

  const reset = useCallback(() => {
    setDraftSaved(false)
    setSaveStatus('idle')
    setSaveError(null)
  }, [])

  const saveDraft = useCallback(
    async (saveOptions: { syncServer?: boolean } = {}): Promise<string | null> => {
      if (skip) return applicationId
      if (isSavingRef.current) return applicationId

      const shouldSync = saveOptions.syncServer ?? true

      isSavingRef.current = true
      setIsDraftSaving(true)
      setSaveStatus('saving')
      setSaveError(null)

      try {
        const next = await persist({ syncServer: shouldSync })
        setDraftSaved(true)
        setSaveStatus('saved')
        return next ?? applicationId
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save draft'
        setSaveError(message)

        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          setSaveStatus('offline')
        } else if (message.toLowerCase().includes('conflict')) {
          setSaveStatus('conflict')
        } else {
          setSaveStatus('error')
        }
        return applicationId
      } finally {
        isSavingRef.current = false
        setIsDraftSaving(false)
      }
    },
    [applicationId, persist, skip]
  )

  return {
    isDraftSaving,
    draftSaved,
    draftLoaded,
    saveStatus,
    saveError,
    saveDraft,
    markDraftLoaded,
    reset,
  }
}
