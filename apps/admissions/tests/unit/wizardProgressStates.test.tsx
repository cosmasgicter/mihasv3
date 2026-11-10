import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { EnhancedProgressIndicator } from '@/pages/student/applicationWizard/components/EnhancedProgressIndicator'
import { buildStepStates, progressPercent } from '@/pages/student/applicationWizard/lib/wizardProgress'
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
