import { describe, expect, it } from 'vitest'

import { buildWizardProgressSummary } from '@/pages/student/applicationWizard/lib/progressSummary'

describe('buildWizardProgressSummary', () => {
  it('prefers the live draft progress over historical completion counts', () => {
    const summary = buildWizardProgressSummary(
      {
        completedApplications: 31,
        totalDrafts: 0,
      },
      {
        completionPercentage: 58,
        hasLocalDraft: true,
        lastSavedAt: '2026-03-07T10:30:00.000Z',
      },
      new Date('2026-03-07T11:00:00.000Z'),
    )

    expect(summary.completionPercentage).toBe(58)
    expect(summary.inProgressCount).toBe(1)
    expect(summary.activityLabel).toBe('30m ago')
  })

  it('falls back to historical completion only when there is no active draft', () => {
    const summary = buildWizardProgressSummary(
      {
        completedApplications: 4,
        totalDrafts: 0,
      },
      {
        completionPercentage: 22,
        hasLocalDraft: false,
        lastSavedAt: null,
      },
      new Date('2026-03-07T11:00:00.000Z'),
    )

    expect(summary.completionPercentage).toBe(100)
    expect(summary.inProgressCount).toBe(0)
    expect(summary.activityLabel).toBe('No active draft')
  })

  it('keeps the server draft count when it is already higher than the local fallback', () => {
    const summary = buildWizardProgressSummary(
      {
        completedApplications: 2,
        totalDrafts: 3,
      },
      {
        completionPercentage: 44,
        hasLocalDraft: true,
        lastSavedAt: '2026-03-07T10:55:00.000Z',
      },
      new Date('2026-03-07T11:00:00.000Z'),
    )

    expect(summary.inProgressCount).toBe(3)
    expect(summary.completionPercentage).toBe(44)
    expect(summary.activityLabel).toBe('5m ago')
  })
})
