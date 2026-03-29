/**
 * Centralized date formatting utilities for the MIHAS Application System.
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
