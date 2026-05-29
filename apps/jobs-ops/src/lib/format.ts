const dateTimeFormatter = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
})

export function labelize(value: string) {
  return value.replace(/_/g, ' ')
}

export function formatPercentage(value: number, mode: 'score' | 'ratio' = 'score') {
  const normalized = mode === 'ratio' ? value * 100 : value
  return `${Math.round(normalized)}%`
}

export function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return dateTimeFormatter.format(date)
}

export function formatRelativeTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  const diffMilliseconds = date.getTime() - Date.now()
  const diffMinutes = Math.round(diffMilliseconds / 60_000)

  if (Math.abs(diffMinutes) < 60) {
    return relativeTimeFormatter.format(diffMinutes, 'minute')
  }

  const diffHours = Math.round(diffMinutes / 60)
  if (Math.abs(diffHours) < 24) {
    return relativeTimeFormatter.format(diffHours, 'hour')
  }

  const diffDays = Math.round(diffHours / 24)
  return relativeTimeFormatter.format(diffDays, 'day')
}

export function recommendationTone(recommendation: string) {
  if (recommendation === 'apply_now') return 'success' as const
  if (recommendation === 'review') return 'warning' as const
  if (recommendation === 'watch') return 'insight' as const
  return 'danger' as const
}
