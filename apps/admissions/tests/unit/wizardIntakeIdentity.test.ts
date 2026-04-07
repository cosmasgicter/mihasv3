import { describe, expect, it } from 'vitest'

import {
  buildWizardIntakeDisplayName,
  resolveWizardIntakeIdentity,
} from '@/pages/student/applicationWizard/hooks/useWizardController'
import type { WizardIntake } from '@/pages/student/applicationWizard/types'

const januaryIntake = {
  id: 'intake-jan-2025',
  name: 'January',
  year: 2025,
  displayName: 'January 2025',
} as WizardIntake

describe('wizard intake identity resolution', () => {
  it('builds a display label that appends the year only when needed', () => {
    expect(buildWizardIntakeDisplayName({ name: 'January', year: 2025 } as any)).toBe('January 2025')
    expect(buildWizardIntakeDisplayName({ name: 'January 2025', year: 2025 } as any)).toBe('January 2025')
  })

  it('resolves an intake id to the canonical DB name and display label', () => {
    expect(resolveWizardIntakeIdentity([januaryIntake], 'intake-jan-2025')).toEqual({
      id: 'intake-jan-2025',
      name: 'January',
      label: 'January 2025',
    })
  })

  it('resolves a display label to the canonical DB name used by the backend', () => {
    expect(resolveWizardIntakeIdentity([januaryIntake], 'January 2025')).toEqual({
      id: 'intake-jan-2025',
      name: 'January',
      label: 'January 2025',
    })
  })

  it('resolves the raw intake name without changing the user-facing label', () => {
    expect(resolveWizardIntakeIdentity([januaryIntake], 'January')).toEqual({
      id: 'intake-jan-2025',
      name: 'January',
      label: 'January 2025',
    })
  })
})
