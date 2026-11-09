/**
 * A complete `BuildWizardReadinessInput` for tests (SJR task 3.22, R6-a).
 *
 * `buildWizardReadiness` has no defaults any more, so a test that wants "an
 * empty draft with just these fields" says so here instead of leaning on a
 * silent default. Every field is filled with the explicit value the old default
 * had; pass overrides for the ones a test cares about.
 */
import type { BuildWizardReadinessInput } from '@/pages/student/applicationWizard/lib/wizardReadiness'

export function readinessInput(
  overrides: Partial<BuildWizardReadinessInput> = {},
): BuildWizardReadinessInput {
  return {
    values: {},
    selectedGrades: [],
    uploadedFiles: {},
    hasResultSlipFile: false,
    hasIdentityFile: false,
    requiredDocumentItems: undefined,
    paymentStatus: null,
    confirmSubmission: false,
    assignmentResolved: false,
    ...overrides,
  }
}
