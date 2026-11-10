import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EnhancedProgressIndicator } from '@/pages/student/applicationWizard/components/EnhancedProgressIndicator'
import {
  buildStepStates,
  progressPercent,
  recordContinueAttempt,
  shouldShowIncompleteAlert,
} from '@/pages/student/applicationWizard/lib/wizardProgress'
import { wizardSteps, type StepKey } from '@/pages/student/applicationWizard/steps/config'
import { buildWizardReadiness } from '@/pages/student/applicationWizard/lib/wizardReadiness'

vi.mock('@/hooks/useOptimizedAnimation', () => ({
  useOptimizedAnimation: () => ({ shouldAnimate: false }),
}))

const keys = wizardSteps.map(step => step.key) as StepKey[]
const emptyReadiness = buildWizardReadiness({
  values: {},
  selectedGrades: [],
  uploadedFiles: {},
  hasResultSlipFile: false,
  hasIdentityFile: false,
  requiredDocumentItems: undefined,
  paymentStatus: null,
  confirmSubmission: false,
  assignmentResolved: false,
})

describe('progress from the one readiness (task 26.1)', () => {
  it('floors passing items over total items', () => {
    expect(progressPercent({ completedItems: 0, totalItems: 0 })).toBe(0)
    expect(progressPercent({ completedItems: 2, totalItems: 3 })).toBe(66)
    expect(progressPercent({ completedItems: 3, totalItems: 3 })).toBe(100)
    expect(progressPercent(emptyReadiness)).toBe(0)
  })

  it('does not call an earlier step complete because it is earlier', () => {
    const states = buildStepStates(emptyReadiness, keys, 3, 3)
    expect(states.program).toBe('incomplete')
    expect(states.personal).toBe('incomplete')
    expect(states.education).toBe('current')
    expect(states.payment).toBe('upcoming')
  })

  it('shows Incomplete with its icon on a visited step whose items fail', () => {
    const states = buildStepStates(emptyReadiness, keys, 3, 3)
    const html = renderToStaticMarkup(
      <EnhancedProgressIndicator steps={wizardSteps} currentStepIndex={3} stepStates={states} />,
    )
    expect(html).toContain('Incomplete')
    expect(html).toContain('(incomplete)')
    expect(html).not.toContain('(completed)')
    expect(html).toContain('lucide-triangle-alert')
  })
})

describe('the incomplete alert waits for a Continue attempt (task 26.2)', () => {
  it('is not shown on arrival, even when the step is incomplete', () => {
    expect(shouldShowIncompleteAlert(new Set(), 'personal', false)).toBe(false)
  })

  it('is shown after Next was pressed on an incomplete step, for that step only', () => {
    const attempted = recordContinueAttempt(new Set(), 'personal', false)
    expect(shouldShowIncompleteAlert(attempted, 'personal', false)).toBe(true)
    expect(shouldShowIncompleteAlert(attempted, 'education', false)).toBe(false)
  })

  it('goes away when the step becomes valid, and a valid Next records nothing', () => {
    const attempted = recordContinueAttempt(new Set(), 'personal', false)
    expect(shouldShowIncompleteAlert(attempted, 'personal', true)).toBe(false)
    expect(recordContinueAttempt(new Set(), 'personal', true).size).toBe(0)
  })
})
