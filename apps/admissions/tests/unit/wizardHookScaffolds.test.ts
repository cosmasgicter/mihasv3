/**
 * Tests for the 5 wizard hook scaffolds (Phase 2-6).
 *
 * Verifies each scaffold exports the expected API surface. Full integration
 * tests will accompany each PR that wires the hook into useWizardController
 * (per Decision A6).
 */

import { describe, expect, it } from 'vitest'

import * as wizardHooks from '@/pages/student/applicationWizard/hooks/wizard'

describe('wizard scaffold hooks (Phase 2-6) — barrel exports', () => {
  it('Phase 1: useWizardNavigation is exported', () => {
    expect(typeof wizardHooks.useWizardNavigation).toBe('function')
  })

  it('Phase 2: useWizardForm is exported', () => {
    expect(typeof wizardHooks.useWizardForm).toBe('function')
  })

  it('Phase 3: useWizardProfile is exported', () => {
    expect(typeof wizardHooks.useWizardProfile).toBe('function')
  })

  it('Phase 4: useWizardDraft is exported', () => {
    expect(typeof wizardHooks.useWizardDraft).toBe('function')
  })

  it('Phase 5: useWizardSubmission is exported', () => {
    expect(typeof wizardHooks.useWizardSubmission).toBe('function')
  })

  it('Phase 6: useWizardRecovery is exported', () => {
    expect(typeof wizardHooks.useWizardRecovery).toBe('function')
  })

  it('hasRecentWizardRedirectGuard helper is exported', () => {
    expect(typeof wizardHooks.hasRecentWizardRedirectGuard).toBe('function')
  })

  it('hasRecentWizardRedirectGuard returns false for null', () => {
    expect(wizardHooks.hasRecentWizardRedirectGuard(null, Date.now())).toBe(false)
  })

  it('hasRecentWizardRedirectGuard returns true for a fresh marker', () => {
    const fresh = JSON.stringify({ createdAt: Date.now() - 1000 })
    expect(wizardHooks.hasRecentWizardRedirectGuard(fresh, Date.now())).toBe(true)
  })

  it('hasRecentWizardRedirectGuard returns false for an expired marker', () => {
    const stale = JSON.stringify({ createdAt: Date.now() - 30_000 })
    expect(wizardHooks.hasRecentWizardRedirectGuard(stale, Date.now())).toBe(false)
  })

  it('useWizardController is still exported (back-compat)', () => {
    expect(typeof wizardHooks.useWizardController).toBe('function')
  })
})
