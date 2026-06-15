/**
 * Centralized date formatting utilities for the Beanola admissions platform.
 * All components should use these functions instead of inline date formatting.
 *
 * @module dateFormat
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function toSafeDate(iso: string | number | Date | null | undefined): Date | null {
  if (!iso) return null
  const date = iso instanceof Date ? iso : new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Format a date as "15 Jan 2025".
 * Returns "Not available" for falsy/invalid input.
 */
export function formatDate(iso: string | number | Date | null | undefined): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/**
 * Format a timestamp as "15 Jan 2025, 14:30".
 * Returns "Not available" for falsy/invalid input.
 */
export function formatTimestamp(iso: string | number | Date | null | undefined): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes}`
}

/**
 * Format a date as relative time ("2 hours ago") if within 7 days,
 * otherwise as absolute "15 Jan 2025".
 * Returns "Not available" for falsy/invalid input.
 */
export function formatRelative(iso: string | number | Date | null | undefined, now?: Date): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'

  const ref = now ?? new Date()
  const diffMs = ref.getTime() - date.getTime()

  // Future dates or older than 7 days → absolute format
  if (diffMs < 0 || diffMs >= SEVEN_DAYS_MS) {
    return formatDate(date)
  }

  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return 'Just now'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  return `${diffDays} days ago`
}

/**
 * Convert an ISO timestamp to "YYYY-MM-DD" for `<input type="date">`.
 * Returns empty string for falsy/invalid input.
 *
 * This replaces `normalizeDateInputValue` from profileFieldMapping.ts
 * for new usage, but that function is kept for backward compatibility.
 */
export function toDateInputValue(iso: string | number | Date | null | undefined): string {
  if (!iso) return ''

  // Already in YYYY-MM-DD format
  if (typeof iso === 'string') {
    const trimmed = iso.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  }

  const date = toSafeDate(iso)
  if (!date) return ''

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ─── Extended helpers (added to replace direct date-fns imports) ───

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/**
 * Always-relative time distance with suffix ("2 hours ago", "3 days ago").
 * Unlike `formatRelative`, this never falls back to absolute format.
 * Returns "Not available" for falsy/invalid input.
 */
export function formatDistanceFromNow(iso: string | number | Date | null | undefined, now?: Date): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'

  const ref = now ?? new Date()
  const diffMs = ref.getTime() - date.getTime()

  if (diffMs < 0) {
    const absDiff = Math.abs(diffMs)
    const mins = Math.floor(absDiff / 60000)
    if (mins < 1) return 'in less than a minute'
    if (mins < 60) return `in ${mins} minute${mins === 1 ? '' : 's'}`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `in ${hrs} hour${hrs === 1 ? '' : 's'}`
    const days = Math.floor(hrs / 24)
    return `in ${days} day${days === 1 ? '' : 's'}`
  }

  const diffSeconds = Math.floor(diffMs / 1000)
  if (diffSeconds < 60) return 'less than a minute ago'

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes === 1) return '1 minute ago'
  if (diffMinutes < 60) return `${diffMinutes} minutes ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours === 1) return '1 hour ago'
  if (diffHours < 24) return `${diffHours} hours ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return '1 day ago'
  if (diffDays < 30) return `${diffDays} days ago`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return 'about 1 month ago'
  if (diffMonths < 12) return `${diffMonths} months ago`

  const diffYears = Math.floor(diffMonths / 12)
  if (diffYears === 1) return 'about 1 year ago'
  return `${diffYears} years ago`
}

/**
 * Format as "Jan 15, 2025" (month abbreviated, day, year).
 * Returns "Not available" for falsy/invalid input.
 */
export function formatDateMedium(iso: string | number | Date | null | undefined): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/**
 * Format as "January 15, 2025 at 2:30 PM" (long date with 12-hour time).
 * Returns "Not available" for falsy/invalid input.
 */
export function formatDateTimeLong(iso: string | number | Date | null | undefined): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const h12 = hours % 12 || 12
  return `${MONTHS_FULL[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()} at ${h12}:${minutes} ${ampm}`
}

/**
 * Format as "29 May 2025 14:30:45" (day month year with seconds).
 * Returns "Not available" for falsy/invalid input.
 */
export function formatTimestampFull(iso: string | number | Date | null | undefined): string {
  const date = toSafeDate(iso)
  if (!date) return 'Not available'
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${String(date.getDate()).padStart(2, '0')} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ${hours}:${minutes}:${seconds}`
}
