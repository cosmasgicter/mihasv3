/**
 * React binding for the wizard draft machine (admissions-v2 task 6.3 — R10.2,
 * R10.7; finding STU-02).
 *
 * One machine per mounted wizard. This hook is deliberately thin: it creates
 * the machine, turns browser events into machine events (online / offline,
 * session expired / recovered, page hidden / unloading) and exposes the
 * machine's snapshot to React. It decides nothing — every rule about when to
 * save, retry or stop lives in `lib/wizardDraftController.ts`.
 *
 * The `beforeunload` guard lives here, and only here: it reads the machine's
 * snapshot, so a draft the server already holds never asks the student whether
 * to leave, and work the account does not hold yet always does.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react'

import {
  BROWSER_EVENTS,
  LEGACY_BROWSER_EVENTS,
  listenWithLegacyEventFallback,
} from '@/lib/browserNamespace'
import {
  WizardDraftController,
  createInertWizardDraftAdapters,
  type WizardDraftSnapshot,
} from '@/lib/wizardDraftController'

const UNLOAD_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?'

export interface WizardDraftMachineBinding {
  machine: WizardDraftController
  snapshot: WizardDraftSnapshot
}

export function useWizardDraftMachine(): WizardDraftMachineBinding {
  const machineRef = useRef<WizardDraftController | null>(null)
  if (machineRef.current === null) {
    machineRef.current = new WizardDraftController(createInertWizardDraftAdapters())
  }
  const machine = machineRef.current

  useEffect(() => {
    machine.activate()
    return () => machine.dispose()
  }, [machine])

  useEffect(() => {
    const handleOnline = () => machine.networkRestored()
    const handleOffline = () => machine.networkLost()
    const handleVisibility = () => {
      if (document.visibilityState !== 'hidden') return
      machine.persistLocal()
      void machine.flush()
    }
    const handlePageHide = () => machine.persistLocal()
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      machine.persistLocal()
      const snapshot = machine.getSnapshot()
      // Ask only when the work is not in the student's account: unsynced work,
      // or a new application that so far exists only on this device.
      if (!snapshot.hasUnsyncedWork && !snapshot.localOnly) return undefined
      event.preventDefault()
      event.returnValue = UNLOAD_MESSAGE
      return UNLOAD_MESSAGE
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibility)
    const removeRecovered = listenWithLegacyEventFallback(
      window,
      BROWSER_EVENTS.authRecovered,
      [LEGACY_BROWSER_EVENTS.authRecovered],
      () => machine.authRecovered(),
    )
    const removeExpired = listenWithLegacyEventFallback(
      window,
      BROWSER_EVENTS.authExpired,
      [LEGACY_BROWSER_EVENTS.authExpired],
      () => machine.authExpiredExternally(),
    )
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibility)
      removeRecovered()
      removeExpired()
    }
  }, [machine])

  const snapshot = useSyncExternalStore(machine.subscribe, machine.getSnapshot, machine.getSnapshot)
  return { machine, snapshot }
}
