import { useCallback, useState } from 'react'
import { wizardSteps, type WizardStepConfig } from '../../steps/config'

export interface UseWizardNavigationOptions {
  /** Called before advancing to the next step. Return false to block navigation. */
  onBeforeNext?: () => Promise<boolean>
  /** Called before going to the previous step (e.g. to save draft). */
  onBeforePrev?: () => void
}

export interface UseWizardNavigationResult {
  currentStepIndex: number
  totalSteps: number
  currentStepConfig: WizardStepConfig
  isLastStep: boolean
  handleNextStep: () => Promise<void>
  handlePrevStep: () => void
  goToStep: (index: number) => void
}

/**
 * Pure navigation state for the application wizard.
 * Manages step index, bounds-clamping, and delegates validation/save
 * to the caller via `onBeforeNext` / `onBeforePrev` callbacks.
 */
export function useWizardNavigation(
  options: UseWizardNavigationOptions = {}
): UseWizardNavigationResult {
  const { onBeforeNext, onBeforePrev } = options

  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const totalSteps = wizardSteps.length
  const currentStepConfig = (wizardSteps[currentStepIndex] ?? wizardSteps[0])!
  const isLastStep = currentStepConfig.key === 'submit'

  const goToStep = useCallback(
    (index: number) => {
      setCurrentStepIndex(Math.min(Math.max(index, 0), totalSteps - 1))
    },
    [totalSteps]
  )

  const handleNextStep = useCallback(async () => {
    if (onBeforeNext) {
      const allowed = await onBeforeNext()
      if (!allowed) return
    }
    goToStep(currentStepIndex + 1)
  }, [currentStepIndex, goToStep, onBeforeNext])

  const handlePrevStep = useCallback(() => {
    if (currentStepIndex > 0) {
      onBeforePrev?.()
      goToStep(currentStepIndex - 1)
    }
  }, [currentStepIndex, goToStep, onBeforePrev])

  return {
    currentStepIndex,
    totalSteps,
    currentStepConfig,
    isLastStep,
    handleNextStep,
    handlePrevStep,
    goToStep,
  }
}
