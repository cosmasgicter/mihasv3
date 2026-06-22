/**
 * Unit tests for Gate 5 (Bundle_Guard) — budget + exclusion behavior and the
 * `EvidenceArtifact` assembly performed by the build-time wrapper.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — task 4.5, Requirement 5.
 *
 * These are example-based companions to the property tests in
 * `tests/property/launchVerificationBundle.property.test.ts`. They pin the
 * specific, named behaviors called out in the acceptance criteria:
 *   - R5.2: a forbidden chunk on the entry path fails the exclusion check and
 *           records the offender.
 *   - R5.4: a measured entry gzipped size over 150 KB fails; at/under passes.
 *   - R5.6: a first-PDF-action transfer over 772 KB fails; at/under passes.
 *   - R5.8: `vendor-sentry` on a Public_Route entry path fails.
 * plus an end-to-end assembly assertion that `buildArtifact` (the wrapper from
 * `launch-bundle-guard.ts`) produces a valid, contract-shaped `EvidenceArtifact`
 * given a synthetic `BundleInput` — exercising the predicate + artifact path
 * without needing a real `dist/`.
 */

import { describe, expect, it } from 'vitest'

import {
  ENTRY_GZ_BUDGET_BYTES,
  PDF_GZ_BUDGET_BYTES,
  checkEntryBudget,
  checkEntryExclusions,
  checkPdfBudget,
  checkSentryOnPublicEntry,
  evaluateBundle,
  type BundleInput,
} from '../../scripts/launchBundlePredicate'
import { buildArtifact } from '../../scripts/launch-bundle-guard'
import { isEvidenceArtifact } from '../contract/evidenceArtifact'

// ---------------------------------------------------------------------------
// Synthetic inputs — no real fixture dist/ needed; we test the predicate +
// artifact assembly directly over hand-built manifests/sizes.
// ---------------------------------------------------------------------------

/** A clean entry/preload set that contains none of the forbidden markers. */
const CLEAN_ENTRY_CHUNKS: readonly string[] = [
  'index-a1b2c3.js',
  'vendor-react-d4e5f6.js',
  'vendor-router-7890ab.js',
  'student-dashboard-cdef01.js',
]

/**
 * Build a fully-passing synthetic {@link BundleInput}, then apply overrides so
 * each test can flip exactly one dimension into a failing state.
 */
function makeBundleInput(overrides: Partial<BundleInput> = {}): BundleInput {
  return {
    entryChunks: CLEAN_ENTRY_CHUNKS,
    entryGzBytes: 94 * 1024,
    firstPdfActionGzBytes: 500 * 1024,
    publicEntryChunks: CLEAN_ENTRY_CHUNKS,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// R5.2 — entry-path exclusion check records the offender
// ---------------------------------------------------------------------------

describe('Bundle_Guard exclusion check (R5.2)', () => {
  it.each([
    ['jspdf', 'jspdf-9f3c.js'],
    ['vendor-react-pdf', 'vendor-react-pdf-a1b2.js'],
    ['html2canvas', 'html2canvas-7c2d.js'],
    ['tesseract/OCR', 'tesseract-core-5e6f.js'],
    ['recharts/charts', 'recharts-1a2b.js'],
    ['admin-only page chunks', 'admin-dashboard-3c4d.js'],
  ])(
    'fails and records the offender when a %s chunk is on the entry path',
    (family, chunk) => {
      const result = checkEntryExclusions([...CLEAN_ENTRY_CHUNKS, chunk])

      expect(result.pass).toBe(false)
      // The offending chunk is recorded, annotated with the family it matched.
      const offender = result.forbiddenPresent.find((entry) =>
        entry.startsWith(chunk),
      )
      expect(offender).toBeDefined()
      expect(offender).toContain(family)
    },
  )

  it('passes with an empty offender list when the entry path is clean', () => {
    const result = checkEntryExclusions(CLEAN_ENTRY_CHUNKS)

    expect(result.pass).toBe(true)
    expect(result.forbiddenPresent).toEqual([])
  })

  it('records every offender when several forbidden chunks are present', () => {
    const result = checkEntryExclusions([
      ...CLEAN_ENTRY_CHUNKS,
      'jspdf-9f3c.js',
      'recharts-1a2b.js',
    ])

    expect(result.pass).toBe(false)
    expect(result.forbiddenPresent).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// R5.4 — entry-path gzipped budget (150 KB)
// ---------------------------------------------------------------------------

describe('Bundle_Guard entry-path budget (R5.4)', () => {
  it('fails when the measured entry gzipped size exceeds 150 KB', () => {
    const result = checkEntryBudget(ENTRY_GZ_BUDGET_BYTES + 1)

    expect(result.pass).toBe(false)
    expect(result.observedBytes).toBe(ENTRY_GZ_BUDGET_BYTES + 1)
    expect(result.thresholdBytes).toBe(ENTRY_GZ_BUDGET_BYTES)
  })

  it('passes exactly at the 150 KB budget boundary', () => {
    const result = checkEntryBudget(ENTRY_GZ_BUDGET_BYTES)

    expect(result.pass).toBe(true)
    expect(result.observedBytes).toBe(ENTRY_GZ_BUDGET_BYTES)
  })

  it('passes comfortably under the 150 KB budget', () => {
    const result = checkEntryBudget(94 * 1024)

    expect(result.pass).toBe(true)
  })

  it('pins the documented entry budget constant at 150 KB', () => {
    expect(ENTRY_GZ_BUDGET_BYTES).toBe(150 * 1024)
  })
})

// ---------------------------------------------------------------------------
// R5.6 — first-PDF-action gzipped budget (772 KB)
// ---------------------------------------------------------------------------

describe('Bundle_Guard document-generation budget (R5.6)', () => {
  it('fails when the first-PDF-action transfer exceeds 772 KB', () => {
    const result = checkPdfBudget(PDF_GZ_BUDGET_BYTES + 1)

    expect(result.pass).toBe(false)
    expect(result.observedBytes).toBe(PDF_GZ_BUDGET_BYTES + 1)
    expect(result.thresholdBytes).toBe(PDF_GZ_BUDGET_BYTES)
  })

  it('passes exactly at the 772 KB budget boundary', () => {
    const result = checkPdfBudget(PDF_GZ_BUDGET_BYTES)

    expect(result.pass).toBe(true)
    expect(result.observedBytes).toBe(PDF_GZ_BUDGET_BYTES)
  })

  it('passes comfortably under the 772 KB budget', () => {
    const result = checkPdfBudget(500 * 1024)

    expect(result.pass).toBe(true)
  })

  it('pins the documented PDF budget constant at 772 KB', () => {
    expect(PDF_GZ_BUDGET_BYTES).toBe(772 * 1024)
  })
})

// ---------------------------------------------------------------------------
// R5.8 — vendor-sentry on a Public_Route entry path
// ---------------------------------------------------------------------------

describe('Bundle_Guard public-route Sentry check (R5.8)', () => {
  it('fails and records the offender when vendor-sentry is on the public entry path', () => {
    const sentryChunk = 'vendor-sentry-1234.js'
    const result = checkSentryOnPublicEntry([
      ...CLEAN_ENTRY_CHUNKS,
      sentryChunk,
    ])

    expect(result.pass).toBe(false)
    expect(result.sentryPresent).toBe(true)
    expect(result.offenders).toContain(sentryChunk)
  })

  it('passes with no offenders when vendor-sentry is absent', () => {
    const result = checkSentryOnPublicEntry(CLEAN_ENTRY_CHUNKS)

    expect(result.pass).toBe(true)
    expect(result.sentryPresent).toBe(false)
    expect(result.offenders).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// buildArtifact — EvidenceArtifact assembly over a synthetic BundleInput
// ---------------------------------------------------------------------------

describe('Bundle_Guard buildArtifact — EvidenceArtifact assembly', () => {
  it('produces a valid passing artifact for a clean, within-budget bundle', () => {
    const input = makeBundleInput()
    const evaluation = evaluateBundle(input)
    const artifact = buildArtifact(input, evaluation)

    // Contract-shaped and within the shared envelope.
    expect(isEvidenceArtifact(artifact)).toBe(true)
    expect(artifact.gate_id).toBe('bundle-guard')
    expect(artifact.requirement).toBe('R5')
    expect(artifact.generated_by).toBe('ci')

    // A clean, within-budget bundle passes overall with no failures.
    expect(evaluation.pass).toBe(true)
    expect(artifact.status).toBe('passed')
    expect(artifact.failures).toEqual([])

    // All four predicate checks are recorded.
    const checkIds = artifact.checks.map((c) => c.id).sort()
    expect(checkIds).toEqual([
      'entry-gz-budget',
      'entry-path-exclusions',
      'pdf-gz-budget',
      'sentry-public-entry',
    ])
    expect(artifact.checks.every((c) => c.result === 'pass')).toBe(true)
  })

  it('produces a failed artifact whose status and failures reflect every violation', () => {
    const input = makeBundleInput({
      entryChunks: [...CLEAN_ENTRY_CHUNKS, 'jspdf-9f3c.js'],
      entryGzBytes: ENTRY_GZ_BUDGET_BYTES + 8 * 1024,
      firstPdfActionGzBytes: PDF_GZ_BUDGET_BYTES + 16 * 1024,
      publicEntryChunks: [...CLEAN_ENTRY_CHUNKS, 'vendor-sentry-1234.js'],
    })
    const evaluation = evaluateBundle(input)
    const artifact = buildArtifact(input, evaluation)

    expect(isEvidenceArtifact(artifact)).toBe(true)
    expect(artifact.gate_id).toBe('bundle-guard')
    expect(artifact.requirement).toBe('R5')

    // Overall verdict is failed and each violation is captured.
    expect(evaluation.pass).toBe(false)
    expect(artifact.status).toBe('failed')
    expect(artifact.failures.length).toBe(4)

    // Every individual check failed for this maximally-bad input.
    expect(artifact.checks.every((c) => c.result === 'fail')).toBe(true)
  })

  it('fails the artifact when only a single check is violated', () => {
    const input = makeBundleInput({
      entryGzBytes: ENTRY_GZ_BUDGET_BYTES + 1,
    })
    const evaluation = evaluateBundle(input)
    const artifact = buildArtifact(input, evaluation)

    expect(artifact.status).toBe('failed')
    expect(artifact.failures).toHaveLength(1)

    const entryBudgetRow = artifact.checks.find((c) => c.id === 'entry-gz-budget')
    expect(entryBudgetRow?.result).toBe('fail')

    // The other three checks remain passing.
    const passing = artifact.checks.filter((c) => c.result === 'pass')
    expect(passing).toHaveLength(3)
  })
})
