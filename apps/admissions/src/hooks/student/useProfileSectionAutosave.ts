/**
 * Per-section profile/settings autosave state machine (admissions-v2 task 6.1).
 *
 * Owns the canonical autosave behaviour for the student Settings page:
 * debounced autosave, an in-memory offline outbox, bounded retry with
 * exponential backoff, version-token conflict detection, and explicit
 * per-section save state. It also owns the single `beforeunload` guard so the
 * page component no longer owns navigation/unload protection (finding STU-20).
 *
 * Privacy (R9.5): the outbox is in-memory only. Profile edits (NRC, DOB,
 * phone, address) are sensitive PII and are never written to localStorage.
 *
 * Design: §8.2 Frontend Draft Machine, §14.2 Idempotency And Concurrency.
 * Requirements: R9.3, R9.5, R9.8, R16.5-R16.8.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AuthenticationError } from '@/services/client'
import { logger } from '@/lib/logger'
import { toError } from '@/lib/toError'
import {
  computeBackoffDelay,
  isUnsyncedStatus,
  isVersionConflict,
  PROFILE_SECTION_IDS,
  type ProfileSectionId,
  type SectionSaveStatus,
} from '@/lib/profileAutosave'

const SESSION_EXPIRED_MESSAGE =
  'Your changes are held on this device while we reconnect your session.'
const OFFLINE_MESSAGE = 'Offline — your changes will save automatically when you reconnect.'
const RETRY_MESSAGE = 'Could not reach the server. Retrying…'
const FAILED_MESSAGE = 'Could not save your changes. Please try again.'
const CONFLICT_MESSAGE =
  'Your profile changed in another session. Reload the latest version or keep your edits.'

export interface ProfileAutosaveResult {
  updated_at?: string
  [key: string]: unknown
}

export type ProfileSaveFn = (
  delta: Record<string, unknown>,
) => Promise<ProfileAutosaveResult>

export interface ProfileSectionState {
  status: SectionSaveStatus
  error: string | null
  lastSavedAt: number | null
  attempts: number
}

export interface UseProfileSectionAutosaveOptions {
  save: ProfileSaveFn
  onSaved?: (
    result: ProfileAutosaveResult,
    delta: Record<string, unknown>,
    sectionId: ProfileSectionId,
  ) => void
  onError?: (error: unknown, sectionId: ProfileSectionId) => void
  debounceMs?: number
  maxRetries?: number
  enabled?: boolean
}

export interface UseProfileSectionAutosaveResult {
  sections: Record<ProfileSectionId, ProfileSectionState>
  scheduleSave: (sectionId: ProfileSectionId, delta: Record<string, unknown>) => void
  markDirty: (sectionId: ProfileSectionId) => void
  saveNow: (sectionId?: ProfileSectionId) => void
  retry: (sectionId: ProfileSectionId) => void
  registerServerVersion: (version: string | undefined) => void
  resolveConflict: (sectionId: ProfileSectionId, choice: 'reload' | 'keep') => void
  hasPendingWork: boolean
  isOnline: boolean
}

const IDLE_STATE: ProfileSectionState = {
  status: 'idle',
  error: null,
  lastSavedAt: null,
  attempts: 0,
}

function createInitialSections(): Record<ProfileSectionId, ProfileSectionState> {
  return PROFILE_SECTION_IDS.reduce((acc, id) => {
    acc[id] = { ...IDLE_STATE }
    return acc
  }, {} as Record<ProfileSectionId, ProfileSectionState>)
}

function isAuthFailure(error: unknown): boolean {
  return (
    error instanceof AuthenticationError ||
    (error instanceof Error && error.name === 'AuthenticationError')
  )
}

export function useProfileSectionAutosave(
  options: UseProfileSectionAutosaveOptions,
): UseProfileSectionAutosaveResult {
  const {
    save,
    onSaved,
    onError,
    debounceMs = 1200,
    maxRetries = 5,
    enabled = true,
  } = options

  const [sections, setSections] = useState<Record<ProfileSectionId, ProfileSectionState>>(
    createInitialSections,
  )
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  // In-memory outbox — pending (unsent) delta per section. Never persisted.
  const pendingRef = useRef<Record<ProfileSectionId, Record<string, unknown>>>({
    applicant: {},
    residence: {},
    emergency: {},
  })
  const debounceTimers = useRef<Partial<Record<ProfileSectionId, ReturnType<typeof setTimeout>>>>({})
  const retryTimers = useRef<Partial<Record<ProfileSectionId, ReturnType<typeof setTimeout>>>>({})
  const inFlightRef = useRef<Partial<Record<ProfileSectionId, boolean>>>({})
  const attemptsRef = useRef<Record<ProfileSectionId, number>>({
    applicant: 0,
    residence: 0,
    emergency: 0,
  })
  const baseVersionRef = useRef<string | undefined>(undefined)
  const authExpiredRef = useRef(false)
  const mountedRef = useRef(true)
  // Ref mirror of section states so stable callbacks can read the latest state.
  const sectionsRef = useRef(sections)

  const patchSection = useCallback(
    (sectionId: ProfileSectionId, patch: Partial<ProfileSectionState>) => {
      if (!mountedRef.current) return
      setSections((prev) => ({ ...prev, [sectionId]: { ...prev[sectionId], ...patch } }))
    },
    [],
  )

  const hasPendingForSection = useCallback((sectionId: ProfileSectionId) => {
    return Object.keys(pendingRef.current[sectionId]).length > 0
  }, [])

  const flush = useCallback(
    async (sectionId: ProfileSectionId, isManual = false) => {
      if (!enabled) return
      const timer = debounceTimers.current[sectionId]
      if (timer) {
        clearTimeout(timer)
        delete debounceTimers.current[sectionId]
      }

      if (!hasPendingForSection(sectionId)) return

      // Session expired — hold locally, do not spin the network.
      if (authExpiredRef.current) {
        patchSection(sectionId, { status: 'error', error: SESSION_EXPIRED_MESSAGE })
        return
      }

      // Offline — keep the delta queued in memory; it flushes on reconnect.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        patchSection(sectionId, { status: 'offline', error: OFFLINE_MESSAGE })
        return
      }

      if (inFlightRef.current[sectionId]) {
        // A save is running; the newest delta is already merged into pending.
        return
      }

      const delta = { ...pendingRef.current[sectionId] }
      pendingRef.current[sectionId] = {}
      inFlightRef.current[sectionId] = true
      patchSection(sectionId, { status: 'saving', error: null })

      try {
        const result = await save(delta)
        attemptsRef.current[sectionId] = 0
        if (result && typeof result.updated_at === 'string') {
          baseVersionRef.current = result.updated_at
        }
        patchSection(sectionId, {
          status: 'saved',
          error: null,
          lastSavedAt: Date.now(),
          attempts: 0,
        })
        onSaved?.(result, delta, sectionId)
      } catch (error) {
        if (isAuthFailure(error)) {
          authExpiredRef.current = true
          attemptsRef.current[sectionId] = 0
          // Re-queue the delta so it syncs once the session recovers.
          pendingRef.current[sectionId] = { ...delta, ...pendingRef.current[sectionId] }
          patchSection(sectionId, { status: 'error', error: SESSION_EXPIRED_MESSAGE, attempts: 0 })
          onError?.(error, sectionId)
          return
        }

        // Recoverable failure — re-queue the delta and retry with backoff.
        pendingRef.current[sectionId] = { ...delta, ...pendingRef.current[sectionId] }
        const nextAttempt = attemptsRef.current[sectionId] + 1
        attemptsRef.current[sectionId] = nextAttempt
        logger.warn('Profile autosave failed; will retry', toError(error).message)

        if (nextAttempt < maxRetries) {
          patchSection(sectionId, { status: 'retrying', error: RETRY_MESSAGE, attempts: nextAttempt })
          const delay = computeBackoffDelay(nextAttempt)
          retryTimers.current[sectionId] = setTimeout(() => {
            void flush(sectionId)
          }, delay)
        } else {
          patchSection(sectionId, { status: 'error', error: FAILED_MESSAGE, attempts: nextAttempt })
          onError?.(error, sectionId)
        }
      } finally {
        inFlightRef.current[sectionId] = false
        // If new edits arrived while the request was in flight, save them.
        if (mountedRef.current && hasPendingForSection(sectionId) && !authExpiredRef.current) {
          if (typeof navigator === 'undefined' || navigator.onLine) {
            if (isManual) {
              void flush(sectionId, true)
            } else {
              const t = setTimeout(() => void flush(sectionId), debounceMs)
              debounceTimers.current[sectionId] = t
            }
          }
        }
      }
    },
    [enabled, hasPendingForSection, patchSection, save, onSaved, onError, maxRetries, debounceMs],
  )

  const markDirty = useCallback(
    (sectionId: ProfileSectionId) => {
      patchSection(sectionId, { status: 'dirty', error: null })
    },
    [patchSection],
  )

  const scheduleSave = useCallback(
    (sectionId: ProfileSectionId, delta: Record<string, unknown>) => {
      if (!enabled) return
      if (Object.keys(delta).length === 0) return

      pendingRef.current[sectionId] = { ...pendingRef.current[sectionId], ...delta }

      const timer = debounceTimers.current[sectionId]
      if (timer) clearTimeout(timer)

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        patchSection(sectionId, { status: 'offline', error: OFFLINE_MESSAGE })
        return
      }

      patchSection(sectionId, { status: 'dirty', error: null })
      debounceTimers.current[sectionId] = setTimeout(() => {
        void flush(sectionId)
      }, debounceMs)
    },
    [enabled, debounceMs, flush, patchSection],
  )

  const saveNow = useCallback(
    (sectionId?: ProfileSectionId) => {
      const targets = sectionId ? [sectionId] : PROFILE_SECTION_IDS
      for (const id of targets) {
        void flush(id, true)
      }
    },
    [flush],
  )

  const retry = useCallback(
    (sectionId: ProfileSectionId) => {
      attemptsRef.current[sectionId] = 0
      authExpiredRef.current = false
      const timer = retryTimers.current[sectionId]
      if (timer) {
        clearTimeout(timer)
        delete retryTimers.current[sectionId]
      }
      void flush(sectionId, true)
    },
    [flush],
  )

  const registerServerVersion = useCallback(
    (version: string | undefined) => {
      if (!version) return
      const base = baseVersionRef.current
      if (base === undefined) {
        // First observation — adopt as the base version.
        baseVersionRef.current = version
        return
      }
      if (!isVersionConflict(base, version)) return

      // The server advanced. If we hold unsynced work for a section, that
      // section is in conflict; otherwise adopt the new version silently.
      let anyPending = false
      for (const id of PROFILE_SECTION_IDS) {
        if (hasPendingForSection(id) || isUnsyncedStatus(sectionsRef.current[id].status)) {
          anyPending = true
          const timer = debounceTimers.current[id]
          if (timer) clearTimeout(timer)
          patchSection(id, { status: 'conflict', error: CONFLICT_MESSAGE })
        }
      }
      if (!anyPending) {
        baseVersionRef.current = version
      }
    },
    [hasPendingForSection, patchSection],
  )

  const resolveConflict = useCallback(
    (sectionId: ProfileSectionId, choice: 'reload' | 'keep') => {
      if (choice === 'reload') {
        pendingRef.current[sectionId] = {}
        attemptsRef.current[sectionId] = 0
        patchSection(sectionId, { status: 'idle', error: null })
      } else {
        // Keep local edits: overwrite the server version with our pending delta.
        patchSection(sectionId, { status: 'dirty', error: null })
        void flush(sectionId, true)
      }
    },
    [flush, patchSection],
  )

  // Keep the ref mirror of section states current for stable callbacks.
  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  // Online/offline lifecycle — flush the in-memory outbox on reconnect.
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      for (const id of PROFILE_SECTION_IDS) {
        if (hasPendingForSection(id) && !authExpiredRef.current) {
          void flush(id)
        }
      }
    }
    const handleOffline = () => {
      setIsOnline(false)
      for (const id of PROFILE_SECTION_IDS) {
        if (hasPendingForSection(id)) {
          patchSection(id, { status: 'offline', error: OFFLINE_MESSAGE })
        }
      }
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [flush, hasPendingForSection, patchSection])

  const hasPendingWork = useMemo(
    () => PROFILE_SECTION_IDS.some((id) => isUnsyncedStatus(sections[id].status)),
    [sections],
  )
  const hasPendingWorkRef = useRef(hasPendingWork)
  useEffect(() => {
    hasPendingWorkRef.current = hasPendingWork
  }, [hasPendingWork])

  // The autosave hook owns the single beforeunload guard (STU-20): the page
  // component no longer owns navigation/unload protection. We only warn when
  // there is genuinely unsynchronised work (queued/saving/retrying/error).
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPendingWorkRef.current) return
      // Best-effort: attempt to flush anything still queued.
      for (const id of PROFILE_SECTION_IDS) {
        if (hasPendingForSection(id)) void flush(id, true)
      }
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [flush, hasPendingForSection])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const id of PROFILE_SECTION_IDS) {
        const dt = debounceTimers.current[id]
        if (dt) clearTimeout(dt)
        const rt = retryTimers.current[id]
        if (rt) clearTimeout(rt)
      }
    }
  }, [])

  return {
    sections,
    scheduleSave,
    markDirty,
    saveNow,
    retry,
    registerServerVersion,
    resolveConflict,
    hasPendingWork,
    isOnline,
  }
}
