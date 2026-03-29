export interface WizardProgressStats {
  completedApplications: number
  totalDrafts: number
}

export interface WizardProgressContext {
  completionPercentage: number
  hasLocalDraft: boolean
  lastSavedAt?: Date | string | null
}

export interface WizardProgressSummary {
  completionPercentage: number
  completedCount: number
  inProgressCount: number
  activityLabel: string
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

function formatRelativeTime(value: Date | string, now: Date): string {
  const parsed = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'Draft in progress'
  }

  const diffMs = Math.max(now.getTime() - parsed.getTime(), 0)
  const minutes = Math.floor(diffMs / 60000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function buildWizardProgressSummary(
  stats: WizardProgressStats,
  context: WizardProgressContext,
  now: Date = new Date()
): WizardProgressSummary {
  const completedCount = Math.max(0, Math.trunc(stats.completedApplications || 0))
  const serverDraftCount = Math.max(0, Math.trunc(stats.totalDrafts || 0))
  const inProgressCount = Math.max(serverDraftCount, context.hasLocalDraft ? 1 : 0)

  const completionPercentage = context.hasLocalDraft
    ? clampPercentage(context.completionPercentage)
    : completedCount > 0 && inProgressCount === 0
      ? 100
      : completedCount + inProgressCount > 0
        ? clampPercentage((completedCount / (completedCount + inProgressCount)) * 100)
        : 0

  const activityLabel = context.hasLocalDraft
    ? context.lastSavedAt
      ? formatRelativeTime(context.lastSavedAt, now)
      : 'Draft in progress'
    : 'No active draft'

  return {
    completionPercentage,
    completedCount,
    inProgressCount,
    activityLabel
  }
}
