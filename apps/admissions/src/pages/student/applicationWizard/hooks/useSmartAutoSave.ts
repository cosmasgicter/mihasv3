/**
 * The wizard's autosave VIEW (admissions-v2 task 6.3 — R10.2, R10.7; finding
 * STU-02).
 *
 * This hook used to be one of the draft's cooperating owners: it detected edits,
 * debounced, ran the 8-second interval, queued offline work, retried, tracked
 * conflicts and decided the save state — while `useWizardDraftPersistence`
 * separately chose start-versus-update and `index.tsx` wrote on step navigation.
 * All of that now lives in one place, the draft machine
 * (`lib/wizardDraftController.ts`).
 *
 * What is left is a view: it applies the wizard's autosave gate to the machine
 * (paused while an upload, a payment in progress or a step command is running)
 * and projects the machine's snapshot onto the save-state vocabulary the action
 * bar renders — saving, saved, offline, retrying, conflict (R10.7). It never
 * writes the draft and never blocks typing.
 */
import { useEffect } from 'react'

import { wizardDraftSaveLabel } from '@/lib/wizardDraftMachine'
import {
  deriveWizardDraftSaveView,
  type WizardDraftController,
  type WizardDraftSnapshot,
} from '@/lib/wizardDraftController'

interface UseSmartAutoSaveProps {
  machine: WizardDraftController
  snapshot: WizardDraftSnapshot
  /**
   * The autosave gate. False while an upload, a payment in progress or a step
   * command is running; edits are still recorded and are written when it opens.
   */
  enabled?: boolean
}

export const useSmartAutoSave = ({ machine, snapshot, enabled = true }: UseSmartAutoSaveProps) => {
  useEffect(() => {
    machine.setPaused(!enabled)
  }, [machine, enabled])

  const view = deriveWizardDraftSaveView(snapshot)

  return {
    saveStatus: view.status,
    saveError: view.message,
    lastSaved: snapshot.lastSavedAt === null ? null : new Date(snapshot.lastSavedAt),
    isDirty: snapshot.pending,
    isSaving: snapshot.state === 'saving',
    hasUnsavedChanges: snapshot.hasUnsyncedWork,
    isOnline: snapshot.online,
    isAuthExpired: snapshot.authExpired,
    saveAttempts: snapshot.retryAttempts,
    draftState: snapshot.state,
    draftSaveLabel: wizardDraftSaveLabel(snapshot.state),
    /** Save now. An unchanged draft writes nothing. */
    forceSave: () => machine.saveNow(),
    /** Conflict: take the newer version. */
    reloadLatest: () => machine.resolveReload(),
    /** Conflict: keep the student's changes on top of the newer version (explicit merge). */
    keepMyChanges: () => machine.resolveMerge(),
  }
}
