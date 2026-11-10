import { describe, expect, it } from 'vitest'
import { resolveBackAction } from '@/components/navigation/backNavigation'

const dashboardPath = '/student/dashboard'

describe('app bar back arrow (task 25.1)', () => {
  it('goes back in history on the wizard when an earlier entry is inside the app', () => {
    expect(
      resolveBackAction({ isWizardRoute: true, locationKey: 'abc123', historyIndex: 2, dashboardPath }),
    ).toEqual({ kind: 'history' })
  })

  it('goes to the dashboard on the wizard when it was opened from a link or a fresh load', () => {
    expect(
      resolveBackAction({ isWizardRoute: true, locationKey: 'default', dashboardPath }),
    ).toEqual({ kind: 'path', path: dashboardPath })
  })

  it('treats the first history entry as a fresh load even after a replace gave it a new key', () => {
    expect(
      resolveBackAction({ isWizardRoute: true, locationKey: 'k9x2', historyIndex: 0, dashboardPath }),
    ).toEqual({ kind: 'path', path: dashboardPath })
  })

  it('keeps history navigation on every other route', () => {
    expect(
      resolveBackAction({ isWizardRoute: false, locationKey: 'default', historyIndex: 0, dashboardPath }),
    ).toEqual({ kind: 'history' })
  })
})
