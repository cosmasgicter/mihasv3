/**
 * Where the app bar's back arrow goes (task 25.1, design §12.4).
 *
 * `navigate(-1)` leaves the app when the page was opened from a link or a fresh
 * load, because there is no earlier entry of ours to go back to. React Router
 * marks that first entry with the location key `"default"`. On the wizard route
 * the arrow therefore goes back in history only when an earlier entry is inside
 * the app, and to the student dashboard otherwise. Every other route keeps
 * `navigate(-1)`.
 */
export type BackAction = { kind: 'history' } | { kind: 'path'; path: string }

export interface BackActionInput {
  isWizardRoute: boolean
  /** `useLocation().key`; `"default"` marks the first entry of the session. */
  locationKey: string
  /**
   * React Router's `window.history.state.idx`, when known. A `replace` navigation
   * (the wizard rewrites `?step=` this way) gives the first entry a fresh key, so
   * the key alone would call a fresh load "inside the app". Index 0 is the first
   * entry whatever its key.
   */
  historyIndex?: number | null
  dashboardPath: string
}

export function resolveBackAction({
  isWizardRoute,
  locationKey,
  historyIndex = null,
  dashboardPath,
}: BackActionInput): BackAction {
  const firstEntry = locationKey === 'default' || historyIndex === 0
  if (isWizardRoute && firstEntry) {
    return { kind: 'path', path: dashboardPath }
  }
  return { kind: 'history' }
}
