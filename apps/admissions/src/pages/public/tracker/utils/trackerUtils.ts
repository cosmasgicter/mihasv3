import { formatDate } from '@/lib/dateFormat'

export const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Applied Sciences',
  'mihas': 'Mukuba Institute of Health and Applied Sciences'
}

export const getInstitutionName = (code?: string | null) => {
  if (!code) return 'Not specified'
  return INSTITUTION_NAMES[code] || code
}

export const validateSearchTerm = (term: string): boolean => {
  const trimmed = term.trim()
  if (!trimmed || trimmed.length > 50) return false
  const appNumberPattern = /^(KATC|MIHAS)\d{6}$/
  if (appNumberPattern.test(trimmed)) return true
  return /^[a-zA-Z0-9\-_]+$/.test(trimmed)
}

export const normalizeSearchTerm = (term: string): string => {
  const trimmed = term.trim()
  return trimmed.replace(/^(katc|mihas)(\d{6})$/i, (_, prefix, serial) => `${String(prefix).toUpperCase()}${serial}`)
}

export const displayValue = (value?: string | null, fallback = 'Not available') => {
  if (!value) return fallback
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

export const formatPaymentStatus = (status?: string | null) => {
  if (!status) return 'Pending Review'
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
      return 'Your application has been approved. You have been accepted into the program. Check your email for next steps and enrollment information.'
    case 'conditionally_approved':
      return 'Your application has been conditionally approved. Please review the conditions attached and fulfil them before the stated deadline.'
    case 'waitlisted':
      return 'You have been placed on the waitlist. If a spot opens, you will be notified automatically by email.'
    case 'enrolled':
      return 'Your enrollment is confirmed. Welcome to the program.'
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
