/**
 * Canonical institution facts for marketing surfaces.
 * Update this file when campuses, programs, or accreditations change.
 * Do not hardcode these values inline anywhere else.
 */
export const INSTITUTION_FACTS = {
  campuses: 2,                    // Mukuba Institute (Kitwe) + Kalulushi Training Centre
  diplomaTracks: 3,               // Clinical Medicine, Environmental Health, Nursing
  accreditations: ['NMCZ', 'HPCZ', 'ECZ', 'UNZA'],
  accommodationOnSite: true,
} as const

/** Marketing-friendly proof-panel highlights. */
export const PROOF_HIGHLIGHTS = [
  { value: String(INSTITUTION_FACTS.campuses), label: 'campuses' },
  { value: String(INSTITUTION_FACTS.diplomaTracks), label: 'diploma tracks' },
  { value: 'On-site', label: 'accommodation' },
] as const
