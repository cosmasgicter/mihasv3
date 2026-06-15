/**
 * Canonical platform facts for marketing surfaces.
 * Update this file when onboarding, programme, or document capabilities change.
 * Do not hardcode these values inline anywhere else.
 */
export const INSTITUTION_FACTS = {
  institutionTypes: 2,
  programmeCategories: 3,
  documentAutomation: true,
} as const

/** Marketing-friendly proof-panel highlights. */
export const PROOF_HIGHLIGHTS = [
  { value: String(INSTITUTION_FACTS.institutionTypes), label: 'school types' },
  { value: String(INSTITUTION_FACTS.programmeCategories), label: 'programme groups' },
  { value: INSTITUTION_FACTS.documentAutomation ? 'Auto' : 'Manual', label: 'documents' },
] as const
