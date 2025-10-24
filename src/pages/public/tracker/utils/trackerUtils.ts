export const INSTITUTION_NAMES: Record<string, string> = {
  'KATC': 'Kalulushi Training Centre',
  'katc': 'Kalulushi Training Centre',
  'MIHAS': 'Mukuba Institute of Health and Allied Sciences',
  'mihas': 'Mukuba Institute of Health and Allied Sciences'
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
      return 'Your application has been successfully received and is in our queue for initial review. Our admissions team will begin processing it shortly.'
    case 'under_review':
      return 'Great news! Your application is currently being carefully reviewed by our expert admissions team. We\'re evaluating all aspects of your submission.'
    case 'approved':
      return 'Congratulations! 🎉 Your application has been approved! You\'ve been accepted into the program. Check your email for detailed next steps and enrollment information.'
    case 'rejected':
      return 'We appreciate your interest in our program. Unfortunately, your application was not successful this time. Don\'t give up - you may apply for future intakes with improved qualifications.'
    default:
      return 'Your application status is being updated. Please check back soon for the latest information.'
  }
}

export const getStatusEmoji = (status: string) => {
  switch (status) {
    case 'approved': return '🎉'
    case 'rejected': return '💔'
    case 'under_review': return '🔍'
    case 'submitted': return '🚀'
    default: return '⏳'
  }
}

export const formatDisplayDate = (value?: string | null) => {
  if (!value) return 'Not available'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Not available'
  return parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}
