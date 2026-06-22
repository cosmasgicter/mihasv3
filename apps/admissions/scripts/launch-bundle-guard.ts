#!/usr/bin/env bun
/**
 * Launch Bundle_Guard — Gate 5 of the `beanola-launch-verification` spec.
 *
 * Spec: `.kiro/specs/beanola-launch-verification/` — task 4.4, Requirement 5
 * (R5.1, R5.3, R5.5, R5.7).
 *
 * This is the build-time **I/O wrapper** around the pure predicate in
 * `launchBundlePredicate.ts` (task 4.1). It *extends* the existing `check:entry`
 * guard (`check-entry-chunk.ts`): it reuses the same `dist/index.html` parsing
 * and gzip-measurement approach, then layers on the stricter launch budget
 * (≤ 150 KB gz entry), the expanded exclusion list (OCR/`tesseract`,
 * chart/`recharts`, admin-only page chunks on top of the PDF engines), the
 * document-generation 772 KB-gz budget, and the public-route `vendor-sentry`
 * absence check.
 *
 * Responsibilities (all the I/O the pure core deliberately avoids):
 *   1. Parse `dist/index.html` for the entry script + `modulepreload` chunks and
 *      resolve their **static-import closure** from the Vite manifest, so a
 *      chunk that is loaded eagerly but not listed in the HTML (e.g.
 *      `vendor-sentry` pulled in transitively by `vendor-react`) is still
 *      counted on the entry path.
 *   2. Measure gzipped sizes of the entry path and of the first PDF-generating
 *      action (the PDF-engine static chunk closure that is *not* already on
 *      the entry path).
 *   3. Feed the measured manifest + sizes into `evaluateBundle()`.
 *   4. Emit `docs/launch-evidence/05-bundle/bundle-evidence.json` via the shared
 *      `EvidenceArtifact` envelope.
 *   5. Exit non-zero on any violation; zero on a clean pass.
 *
 * If the build output is absent (no `dist/`, no `index.html`, no manifest) the
 * gate **cannot measure** and is recorded as not passed (`status: "unknown"`)
 * with a clear message — it never fabricates passing numbers.
 */

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  evaluateBundle,
  type BundleEvaluation,
  type BundleInput,
} from './launchBundlePredicate'
import {
  toJson,
  utcNowIso,
  type EvidenceArtifact,
  type EvidenceStatus,
} from '../tests/contract/evidenceArtifact'

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const DIST_DIR = path.resolve(SCRIPT_DIR, '../dist')
const INDEX_HTML = path.join(DIST_DIR, 'index.html')
const MANIFEST_PATH = path.join(DIST_DIR, '.vite', 'manifest.json')

/** Repo root, used to resolve the evidence-store output path. */
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..')
const EVIDENCE_DIR = path.join(
  REPO_ROOT,
  'docs',
  'launch-evidence',
  '05-bundle',
)
const EVIDENCE_FILE = path.join(EVIDENCE_DIR, 'bundle-evidence.json')

const GATE_ID = 'bundle-guard'
const REQUIREMENT = 'R5'

/**
 * Substring markers (case-insensitive) that identify the PDF-engine family of
 * chunks. The first PDF-generating user action transfers these engines and
 * their static dependency closure. Mirrors the PDF families in
 * `launchBundlePredicate.ts`.
 */
const PDF_CHUNK_MARKERS: readonly string[] = [
  'vendor-pdf',
  'vendor-react-pdf',
  '@react-pdf',
  'react-pdf-core',
  'jspdf',
  'pdf-lib',
] as const

/** Shape of a single Vite manifest entry (the fields this guard relies on). */
interface ManifestChunk {
  readonly file: string
  readonly name?: string
  readonly src?: string
  readonly isEntry?: boolean
  readonly isDynamicEntry?: boolean
  readonly imports?: readonly string[]
  readonly dynamicImports?: readonly string[]
}

type Manifest = Record<string, ManifestChunk>

/** Raised when the build output needed to measure the gate is missing. */
class BuildOutputMissingError extends Error {}

/** Gzip a file at `level: 9` and return the compressed byte length. */
function gzippedSize(absPath: string): number {
  const raw = fs.readFileSync(absPath)
  return zlib.gzipSync(raw, { level: 9 }).length
}

/** Basename of an `/assets/js/...` URL or relative manifest file path. */
function basename(filePath: string): string {
  return filePath.split('/').pop() ?? filePath
}

/**
 * Load and parse the Vite manifest (`dist/.vite/manifest.json`).
 *
 * @throws {BuildOutputMissingError} when the manifest is absent.
 */
function loadManifest(): Manifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new BuildOutputMissingError(
      `Vite manifest not found at ${MANIFEST_PATH}. Run \`bun run build\` first.`,
    )
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as Manifest
}

/**
 * Parse `dist/index.html` for the entry `<script type="module">` and every
 * `<link rel="modulepreload">` — the files a cold browser evaluates before
 * first paint. Mirrors `check-entry-chunk.ts`.
 *
 * @throws {BuildOutputMissingError} when `index.html` is absent.
 */
function readEntryFilePaths(): string[] {
  if (!fs.existsSync(INDEX_HTML)) {
    throw new BuildOutputMissingError(
      `dist/index.html not found at ${INDEX_HTML}. Run \`bun run build\` first.`,
    )
  }
  const html = fs.readFileSync(INDEX_HTML, 'utf8')
  const scriptMatch =
    /<script[^>]+type="module"[^>]+src="(\/assets\/js\/[^"]+)"/.exec(html)
  const preloads = Array.from(
    html.matchAll(
      /<link[^>]+rel="modulepreload"[^>]+href="(\/assets\/js\/[^"]+)"/g,
    ),
  ).map((m) => m[1])
  const all = [scriptMatch?.[1], ...preloads].filter(
    (x): x is string => Boolean(x),
  )
  return [...new Set(all)]
}

/** Build a reverse lookup from an emitted chunk `file` to its manifest key. */
function buildFileToKey(manifest: Manifest): Map<string, string> {
  const map = new Map<string, string>()
  for (const [key, chunk] of Object.entries(manifest)) {
    map.set(chunk.file, key)
    map.set(`/${chunk.file}`, key)
  }
  return map
}

/**
 * Compute the set of emitted chunk `file`s reachable from `rootKeys` by
 * following manifest `imports` (always) and `dynamicImports` (only when
 * `includeDynamic`). Cycles are guarded by a visited set.
 */
function resolveClosure(
  manifest: Manifest,
  rootKeys: readonly string[],
  includeDynamic: boolean,
): Set<string> {
  const files = new Set<string>()
  const visited = new Set<string>()
  const queue: string[] = [...rootKeys]

  while (queue.length > 0) {
    const key = queue.shift() as string
    if (visited.has(key)) {
      continue
    }
    visited.add(key)
    const chunk = manifest[key]
    if (!chunk) {
      continue
    }
    files.add(chunk.file)
    for (const dep of chunk.imports ?? []) {
      if (!visited.has(dep)) {
        queue.push(dep)
      }
    }
    if (includeDynamic) {
      for (const dep of chunk.dynamicImports ?? []) {
        if (!visited.has(dep)) {
          queue.push(dep)
        }
      }
    }
  }
  return files
}

/** Find the manifest entry-point key (`isEntry: true`), falling back to HTML. */
function findEntryKey(manifest: Manifest): string | undefined {
  for (const [key, chunk] of Object.entries(manifest)) {
    if (chunk.isEntry) {
      return key
    }
  }
  return manifest['index.html'] ? 'index.html' : undefined
}

/** Manifest keys whose emitted chunk basename matches a PDF-engine marker. */
function findPdfRootKeys(manifest: Manifest): string[] {
  const roots: string[] = []
  for (const [key, chunk] of Object.entries(manifest)) {
    const name = basename(chunk.file).toLowerCase()
    if (PDF_CHUNK_MARKERS.some((marker) => name.includes(marker.toLowerCase()))) {
      roots.push(key)
    }
  }
  return roots
}

/** Sum the gzipped size (bytes) of a set of emitted chunk `file`s. */
function sumGzippedBytes(files: Iterable<string>): number {
  let total = 0
  for (const file of files) {
    const abs = path.join(DIST_DIR, file)
    if (fs.existsSync(abs)) {
      total += gzippedSize(abs)
    }
  }
  return total
}

/**
 * Read `dist/` and the Vite manifest and assemble the {@link BundleInput} the
 * pure predicate consumes. The entry path is the static-import closure of the
 * HTML-declared entry + preload chunks; the first-PDF-action transfer is the
 * PDF-engine static closure minus whatever is already on the entry path.
 *
 * Important: this intentionally does not follow `dynamicImports` from the PDF
 * roots. jsPDF exposes optional HTML/SVG APIs that dynamically import
 * `html2canvas`, `DOMPurify`, and `canvg`, but the production PDF actions here
 * use `autoTable`, `pdf-lib`, and `@react-pdf/renderer`. Counting those optional
 * branches made the guard fail on code a first PDF click does not download.
 *
 * @throws {BuildOutputMissingError} when required build output is absent.
 */
export function computeBundleInput(): BundleInput {
  const manifest = loadManifest()
  const fileToKey = buildFileToKey(manifest)

  // 1) Entry/preload chunks declared in index.html → manifest keys.
  const declaredFiles = readEntryFilePaths()
  const rootKeys = new Set<string>()
  const entryKey = findEntryKey(manifest)
  if (entryKey) {
    rootKeys.add(entryKey)
  }
  for (const filePath of declaredFiles) {
    const key = fileToKey.get(filePath) ?? fileToKey.get(filePath.replace(/^\//, ''))
    if (key) {
      rootKeys.add(key)
    }
  }
  if (rootKeys.size === 0) {
    throw new BuildOutputMissingError(
      'No entry chunks resolved from dist/index.html + manifest — nothing to measure.',
    )
  }

  // 2) Static-import closure = what the browser evaluates before first paint.
  const entryFiles = resolveClosure(manifest, [...rootKeys], false)
  const entryChunks = [...entryFiles].map(basename).sort()
  const entryGzBytes = sumGzippedBytes(entryFiles)

  // 3) First PDF-action transfer = PDF-engine static closure not already on
  //    entry path. Optional dynamic branches (jsPDF HTML/SVG renderers) are
  //    still lazy and still forbidden on the entry path, but they are not part
  //    of the first document-generation click this gate budgets.
  const pdfRootKeys = findPdfRootKeys(manifest)
  const pdfFiles = resolveClosure(manifest, pdfRootKeys, false)
  const firstPdfActionFiles = [...pdfFiles].filter((f) => !entryFiles.has(f))
  const firstPdfActionGzBytes = sumGzippedBytes(firstPdfActionFiles)

  // 4) Public-route entry path. index.html is served for the public landing
  //    route, so the public entry path is the same measured entry closure.
  const publicEntryChunks = entryChunks

  return {
    entryChunks,
    entryGzBytes,
    firstPdfActionGzBytes,
    publicEntryChunks,
  }
}

/** One-decimal KB rendering of a byte count. */
function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`
}

/** Build the human-readable one-line summary for the artifact. */
function buildSummary(input: BundleInput, evaluation: BundleEvaluation): string {
  const sentryRow = evaluation.checks.find((c) => c.id === 'sentry-public-entry')
  const sentryPresent = sentryRow?.sentry_on_public_entry === true
  const forbiddenRow = evaluation.checks.find(
    (c) => c.id === 'entry-path-exclusions',
  )
  const forbiddenCount = Array.isArray(forbiddenRow?.forbidden_present)
    ? forbiddenRow.forbidden_present.length
    : 0
  return (
    `Entry path ${formatKb(input.entryGzBytes)} gz; ` +
    `${forbiddenCount} forbidden chunk(s) on entry path; ` +
    `first PDF action ${formatKb(input.firstPdfActionGzBytes)} gz; ` +
    `vendor-sentry ${sentryPresent ? 'present' : 'absent'} on public entry path.`
  )
}

/** Assemble the shared `EvidenceArtifact` envelope from an evaluation. */
export function buildArtifact(
  input: BundleInput,
  evaluation: BundleEvaluation,
): EvidenceArtifact {
  return {
    gate_id: GATE_ID,
    requirement: REQUIREMENT,
    status: evaluation.pass ? 'passed' : 'failed',
    generated_at: utcNowIso(),
    generated_by: 'ci',
    summary: buildSummary(input, evaluation),
    checks: evaluation.checks,
    assets: [],
    failures: evaluation.failures,
  }
}

/** Artifact emitted when the build output is absent and the gate cannot measure. */
function buildUnmeasurableArtifact(message: string): EvidenceArtifact {
  return {
    gate_id: GATE_ID,
    requirement: REQUIREMENT,
    status: 'unknown' satisfies EvidenceStatus,
    generated_at: utcNowIso(),
    generated_by: 'ci',
    summary: `Bundle_Guard could not measure the build: ${message}`,
    checks: [],
    assets: [],
    failures: [message],
  }
}

/** Write the artifact to the evidence store, creating the directory if needed. */
function writeArtifact(artifact: EvidenceArtifact): void {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true })
  fs.writeFileSync(EVIDENCE_FILE, `${toJson(artifact)}\n`, 'utf8')
}

/** Print a `check:entry`-style human-readable report of the evaluation. */
function printReport(input: BundleInput, evaluation: BundleEvaluation): void {
  console.log('Launch Bundle_Guard (Gate 5) — measured from dist/\n')
  for (const check of evaluation.checks) {
    const tag = check.result === 'pass' ? '\u2713' : '\u2717'
    console.log(`  ${tag} ${check.id}`)
    console.log(`    observed:  ${check.observed ?? ''}`)
    console.log(`    threshold: ${check.threshold ?? ''}`)
    if (check.detail) {
      console.log(`    detail:    ${check.detail}`)
    }
  }
  console.log(
    `\nEntry path: ${formatKb(input.entryGzBytes)} gz over ${input.entryChunks.length} chunk(s)`,
  )
  console.log(`First PDF action: ${formatKb(input.firstPdfActionGzBytes)} gz`)
}

/** Entry point: measure, emit evidence, and exit non-zero on any violation. */
export function main(): void {
  let artifact: EvidenceArtifact
  let exitCode: number

  try {
    const input = computeBundleInput()
    const evaluation = evaluateBundle(input)
    artifact = buildArtifact(input, evaluation)
    printReport(input, evaluation)
    if (evaluation.pass) {
      console.log('\n\u2713 Bundle_Guard passed — entry path within launch budget.')
      exitCode = 0
    } else {
      console.error('\n\u2717 Bundle_Guard FAILED:')
      for (const failure of evaluation.failures) {
        console.error(`  - ${failure}`)
      }
      exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    artifact = buildUnmeasurableArtifact(message)
    console.error(`\n\u2717 Bundle_Guard could not measure the build: ${message}`)
    console.error('  The gate cannot measure → recorded as not passed.')
    exitCode = 1
  }

  writeArtifact(artifact)
  console.log(`\nEvidence written to ${EVIDENCE_FILE}`)
  process.exit(exitCode)
}

if (import.meta.main) {
  main()
}
