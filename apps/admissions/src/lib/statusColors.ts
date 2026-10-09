/**
 * Canonical application-status color helpers.
 *
 * Two palettes exist by design, and since admissions-v2 task 11.5 both are
 * written in the same semantic-token vocabulary — they differ in fill strength,
 * not in colour system:
 *   - `application` (default): badge classes used in student list items, detail
 *     pages, and admin tables — a `/20` tint with `text-foreground`.
 *   - `timeline`: the paired from/to pills in history timelines and communication
 *     panels — a lighter `/15` tint, which separates two adjacent pills the badge
 *     palette's `/20` would run together.
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

// ─── Timeline palette (semantic tokens, stronger fill) ───

/**
 * The timeline palette exists because a history entry renders **two** pills side
 * by side — the status a transition moved *from* and the one it moved *to* — and
 * the badge palette's `/20` fill reads as one continuous band at that size. So
 * the timeline keeps its own, more saturated fill and coloured text.
 *
 * What it no longer keeps is its own **vocabulary** (admissions-v2 task 11.5,
 * R16.4). It was written in raw Tailwind palette steps (`bg-blue-100
 * text-blue-700`, plus a `dark:` variant per entry for a mode this app does not
 * have), which is a second colour system for the same domain concept. Every
 * entry now resolves through the same semantic tokens as `StatusBadge` and the
 * badge palette above: `--color-info-rgb`, `--color-warning-rgb`,
 * `--color-success-rgb`, `--color-destructive-rgb`, each documented AA as text on
 * the card background.
 *
 * Colour is never the only signal here: both call sites render the status **word**
 * inside the pill, and the transition arrow between them carries the direction.
 *
 * The **text** is `text-foreground`, not the tone, and that is a measured
 * decision rather than a stylistic one. A tone-coloured label on its own `/15`
 * tint does not clear AA — `--color-info` #2563eb over a 15 % #2563eb wash on
 * white is **4.18 : 1**, and axe called it `[serious] color-contrast @
 * .bg-info/15` on `/student/history` the first time this map was tokenized. The
 * raw palette it replaced (`bg-blue-100 text-blue-700`) was 5.54 : 1, so the
 * thing wrong with the old map was its vocabulary, never its contrast, and the
 * replacement has to keep the ratio it inherited. `text-foreground` #0f172a on
 * the same wash is ≈ 16 : 1; the tone stays in the fill, where a large flat area
 * is not text and is not held to 4.5 : 1.
 */
const TIMELINE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-foreground',
  submitted: 'bg-info/15 text-foreground',
  under_review: 'bg-warning/15 text-foreground',
  approved: 'bg-success/15 text-foreground',
  rejected: 'bg-destructive/15 text-foreground',
  waitlisted: 'bg-warning/15 text-foreground',
}

const TIMELINE_FALLBACK = 'bg-muted text-foreground'

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
