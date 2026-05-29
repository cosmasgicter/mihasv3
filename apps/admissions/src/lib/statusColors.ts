/**
 * Canonical application-status color helpers.
 *
 * Two palettes exist by design:
 *   - `application` (default): design-token-based badge classes used in
 *     student list items, detail pages, and admin tables.
 *   - `timeline`: explicit light/dark classes used in history timelines
 *     and communication panels where the token palette is too subtle.
 *
 * All consumers should import from this module instead of defining local
 * STATUS_COLORS maps.
 */

// ─── Application badge palette (design tokens) ───

const APPLICATION_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-foreground border border-border',
  pending: 'bg-warning/20 text-foreground border border-warning/30',
  pending_review: 'bg-warning/20 text-foreground border border-warning/30',
  under_review: 'bg-info/20 text-foreground border border-info/30',
  in_progress: 'bg-info/20 text-foreground border border-info/30',
  approved: 'bg-success/20 text-foreground border border-success/30',
  verified: 'bg-success/20 text-foreground border border-success/30',
  completed: 'bg-success/20 text-foreground border border-success/30',
  rejected: 'bg-destructive/20 text-foreground border border-destructive/30',
  declined: 'bg-destructive/20 text-foreground border border-destructive/30',
  cancelled: 'bg-destructive/20 text-foreground border border-destructive/30',
  expired: 'bg-muted text-foreground border border-border',
}

const APPLICATION_FALLBACK = 'bg-muted text-foreground border border-border'

// ─── Timeline palette (explicit dark mode) ───

const TIMELINE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800/40 dark:text-gray-400',
  submitted: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  under_review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  waitlisted: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
}

const TIMELINE_FALLBACK = 'bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400'

// ─── Public API ───

export type StatusColorDomain = 'application' | 'timeline'

/**
 * Return the CSS class string for a given status in the specified domain.
 *
 * @param domain - Which color palette to use.
 * @param status - The application/transition status string.
 */
export function getStatusColor(domain: StatusColorDomain, status: string | null | undefined): string {
  if (!status) {
    return domain === 'timeline' ? TIMELINE_FALLBACK : APPLICATION_FALLBACK
  }

  const key = status.toLowerCase()

  if (domain === 'timeline') {
    return TIMELINE_STATUS_COLORS[key] ?? TIMELINE_FALLBACK
  }

  return APPLICATION_STATUS_COLORS[key] ?? APPLICATION_FALLBACK
}

/**
 * Shortcut: application-domain status color (backward-compatible with
 * the signature previously exported from `@/lib/utils`).
 */
export function getApplicationStatusColor(status: string | null | undefined): string {
  return getStatusColor('application', status)
}

/**
 * Shortcut: timeline-domain status color (backward-compatible with the
 * inline maps previously in History.tsx and AdminCommunicationsPanel).
 */
export function getTimelineStatusColor(status: string | null | undefined): string {
  return getStatusColor('timeline', status)
}
