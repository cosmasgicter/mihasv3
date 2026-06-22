/**
 * Pure bundle predicate for Gate 5 (Bundle_Guard) of the
 * `beanola-launch-verification` spec.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — task 4.1, Requirement 5.
 *
 * This module is the **pure-logic core** of the launch Bundle_Guard. It contains
 * no `fs`, no `zlib`, and no build invocation — it operates only over a provided
 * chunk manifest and pre-measured gzipped sizes. That keeps it fast-check
 * testable (tasks 4.2/4.3) and lets the build-time wrapper
 * (`launch-bundle-guard.ts`, task 4.4) own all I/O: it parses `dist/index.html`,
 * measures gzipped sizes, then feeds the numbers here and emits the resulting
 * rows as an `EvidenceArtifact`.
 *
 * The four checks map to Requirement 5:
 *   - `checkEntryExclusions`     — R5.1, R5.2 (no heavy/admin chunk on entry path)
 *   - `checkEntryBudget`         — R5.3, R5.4 (≤ 150 KB gz entry budget)
 *   - `checkPdfBudget`           — R5.5, R5.6 (≤ 772 KB gz first-PDF-action budget)
 *   - `checkSentryOnPublicEntry` — R5.7, R5.8 (no `vendor-sentry` on a public entry)
 *
 * `evaluateBundle` combines all four into per-check rows plus an overall verdict.
 */

import type { EvidenceCheck } from '../tests/contract/evidenceArtifact'

/**
 * Entry-path gzipped size budget (Requirement 5.3): at most 150 KB gzipped.
 */
export const ENTRY_GZ_BUDGET_BYTES = 150 * 1024

/**
 * Document-generation download budget (Requirement 5.5): a hard upper bound of
 * 772 KB gzipped transferred on the first user action that triggers PDF
 * generation or download (covers both `@react-pdf/renderer` and `jspdf`).
 */
export const PDF_GZ_BUDGET_BYTES = 772 * 1024

/**
 * A forbidden library/chunk family and the substring markers that identify it.
 *
 * Markers are matched case-insensitively as substrings so they survive bundler
 * renaming (e.g. `vendor-react-pdf-a1b2c3.js`). This mirrors the marker approach
 * already used by `scripts/check-entry-chunk.ts`.
 */
export interface ForbiddenMarker {
  /** Human-readable family name recorded against an offending chunk. */
  readonly name: string
  /** Substring markers; a chunk matches the family if it contains any of them. */
  readonly markers: readonly string[]
}

/**
 * Markers that must never appear in the entry/preload set of any route
 * (Requirement 5.1): the two PDF engines and their helpers, the HTML-to-canvas
 * dependency, OCR (`tesseract`) chunks, chart (`recharts`) chunks, and
 * admin-only page chunks.
 *
 * `vendor-sentry` is intentionally **not** here: it is only forbidden on a
 * Public_Route entry path and has its own check (`checkSentryOnPublicEntry`,
 * Requirements 5.7/5.8).
 */
export const FORBIDDEN_ENTRY_MARKERS: readonly ForbiddenMarker[] = [
  {
    name: '@react-pdf/renderer',
    markers: ['@react-pdf', 'vendor-react-pdf', 'react-pdf-core', 'yoga.wasm'],
  },
  { name: 'vendor-pdf', markers: ['vendor-pdf'] },
  { name: 'jspdf', markers: ['jspdf'] },
  { name: 'pdf-lib', markers: ['pdf-lib'] },
  { name: 'html2canvas', markers: ['html2canvas'] },
  {
    name: 'tesseract/OCR',
    markers: ['tesseract', 'vendor-ocr', 'ocr-', '-ocr'],
  },
  {
    name: 'recharts/charts',
    markers: ['recharts', 'vendor-charts', 'vendor-recharts', 'chart-vendor'],
  },
  {
    name: 'admin-only page chunks',
    markers: ['admin-', '-admin', 'page-admin', 'admindashboard'],
  },
] as const

/**
 * Markers that identify the Sentry monitoring vendor chunk (Requirement 5.7).
 */
export const SENTRY_MARKERS: readonly string[] = [
  'vendor-sentry',
  '@sentry',
  'sentry',
] as const

/** Outcome of the entry-path exclusion check. */
export interface EntryExclusionResult {
  /** `true` iff no excluded marker appears in the entry/preload set. */
  readonly pass: boolean
  /**
   * Offending chunks, each annotated with the matched family, e.g.
   * `"vendor-react-pdf-a1b2.js (@react-pdf/renderer)"`. Empty when `pass`.
   */
  readonly forbiddenPresent: string[]
}

/** Outcome of a gzipped-size budget check. */
export interface BudgetResult {
  /** `true` iff the measured size is at most the budget. */
  readonly pass: boolean
  /** Human-readable measured size, e.g. `"94.4 KB"`. */
  readonly observed: string
  /** Human-readable budget, e.g. `"150 KB"`. */
  readonly threshold: string
  /** Measured size in bytes (raw input, echoed for machine comparison). */
  readonly observedBytes: number
  /** Budget in bytes. */
  readonly thresholdBytes: number
}

/** Outcome of the public-route Sentry-absence check. */
export interface SentryEntryResult {
  /** `true` iff `vendor-sentry` is absent from the public-route entry path. */
  readonly pass: boolean
  /** `true` iff a Sentry marker was found on the public-route entry path. */
  readonly sentryPresent: boolean
  /** The public-route entry chunks that matched a Sentry marker. */
  readonly offenders: string[]
}

/** Inputs to {@link evaluateBundle}: a manifest + pre-measured gzipped sizes. */
export interface BundleInput {
  /** Entry + preloaded chunk identifiers for the measured route(s). */
  readonly entryChunks: readonly string[]
  /** Measured gzipped size of the entry path, in bytes. */
  readonly entryGzBytes: number
  /** Measured gzipped transfer on the first PDF-generating action, in bytes. */
  readonly firstPdfActionGzBytes: number
  /** Entry + preloaded chunk identifiers for a Public_Route specifically. */
  readonly publicEntryChunks: readonly string[]
}

/** Combined per-check rows plus the overall Bundle_Guard verdict. */
export interface BundleEvaluation {
  /** `true` iff every check passed. */
  readonly pass: boolean
  /** Per-check rows, ready to drop into an `EvidenceArtifact.checks` list. */
  readonly checks: EvidenceCheck[]
  /** Human-readable descriptions of each failing check; empty when `pass`. */
  readonly failures: string[]
}

/** Format a byte count as a one-decimal KB string (mirrors `check:entry`). */
function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** Case-insensitive substring match of any marker against a chunk identifier. */
function matchesAnyMarker(chunk: string, markers: readonly string[]): boolean {
  const haystack = chunk.toLowerCase()
  return markers.some((marker) => haystack.includes(marker.toLowerCase()))
}

/**
 * Requirements 5.1, 5.2 — the entry-path exclusion check fails if and only if
 * an excluded marker appears in the entry/preload set, recording each offending
 * chunk against the family it matched.
 */
export function checkEntryExclusions(
  entryChunks: readonly string[],
): EntryExclusionResult {
  const forbiddenPresent: string[] = []
  for (const chunk of entryChunks) {
    for (const { name, markers } of FORBIDDEN_ENTRY_MARKERS) {
      if (matchesAnyMarker(chunk, markers)) {
        forbiddenPresent.push(`${chunk} (${name})`)
      }
    }
  }
  return { pass: forbiddenPresent.length === 0, forbiddenPresent }
}

/**
 * Requirements 5.3, 5.4 — the entry-path gzipped size check passes if and only
 * if the measured size is at most {@link ENTRY_GZ_BUDGET_BYTES} (150 KB gz),
 * recording the measured value against the budget.
 */
export function checkEntryBudget(entryGzBytes: number): BudgetResult {
  return {
    pass: entryGzBytes <= ENTRY_GZ_BUDGET_BYTES,
    observed: formatKb(entryGzBytes),
    threshold: formatKb(ENTRY_GZ_BUDGET_BYTES),
    observedBytes: entryGzBytes,
    thresholdBytes: ENTRY_GZ_BUDGET_BYTES,
  }
}

/**
 * Requirements 5.5, 5.6 — the document-generation check passes if and only if
 * the first-PDF-action gzipped transfer is at most {@link PDF_GZ_BUDGET_BYTES}
 * (772 KB gz), recording the measured value against the budget.
 */
export function checkPdfBudget(firstPdfActionGzBytes: number): BudgetResult {
  return {
    pass: firstPdfActionGzBytes <= PDF_GZ_BUDGET_BYTES,
    observed: formatKb(firstPdfActionGzBytes),
    threshold: formatKb(PDF_GZ_BUDGET_BYTES),
    observedBytes: firstPdfActionGzBytes,
    thresholdBytes: PDF_GZ_BUDGET_BYTES,
  }
}

/**
 * Requirements 5.7, 5.8 — the public-route Sentry check passes if and only if
 * `vendor-sentry` is absent from the Public_Route entry path, recording the
 * offending chunk(s) otherwise.
 */
export function checkSentryOnPublicEntry(
  publicEntryChunks: readonly string[],
): SentryEntryResult {
  const offenders = publicEntryChunks.filter((chunk) =>
    matchesAnyMarker(chunk, SENTRY_MARKERS),
  )
  return {
    pass: offenders.length === 0,
    sentryPresent: offenders.length > 0,
    offenders,
  }
}

/**
 * Top-level Bundle_Guard evaluation (Requirement 5): runs the four checks and
 * combines them into per-check evidence rows plus an overall verdict. The
 * overall result passes if and only if every check passes.
 */
export function evaluateBundle(input: BundleInput): BundleEvaluation {
  const exclusions = checkEntryExclusions(input.entryChunks)
  const entryBudget = checkEntryBudget(input.entryGzBytes)
  const pdfBudget = checkPdfBudget(input.firstPdfActionGzBytes)
  const sentry = checkSentryOnPublicEntry(input.publicEntryChunks)

  const checks: EvidenceCheck[] = [
    {
      id: 'entry-path-exclusions',
      result: exclusions.pass ? 'pass' : 'fail',
      observed: `${exclusions.forbiddenPresent.length} forbidden chunk(s)`,
      threshold: '0 forbidden chunks on entry path',
      detail: exclusions.forbiddenPresent.join('; '),
      forbidden_present: exclusions.forbiddenPresent,
    },
    {
      id: 'entry-gz-budget',
      result: entryBudget.pass ? 'pass' : 'fail',
      observed: entryBudget.observed,
      threshold: entryBudget.threshold,
      detail: '',
      entry_gz_bytes: entryBudget.observedBytes,
      entry_budget_bytes: entryBudget.thresholdBytes,
    },
    {
      id: 'pdf-gz-budget',
      result: pdfBudget.pass ? 'pass' : 'fail',
      observed: pdfBudget.observed,
      threshold: pdfBudget.threshold,
      detail: '',
      first_pdf_action_gz_bytes: pdfBudget.observedBytes,
      pdf_budget_bytes: pdfBudget.thresholdBytes,
    },
    {
      id: 'sentry-public-entry',
      result: sentry.pass ? 'pass' : 'fail',
      observed: sentry.sentryPresent
        ? `vendor-sentry present: ${sentry.offenders.join(', ')}`
        : 'vendor-sentry absent',
      threshold: 'vendor-sentry absent from public-route entry path',
      detail: sentry.offenders.join('; '),
      sentry_on_public_entry: sentry.sentryPresent,
    },
  ]

  const failures: string[] = []
  if (!exclusions.pass) {
    failures.push(
      `Forbidden chunk(s) on entry path: ${exclusions.forbiddenPresent.join(', ')}`,
    )
  }
  if (!entryBudget.pass) {
    failures.push(
      `Entry path ${entryBudget.observed} exceeds budget ${entryBudget.threshold}`,
    )
  }
  if (!pdfBudget.pass) {
    failures.push(
      `First PDF action ${pdfBudget.observed} exceeds budget ${pdfBudget.threshold}`,
    )
  }
  if (!sentry.pass) {
    failures.push(
      `vendor-sentry present on public-route entry path: ${sentry.offenders.join(', ')}`,
    )
  }

  return { pass: failures.length === 0, checks, failures }
}
