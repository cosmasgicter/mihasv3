// Wizard hooks barrel — Stream 8 of canonical-truth program.
//
// Six sequential hook extractions per Decision A6:
//   Phase 1: useWizardNavigation  (extracted, wired into useWizardController)
//   Phase 2: useWizardForm        (scaffolded — wire in next sprint)
//   Phase 3: useWizardProfile     (scaffolded — wire in next sprint)
//   Phase 4: useWizardDraft       (scaffolded — wire in next sprint)
//   Phase 5: useWizardSubmission  (scaffolded — wire in next sprint)
//   Phase 6: useWizardRecovery    (scaffolded — wire in next sprint)
//
// The original useWizardController is still the orchestrator; phases 2-6
// expose stable APIs that the controller will adopt incrementally.

export { default as useWizardController } from '../useWizardController'

// Phase 1
export { useWizardNavigation } from './useWizardNavigation'

// Phase 2-6 scaffolds
export { useWizardForm } from './useWizardForm'
export type { UseWizardFormOptions, UseWizardFormResult } from './useWizardForm'

export { useWizardProfile } from './useWizardProfile'
export type { UseWizardProfileOptions, UseWizardProfileResult } from './useWizardProfile'

export { useWizardDraft } from './useWizardDraft'
export type {
  UseWizardDraftOptions,
  UseWizardDraftResult,
  DraftSaveStatus,
} from './useWizardDraft'

export { useWizardSubmission } from './useWizardSubmission'
export type {
  UseWizardSubmissionOptions,
  UseWizardSubmissionResult,
} from './useWizardSubmission'

export { useWizardRecovery, hasRecentWizardRedirectGuard } from './useWizardRecovery'
export type {
  UseWizardRecoveryOptions,
  UseWizardRecoveryResult,
} from './useWizardRecovery'

// Underlying primitives
export { useWizardState } from './state/useWizardState'
export { validatePaymentStep } from './validation/paymentValidation'
export * from './utils/wizardUtils'
