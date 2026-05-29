/**
 * Single Zustand store that replaces the brittle ``window.dispatchEvent``
 * draft bus that previously synchronised the wizard, dashboard,
 * ContinueApplication card, and the multi-draft list.
 *
 * Anything that mutates a draft (save, clear, mark stale) calls the
 * matching mutator on this store. Consumers subscribe via the selector
 * hooks below — the React Query cache for ``['applications', { mine: true,
 * status: 'draft' }]`` is invalidated automatically on every revision
 * bump, so the multi-draft list and dashboard counts stay in sync
 * without a custom event listener.
 *
 * The legacy ``window`` events (``applicationDraftSaved``,
 * ``applicationDraftStale``, ``draftCleared``) are still dispatched for
 * back-compat by the call sites that already do so. New consumers should
 * use the selectors here instead of ``window.addEventListener``.
 */

import { create } from 'zustand'

export type DraftSnapshot = {
  applicationId?: string | null
  savedAt?: string
  // Free-form metadata — kept loose so call sites do not have to update
  // this type whenever the wizard payload shape evolves.
  [key: string]: unknown
}

export interface DraftStoreState {
  /** Monotonic counter — bumps on every save/clear/stale event. */
  revision: number
  /** Most recent snapshot the wizard reported. */
  lastSnapshot: DraftSnapshot | null
  /** ID of the draft most recently flagged as stale. */
  staleApplicationId: string | null
  /** True between ``markCleared()`` and the next ``markSaved()``. */
  recentlyCleared: boolean
  markSaved: (snapshot?: DraftSnapshot | null) => void
  markCleared: () => void
  markStale: (applicationId: string | null | undefined) => void
  reset: () => void
}

export const useDraftStore = create<DraftStoreState>((set) => ({
  revision: 0,
  lastSnapshot: null,
  staleApplicationId: null,
  recentlyCleared: false,
  markSaved: (snapshot) => set((s) => ({
    revision: s.revision + 1,
    lastSnapshot: snapshot ?? s.lastSnapshot,
    recentlyCleared: false,
  })),
  markCleared: () => set((s) => ({
    revision: s.revision + 1,
    lastSnapshot: null,
    staleApplicationId: null,
    recentlyCleared: true,
  })),
  markStale: (applicationId) => set((s) => ({
    revision: s.revision + 1,
    staleApplicationId: applicationId ?? null,
  })),
  reset: () => set({
    revision: 0,
    lastSnapshot: null,
    staleApplicationId: null,
    recentlyCleared: false,
  }),
}))

/**
 * Subscribe to the draft revision counter. Components that previously
 * listened on ``window`` for ``applicationDraftSaved`` / ``draftCleared``
 * can read this value instead and refetch when it changes.
 */
export const useDraftRevision = (): number => useDraftStore((s) => s.revision)
