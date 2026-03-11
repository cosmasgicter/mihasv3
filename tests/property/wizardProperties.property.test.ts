/**
 * Property-based tests for Wizard components
 * Feature: ui-ux-performance-overhaul, Properties 13 & 14
 *
 * **Property 13: Wizard Progress Indicator Correctness**
 * — correct completed/active/remaining states for any step count and current index
 *
 * **Property 14: AutoSaveIndicator State Rendering**
 * — correct rendering for all 4 status values, `aria-live` present
 *
 * **Validates: Requirements 6.1, 6.3, 17.4**
 */
import { describe, it, expect, vi } from 'vitest'
import * as fc from 'fast-check'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// ── Mock hooks used by EnhancedProgressIndicator ────────────────────────

vi.mock('@/hooks/useOptimizedAnimation', () => ({
  useOptimizedAnimation: () => ({
    shouldAnimate: false,
    prefersReducedMotion: false,
    isMobile: false,
    transitionProps: { transition: 'none', willChange: 'auto' },
    fadeInClass: '',
    slideInClass: '',
    getAnimationProps: () => ({}),
  }),
  default: () => ({
    shouldAnimate: false,
    prefersReducedMotion: false,
    isMobile: false,
    transitionProps: { transition: 'none', willChange: 'auto' },
    fadeInClass: '',
    slideInClass: '',
    getAnimationProps: () => ({}),
  }),
}))

import { AutoSaveIndicator } from '@/components/ui/AutoSaveIndicator'
import { EnhancedProgressIndicator } from '@/pages/student/applicationWizard/components/EnhancedProgressIndicator'
import type { WizardStepConfig } from '@/pages/student/applicationWizard/steps/config'

// ── Helpers ─────────────────────────────────────────────────────────────

/** Create a mock LucideIcon component */
const MockIcon: React.FC<{ className?: string; style?: React.CSSProperties }> = (props) =>
  React.createElement('svg', { ...props, 'data-testid': 'mock-icon' })

/** Build an array of mock WizardStepConfig for a given step count */
function buildSteps(count: number): WizardStepConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    key: `step-${i}` as any,
    progressTitle: `Step ${i + 1}`,
    title: `Step ${i + 1}: Title`,
    description: `Description for step ${i + 1}`,
    icon: MockIcon as any,
    nextButtonLabel: i === count - 1 ? 'Submit' : 'Next',
  }))
}

/** Extract all aria-label values from buttons in HTML */
function getButtonAriaLabels(html: string): string[] {
  const labels: string[] = []
  const re = /<button[^>]*aria-label="([^"]*)"[^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) labels.push(m[1])
  return labels
}

/** Extract all aria-current values from buttons in HTML */
function getAriaCurrentValues(html: string): string[] {
  const values: string[] = []
  const re = /<button[^>]*aria-current="([^"]*)"[^>]*>/gi
  let m
  while ((m = re.exec(html)) !== null) values.push(m[1])
  return values
}

// ── Arbitraries ─────────────────────────────────────────────────────────

/** Arbitrary for step count (2–8 steps) and a valid current index */
const stepScenarioArb = fc.integer({ min: 2, max: 8 }).chain((stepCount) =>
  fc.integer({ min: 0, max: stepCount - 1 }).map((currentIndex) => ({
    stepCount,
    currentIndex,
  }))
)

/** Arbitrary for AutoSaveIndicator status */
const autoSaveStatusArb = fc.constantFrom(
  'idle' as const,
  'saving' as const,
  'saved' as const,
  'error' as const
)

// ── Property 13: Wizard Progress Indicator Correctness ──────────────────

describe('Property 13: Wizard Progress Indicator Correctness', () => {

  it('steps before currentIndex are marked completed in aria-label', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
          })
        )
        const labels = getButtonAriaLabels(html)

        // Each step appears twice (desktop + mobile), so labels come in pairs
        // Check that steps before currentIndex have "(completed)" in their label
        for (let i = 0; i < currentIndex; i++) {
          const completedLabels = labels.filter(
            (l) => l.includes(`Step ${i + 1}:`) && l.includes('(completed)')
          )
          expect(completedLabels.length).toBeGreaterThanOrEqual(1)
        }
      }),
      { numRuns: 10 },
    )
  })

  it('exactly one step is marked as current via aria-current="step"', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
          })
        )
        const currentValues = getAriaCurrentValues(html)

        // Desktop + mobile each render the current step with aria-current="step"
        // So we expect exactly 2 (one per viewport variant)
        expect(currentValues.length).toBe(2)
        expect(currentValues.every((v) => v === 'step')).toBe(true)

        // The current step's aria-label should contain "(current)"
        const currentLabels = labels(html, currentIndex)
        expect(currentLabels.length).toBeGreaterThanOrEqual(1)

        function labels(h: string, idx: number): string[] {
          return getButtonAriaLabels(h).filter(
            (l) => l.includes(`Step ${idx + 1}:`) && l.includes('(current)')
          )
        }
      }),
      { numRuns: 10 },
    )
  })

  it('steps after currentIndex are neither completed nor current', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
          })
        )
        const labels = getButtonAriaLabels(html)

        for (let i = currentIndex + 1; i < stepCount; i++) {
          const futureLabels = labels.filter((l) => l.includes(`Step ${i + 1}:`))
          for (const label of futureLabels) {
            expect(label).not.toContain('(completed)')
            expect(label).not.toContain('(current)')
          }
        }
      }),
      { numRuns: 10 },
    )
  })

  it('completedSteps set overrides default completion logic', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        // Mark a step after currentIndex as completed via the set
        if (currentIndex >= stepCount - 1) return // skip if at last step

        const extraCompleted = currentIndex + 1
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
            completedSteps: new Set([extraCompleted]),
          })
        )
        const labels = getButtonAriaLabels(html)

        // The extra completed step should be marked completed
        const completedLabels = labels.filter(
          (l) => l.includes(`Step ${extraCompleted + 1}:`) && l.includes('(completed)')
        )
        expect(completedLabels.length).toBeGreaterThanOrEqual(1)
      }),
      { numRuns: 10 },
    )
  })

  it('progress percentage is (currentStepIndex + 1) / totalSteps * 100', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
          })
        )
        const expectedPct = Math.round(((currentIndex + 1) / stepCount) * 100)
        // The mobile progress bar shows the percentage text
        expect(html).toContain(`${expectedPct}%`)
      }),
      { numRuns: 10 },
    )
  })

  it('each step shows "Step X of N" with correct total', () => {
    fc.assert(
      fc.property(stepScenarioArb, ({ stepCount, currentIndex }) => {
        const steps = buildSteps(stepCount)
        const html = renderToStaticMarkup(
          React.createElement(EnhancedProgressIndicator, {
            steps,
            currentStepIndex: currentIndex,
          })
        )
        for (let i = 0; i < stepCount; i++) {
          expect(html).toContain(`Step ${i + 1} of ${stepCount}`)
        }
      }),
      { numRuns: 10 },
    )
  })
})

// ── Property 14: AutoSaveIndicator State Rendering ──────────────────────

describe('Property 14: AutoSaveIndicator State Rendering', () => {

  it('always renders aria-live="polite" region regardless of status', () => {
    fc.assert(
      fc.property(autoSaveStatusArb, (status) => {
        const html = renderToStaticMarkup(
          React.createElement(AutoSaveIndicator, { status })
        )
        expect(html).toContain('aria-live="polite"')
      }),
      { numRuns: 10 },
    )
  })

  it('always renders role="status" regardless of status', () => {
    fc.assert(
      fc.property(autoSaveStatusArb, (status) => {
        const html = renderToStaticMarkup(
          React.createElement(AutoSaveIndicator, { status })
        )
        expect(html).toContain('role="status"')
      }),
      { numRuns: 10 },
    )
  })

  it('renders "Saving..." text only when status is saving', () => {
    fc.assert(
      fc.property(autoSaveStatusArb, (status) => {
        const html = renderToStaticMarkup(
          React.createElement(AutoSaveIndicator, { status })
        )
        if (status === 'saving') {
          expect(html).toContain('Saving...')
          expect(html).toContain('animate-pulse')
        } else if (status !== 'idle') {
          expect(html).not.toContain('animate-pulse')
        }
      }),
      { numRuns: 10 },
    )
  })

  it('renders "Saved" text only when status is saved', () => {
    fc.assert(
      fc.property(autoSaveStatusArb, (status) => {
        const html = renderToStaticMarkup(
          React.createElement(AutoSaveIndicator, { status })
        )
        if (status === 'saved') {
          expect(html).toContain('Saved')
        }
      }),
      { numRuns: 10 },
    )
  })

  it('renders "Save failed" with destructive styling only when status is error', () => {
    fc.assert(
      fc.property(autoSaveStatusArb, (status) => {
        const html = renderToStaticMarkup(
          React.createElement(AutoSaveIndicator, { status })
        )
        if (status === 'error') {
          expect(html).toContain('Save failed')
          expect(html).toContain('text-destructive')
        } else {
          expect(html).not.toContain('Save failed')
        }
      }),
      { numRuns: 10 },
    )
  })

  it('renders no visible content when status is idle', () => {
    const html = renderToStaticMarkup(
      React.createElement(AutoSaveIndicator, { status: 'idle' })
    )
    // idle should not show saving, saved, or error text visually
    expect(html).not.toContain('Saving...')
    expect(html).not.toContain('Save failed')
    // The only content should be the sr-only span (which is empty for idle)
    expect(html).toContain('aria-live="polite"')
  })

  it('each non-idle status renders exactly one visual indicator', () => {
    const statusToText: Record<string, string> = {
      saving: 'Saving...',
      saved: 'Saved',
      error: 'Save failed',
    }

    for (const [status, expectedText] of Object.entries(statusToText)) {
      const html = renderToStaticMarkup(
        React.createElement(AutoSaveIndicator, { status: status as any })
      )
      expect(html).toContain(expectedText)

      // Other status texts should not appear
      for (const [otherStatus, otherText] of Object.entries(statusToText)) {
        if (otherStatus !== status) {
          expect(html).not.toContain(otherText)
        }
      }
    }
  })
})
