/**
 * Frontend ↔ backend drift guard for the canonical subject catalogue.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` — task **7.1**.
 * Requirements: R11.4, R11.5
 * Findings:     STU-11
 *
 * `backend/apps/catalog/subject_catalog.py` is the authority (registered in
 * `docs/canonical-truth-map.md`). The wizard keeps two read-only mirrors:
 *
 * * `SUBJECT_DISPLAY_METADATA` — grouping/labelling hints keyed by normalised
 *   name. Drift here only mis-groups a subject, it cannot invent one, but a
 *   silently unlabelled subject is still a papercut worth catching.
 * * `SUBJECT_NAME_ALIASES` — a mirror of the server's versioned alias catalogue,
 *   used to resolve a stored or OCR-proposed *name*. Drift here can resolve a
 *   student's subject to the wrong identity, which is the whole point of STU-11.
 *
 * Neither mirror carries an identity: subject IDs come only from
 * `GET /api/v1/catalog/subjects/`. That is why a mismatch is a warning-level
 * defect rather than a data-integrity one — and why this test exists instead of
 * a runtime fallback.
 *
 * Validates: Requirements R11.4, R11.5
 */

import { describe, expect, it } from 'vitest'

import {
  SUBJECT_CATEGORY_LABELS,
  SUBJECT_DISPLAY_METADATA,
  SUBJECT_NAME_ALIASES,
  LEGACY_SUBJECT_SLUG_TO_CODE,
  normalizeSubjectName,
} from '@/pages/student/applicationWizard/lib/educationCatalog'
import {
  BACKEND_CANONICAL_SUBJECTS,
  BACKEND_LEGACY_DUPLICATE_CODES,
  BACKEND_SUBJECT_ALIASES,
  BACKEND_SUBJECT_CATEGORIES,
} from './__fixtures__/subjectCatalogBackendMirror'

const backendCodes = new Set(BACKEND_CANONICAL_SUBJECTS.map(subject => subject.code))

describe('subject catalogue drift guard', () => {
  it('has display metadata for every canonical subject', () => {
    const missing = BACKEND_CANONICAL_SUBJECTS.filter(
      subject => !SUBJECT_DISPLAY_METADATA.has(normalizeSubjectName(subject.name))
    ).map(subject => subject.code)

    expect(missing).toEqual([])
  })

  it('carries no display metadata for a subject the backend does not define', () => {
    const backendNames = new Set(
      BACKEND_CANONICAL_SUBJECTS.map(subject => normalizeSubjectName(subject.name))
    )
    const extra = Array.from(SUBJECT_DISPLAY_METADATA.keys()).filter(
      name => !backendNames.has(name)
    )

    expect(extra).toEqual([])
  })

  it('agrees with the backend on every subject category', () => {
    const mismatches = BACKEND_CANONICAL_SUBJECTS.filter(subject => {
      const metadata = SUBJECT_DISPLAY_METADATA.get(normalizeSubjectName(subject.name))
      return metadata?.category !== subject.category
    }).map(subject => ({
      code: subject.code,
      backend: subject.category,
      frontend: SUBJECT_DISPLAY_METADATA.get(normalizeSubjectName(subject.name))?.category,
    }))

    expect(mismatches).toEqual([])
  })

  it('labels every category in the backend vocabulary', () => {
    const unlabelled = BACKEND_SUBJECT_CATEGORIES.filter(
      category => !(category in SUBJECT_CATEGORY_LABELS)
    )
    expect(unlabelled).toEqual([])
  })

  it('mirrors the backend alias catalogue exactly', () => {
    expect(SUBJECT_NAME_ALIASES).toEqual(BACKEND_SUBJECT_ALIASES)
  })

  it('maps every retired legacy slug onto a code the backend still defines', () => {
    const dangling = Object.entries(LEGACY_SUBJECT_SLUG_TO_CODE)
      .filter(([, code]) => !backendCodes.has(code))
      .map(([slug, code]) => `${slug} -> ${code}`)

    expect(dangling).toEqual([])
  })

  it('never treats a retired duplicate code as a canonical one', () => {
    for (const [legacy, canonical] of Object.entries(BACKEND_LEGACY_DUPLICATE_CODES)) {
      expect(backendCodes.has(legacy)).toBe(false)
      expect(backendCodes.has(canonical)).toBe(true)
      expect(Object.values(LEGACY_SUBJECT_SLUG_TO_CODE)).not.toContain(legacy)
    }
  })
})
