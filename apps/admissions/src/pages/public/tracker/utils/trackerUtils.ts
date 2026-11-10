import { formatDate } from '@/lib/dateFormat'

export const getInstitutionName = (code?: string | null) => {
  const value = code?.trim()
  return value && value.length > 0 ? value : 'Not specified'
}

export const validateSearchTerm = (term: string): boolean => {
  const trimmed = term.trim()
  if (!trimmed || trimmed.length > 50) return false
  // Deliberately still permissive (admissions-v2 task 10.5): whether an input is
  // *authority* is the server's answer, and `isTrackingSecret` below is the
  // client's read of the same rule. This only rejects input that could not be any
  // identifier at all, so a student who pastes their application number gets the
  // explanation about tracking links rather than a character-set complaint.
  // Application numbers begin with the assigned institution's code (R9.9):
  // any 2-10 letter tenant code, never a fixed client-code allowlist.
  const appNumberPattern = /^[A-Za-z]{2,10}\d{6,14}$/
  if (appNumberPattern.test(trimmed)) return true
  return /^[a-zA-Z0-9\-_]+$/.test(trimmed)
}

export const normalizeSearchTerm = (term: string): string => {
  const trimmed = term.trim()
  // A tracking secret is upper-case by construction, so normalise the whole
  // string. Anything else keeps the pre-10.5 behaviour of upper-casing only an
  // institution-code prefix (R9.9: not restricted to any launch client).
  if (/^trk-[0-9a-z]{8}-[0-9a-z]{20}$/i.test(trimmed)) return trimmed.toUpperCase()
  return trimmed.replace(/^([A-Za-z]{2,10})(\d{6,14})$/, (_, prefix, serial) => `${String(prefix).toUpperCase()}${serial}`)
}

/**
 * The tracking-secret shape (admissions-v2 task 10.5, R13.12 / STU-22).
 *
 * Mirror of `apps/applications/tracking_secret.py::SECRET_PATTERN`:
 * `TRK-{selector 8}-{verifier 20}` over Crockford base32 (no I/L/O/U). Two
 * hyphens and two fixed lengths, so it cannot be confused with an application
 * number or with a legacy `TRK-` code — neither of which authorises anything.
 */
const TRACKING_SECRET_PATTERN =
  /^TRK-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{20}$/

export const isTrackingSecret = (term: string): boolean =>
  TRACKING_SECRET_PATTERN.test(normalizeSearchTerm(term))

/**
 * The shareable tracker URL for a tracking secret.
 *
 * The query string carries the random token and nothing else — no application
 * number, no name, no email (STU-22: "share a URL that contains only the non-PII
 * tracking token"). `window.location.href` cannot serve this: a result reached by
 * typing the code into the box leaves the address bar at `/track-application`, so
 * the pre-10.5 "Copy Link" shared a URL that tracked nothing at all.
 */
export const buildTrackerShareUrl = (code: string, origin?: string): string => {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  return `${base}/track-application?code=${encodeURIComponent(normalizeSearchTerm(code))}`
}

export const displayValue = (value?: string | null, fallback = 'Not available') => {
  if (!value) return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export const formatPaymentStatus = (status?: string | null) => {
  if (!status) return 'Pending review'
  return status.split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export const getPaymentStatusStyles = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'rejected':
      return 'bg-rose-100 text-rose-800 border-rose-200'
    default:
      return 'bg-amber-100 text-amber-800 border-amber-200'
  }
}

export const getPaymentStatusDescription = (status?: string | null) => {
  switch (status) {
    case 'verified':
      return 'Payment verified — you are all set.'
    case 'rejected':
      return 'Payment issue detected — please contact support.'
    default:
      return 'Payment submitted — awaiting verification by admissions.'
  }
}

export const getStatusMessage = (status: string) => {
  switch (status) {
    case 'submitted':
      return 'Your application has been received and is in our queue for initial review. The admissions team will begin processing it shortly.'
    case 'under_review':
      return 'Your application is currently being reviewed by the admissions team. We are evaluating all aspects of your submission.'
    case 'approved':
      return 'Your application has been approved. You have been accepted into the programme. Check your email for next steps and enrollment information.'
    case 'conditionally_approved':
      return 'Your application has been conditionally approved. Please review the conditions attached and fulfil them before the stated deadline.'
    case 'waitlisted':
      return 'You have been placed on the waitlist. If a spot opens, you will be notified automatically by email.'
    case 'enrolled':
      return 'Your enrollment is confirmed. Welcome to the programme.'
    case 'rejected':
      return 'We appreciate your interest. Unfortunately, your application was not successful this time. You may apply for future intakes with improved qualifications.'
    case 'withdrawn':
      return 'This application has been withdrawn at your request.'
    case 'expired':
      return 'This application expired because it was not completed within the allowed time.'
    case 'enrollment_expired':
      return 'The enrollment confirmation deadline has passed. The spot has been released to the next candidate on the waitlist.'
    case 'draft':
      return 'This application is still in draft. Sign in to continue where you left off.'
    default:
      return 'Your application status is being updated. Please check back soon for the latest information.'
  }
}

export const formatDisplayDate = (value?: string | null) => {
  return formatDate(value)
}
