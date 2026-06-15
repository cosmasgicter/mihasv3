/**
 * Document-flow drift guard — admissions frontend (R18.1).
 *
 * Locks in the Phase 3 (R7) rewire: official, server-issued student documents
 * are produced by the backend (`services/officialDocuments.ts` /
 * `useOfficialDocument`) and downloaded as the authoritative stored record.
 * The client-side `@/lib/pdf` generators
 * (`generateApplicationSlip` / `generateAcceptanceLetter` /
 * `generatePaymentReceipt`) are preview/draft-only and MUST NOT be reachable
 * from a student official-download path (R7.1, R7.6).
 *
 * This guard scans `apps/admissions/src` (excluding test files and the
 * `lib/pdf` library implementation itself) and FAILS — reporting the offending
 * module + symbol — if a non-test module references the `@/lib/pdf` barrel (or
 * any of its submodules) or invokes one of the three client generators as a
 * bare function call, unless that module is on the small reviewed
 * `PREVIEW_ALLOWLIST` of legitimate dev/draft-preview modules.
 *
 * A real regression — e.g. `DocumentButtons.tsx` importing `@/lib/pdf` again to
 * mint an "official" client PDF — is not on the allowlist and so fails the
 * build (R18.1, R18.5).
 *
 * Property 29 (beanola-production-readiness) extends this guard platform-wide:
 * the scan covers every student AND admin module under `apps/admissions/src`,
 * and the production-official-component check below explicitly pins the student
 * wizard success screen, the student payment page, the public tracker, AND the
 * admin application-detail official-document panel so that none can reach a
 * `@/lib/pdf` client generator for an official document (R6.2, R6.3, R16.5).
 *
 * Validates: Requirements R18.1
 * Feature: beanola-production-readiness, Property 29: No client-only official PDF is reachable from an official-download path
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const SRC_DIR = path.join(REPO_ROOT, 'apps', 'admissions', 'src')

// The client PDF library lives here. It IS the generator implementation, so its
// own internal references (and JSDoc usage examples) are not "student-facing
// drift" and are excluded from the scan.
const PDF_LIB_REL = 'apps/admissions/src/lib/pdf'

const SCANNED_EXTENSIONS = /\.(ts|tsx)$/

// The three client-side generators that must never produce an official,
// server-issued document for client download (R18.1).
const GENERATOR_SYMBOLS = [
  'generateApplicationSlip',
  'generateAcceptanceLetter',
  'generatePaymentReceipt',
] as const

/**
 * A line "imports the @/lib/pdf module" when it pulls the barrel or any of its
 * submodules in through a static `from`, a side-effect `import '...'`, or a
 * dynamic `import('...')`. Comment prose that merely mentions the path (no
 * `from` / `import(`) does not match.
 */
const PDF_IMPORT_RE =
  /(?:from\s*|import\s*\(\s*|import\s+)['"](@\/lib\/pdf(?:\/[^'"]*)?)['"]/

/**
 * A bare invocation of a client generator — `generateApplicationSlip(` — that
 * is NOT a method access (`applicationService.generateApplicationSlip(`) and
 * not part of a longer identifier (`handleGenerateApplicationSlip`). The
 * backend API service exposes same-named methods; those are property accesses
 * and are intentionally not flagged.
 */
const GENERATOR_CALL_RE = new RegExp(
  String.raw`(?<![\w.])(${GENERATOR_SYMBOLS.join('|')})\s*\(`,
)

/**
 * Reviewed allowlist of non-test modules that may legitimately reference the
 * client `@/lib/pdf` generators. These are dev previews and non-official draft
 * previews only — none of them is a student official-download path (R7.6).
 *
 * Keep this list tight: a new entry must be a genuine dev/draft-preview module.
 * A production student official-download component appearing here would be a
 * real defect, not an allowlist candidate.
 */
interface AllowlistEntry {
  path: string
  reason: string
}

const PREVIEW_ALLOWLIST: readonly AllowlistEntry[] = [
  {
    path: 'apps/admissions/src/pages/dev/DocumentPreview.tsx',
    reason:
      'Dev-only PDF preview page (under /dev). Renders draft previews for engineers; not a student official-download path.',
  },
  {
    path: 'apps/admissions/src/pages/dev/AcceptanceLetterPreview.tsx',
    reason:
      'Dev-only acceptance-letter preview page (under /dev). Preview/QA surface only; not a student official-download path.',
  },
  {
    path: 'apps/admissions/src/lib/slipService.ts',
    reason:
      'Legacy/manual slip preview helper (non-official draft preview, R7.6). Not wired into production student or public document actions.',
  },
  {
    path: 'apps/admissions/src/hooks/useDocumentGeneration.ts',
    reason:
      'Legacy/orphaned client-generation hook retained for dev/draft preview only. Not wired into the student official-download components (those use useOfficialDocument).',
  },
  {
    path: 'apps/admissions/src/hooks/usePaymentReceipt.ts',
    reason:
      'Legacy/orphaned client receipt-preview hook. Not wired into the student official-download path (DownloadReceiptButton uses useOfficialDocument).',
  },
] as const

const ALLOWLIST_PATHS = new Set(PREVIEW_ALLOWLIST.map((e) => e.path))

// The production student official-download components. These MUST stay clean:
// they route through services/officialDocuments.ts via useOfficialDocument and
// must never appear on the preview allowlist (R7.1).
//
// Property 29 (beanola-production-readiness) extends this set platform-wide to
// the admin official-download path: the admin application-detail official-
// document panel and its hook must also resolve every official download to the
// backend-stored Official_Document, never a `@/lib/pdf` client render
// (R6.2, R6.3, R16.5).
const PRODUCTION_OFFICIAL_COMPONENTS = [
  'apps/admissions/src/components/student/DocumentButtons.tsx',
  'apps/admissions/src/components/student/ApplicationSlipActions.tsx',
  'apps/admissions/src/components/student/DownloadReceiptButton.tsx',
  'apps/admissions/src/pages/student/applicationWizard/hooks/useApplicationSlip.ts',
  'apps/admissions/src/pages/student/applicationWizard/hooks/useWizardController.ts',
  'apps/admissions/src/pages/public/tracker/index.tsx',
  // Admin application-detail official-download path (Property 29, platform-wide).
  'apps/admissions/src/components/admin/applications/AdminOfficialDocumentsPanel.tsx',
  'apps/admissions/src/hooks/useAdminOfficialDocuments.ts',
] as const

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(entryPath)
    if (!entry.isFile() || !SCANNED_EXTENSIONS.test(entry.name)) return []
    return [entryPath]
  })
}

function relativePath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

function isTestFile(rel: string): boolean {
  return /\.(test|spec|property)\.(ts|tsx)$/.test(rel) || rel.includes('/tests/')
}

function isCommentLine(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')
}

interface Violation {
  rel: string
  line: number
  symbol: string
  snippet: string
}

/**
 * Scan a single file for client-generator references. Returns the hits as
 * { module, symbol } findings regardless of allowlist membership — the caller
 * decides what to do with allowlisted files.
 */
function scanFile(absPath: string): Violation[] {
  const rel = relativePath(absPath)
  const hits: Violation[] = []
  const lines = readFileSync(absPath, 'utf-8').split('\n')

  lines.forEach((line, idx) => {
    if (isCommentLine(line)) return

    const importMatch = PDF_IMPORT_RE.exec(line)
    if (importMatch) {
      hits.push({
        rel,
        line: idx + 1,
        symbol: importMatch[1] ?? '@/lib/pdf',
        snippet: line.trim().slice(0, 160),
      })
    }

    const callMatch = GENERATOR_CALL_RE.exec(line)
    if (callMatch) {
      hits.push({
        rel,
        line: idx + 1,
        symbol: `${callMatch[1]}()`,
        snippet: line.trim().slice(0, 160),
      })
    }
  })

  return hits
}

function scanStudentFacingModules(): Violation[] {
  const files = collectSourceFiles(SRC_DIR).sort()
  const violations: Violation[] = []

  for (const absPath of files) {
    const rel = relativePath(absPath)
    if (isTestFile(rel)) continue
    // The PDF library itself is the generator implementation, not a consumer.
    if (rel.startsWith(`${PDF_LIB_REL}/`) || rel === `${PDF_LIB_REL}/index.ts`) continue
    if (ALLOWLIST_PATHS.has(rel)) continue

    violations.push(...scanFile(absPath))
  }

  return violations
}

describe('Document-flow drift guard (R18.1)', () => {
  it('no non-allowlisted module references @/lib/pdf or a client generator', () => {
    const violations = scanStudentFacingModules()
    const report = violations
      .map((v) => `${v.rel}:${v.line} -> ${v.symbol}\n      ${v.snippet}`)
      .join('\n  ')

    expect(
      violations,
      'A non-test module references the client-side PDF generators on a path that ' +
        'is not a reviewed dev/draft preview. Official student documents must come ' +
        'from the backend (services/officialDocuments.ts via useOfficialDocument), ' +
        'never from a client `@/lib/pdf` render (R7.1, R7.6, R18.1). If this is a ' +
        'genuine dev/draft-preview module, add it to PREVIEW_ALLOWLIST with a reason; ' +
        'if it is a student official-download component, route it through the backend ' +
        'service instead.\nOffending references:\n  ' +
        report,
    ).toEqual([])
  })

  it('every PREVIEW_ALLOWLIST entry exists and still references @/lib/pdf (keeps the list tight)', () => {
    const stale: string[] = []
    for (const entry of PREVIEW_ALLOWLIST) {
      const absPath = path.join(REPO_ROOT, entry.path)
      if (!existsSync(absPath)) {
        stale.push(`${entry.path} (file missing)`)
        continue
      }
      const hits = scanFile(absPath)
      if (hits.length === 0) {
        stale.push(`${entry.path} (no @/lib/pdf reference present)`)
      }
    }
    expect(
      stale,
      'Stale PREVIEW_ALLOWLIST entries — remove these from documentFlowDriftGuard.test.ts:\n  ' +
        stale.join('\n  '),
    ).toEqual([])
  })

  it('every PREVIEW_ALLOWLIST entry has a documented reason', () => {
    for (const entry of PREVIEW_ALLOWLIST) {
      expect(entry.path, `allowlist entry missing 'path': ${JSON.stringify(entry)}`).toBeTruthy()
      expect(
        entry.reason,
        `allowlist entry missing 'reason': ${JSON.stringify(entry)}`,
      ).toBeTruthy()
    }
  })

  it('production student official-download components stay clean and are never allowlisted (R7.1)', () => {
    const offenders: string[] = []
    for (const rel of PRODUCTION_OFFICIAL_COMPONENTS) {
      // A production official component must never be used to silence the guard.
      expect(
        ALLOWLIST_PATHS.has(rel),
        `${rel} must not appear on PREVIEW_ALLOWLIST — it is a student official-download path.`,
      ).toBe(false)

      const absPath = path.join(REPO_ROOT, rel)
      if (!existsSync(absPath)) continue
      const hits = scanFile(absPath)
      if (hits.length > 0) {
        offenders.push(
          ...hits.map((h) => `${h.rel}:${h.line} -> ${h.symbol}\n      ${h.snippet}`),
        )
      }
    }
    expect(
      offenders,
      'A production student official-download component references the client PDF ' +
        'generators. This is a real defect (R7.1): route it through ' +
        'services/officialDocuments.ts via useOfficialDocument instead of ' +
        '`@/lib/pdf`.\nOffending references:\n  ' +
        offenders.join('\n  '),
    ).toEqual([])
  })

  // Feature: beanola-production-readiness, Property 29: No client-only official PDF is reachable from an official-download path
  it('Property 29: no student/admin module on an official-download path reaches a client @/lib/pdf generator (R6.2, R6.3, R16.5)', () => {
    // Platform-wide: the scan must reach BOTH student and admin source trees,
    // so a regression in either surface is caught.
    const scanned = collectSourceFiles(SRC_DIR)
      .map(relativePath)
      .filter((rel) => !isTestFile(rel))
    expect(
      scanned.some((rel) => rel.startsWith('apps/admissions/src/components/admin/')),
      'Property 29 requires the document-flow scan to cover admin modules, but no ' +
        'admin source files were scanned. The guard must run platform-wide across ' +
        'student and admin official-download paths.',
    ).toBe(true)
    expect(
      scanned.some((rel) => rel.startsWith('apps/admissions/src/components/student/')),
      'Property 29 requires the document-flow scan to cover student modules.',
    ).toBe(true)

    // No non-allowlisted module anywhere under apps/admissions/src may reach a
    // client generator — this is the platform-wide official-download property.
    const violations = scanStudentFacingModules()
    const report = violations
      .map((v) => `${v.rel}:${v.line} -> ${v.symbol}\n      ${v.snippet}`)
      .join('\n  ')
    expect(
      violations,
      'Property 29 violation: a non-allowlisted student/admin module on an ' +
        'official-download path imports `@/lib/pdf` or invokes a client generator ' +
        '(generateApplicationSlip / generateAcceptanceLetter / generatePaymentReceipt). ' +
        'Every official download must resolve to the backend-generated, backend-stored ' +
        'Official_Document (R6.2, R6.3, R16.5).\nOffending references:\n  ' +
        report,
    ).toEqual([])
  })
})
