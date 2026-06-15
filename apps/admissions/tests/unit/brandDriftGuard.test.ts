/**
 * Brand drift guard — admissions frontend (R10).
 *
 * Scans `apps/admissions/src` plus `apps/admissions/index.html` for the legacy
 * brand strings MIHAS / KATC / Mukuba / Kalulushi and legacy MIHAS domains and
 * fails — reporting the offending file and line — for any hit in a file that is
 * not present in the shared `docs/legacy-brand-allowlist.json` Brand_Allowlist
 * (R10.1, R10.3). Allowlisted files are permitted to contain those strings
 * (R10.4).
 *
 * This is the frontend half of the guard. The backend half lives at
 * `backend/tests/unit/test_brand_drift_guard.py` and reads the *same* allowlist
 * file, so the allowlist is the single source of truth.
 *
 * Together the two halves realise Property 28: the scan over
 * `apps/admissions/src`, `index.html`, `backend/apps` and `backend/config`
 * minus the Brand_Allowlist must be empty.
 *
 * Feature: beanola-production-readiness, Property 28: No non-allowlisted legacy brand string in active source
 *
 * Validates: Requirements 2.1, 7.12, 16.1 (and R10.1, R10.2, R10.3, R10.4)
 */
import { readdirSync, readFileSync, existsSync } from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

const REPO_ROOT = path.resolve(__dirname, '../../../..')
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'docs', 'legacy-brand-allowlist.json')
const SRC_DIR = path.join(REPO_ROOT, 'apps', 'admissions', 'src')
const INDEX_HTML = path.join(REPO_ROOT, 'apps', 'admissions', 'index.html')

// Legacy brand strings that must not reappear in non-allowlisted production
// source. Kept in sync with docs/legacy-brand-allowlist.json -> "patterns".
const BRAND_PATTERNS = [
  'MIHAS',
  'KATC',
  'Mukuba',
  'Kalulushi',
  'apply.mihas.edu.zm',
  'mihas.edu.zm',
  'mihas.beanola.com',
  'mihas.local',
] as const

const SCANNED_EXTENSIONS = /\.(ts|tsx|js|jsx|css|html|md|json)$/

interface AllowlistEntry {
  path: string
  reason: string
}

function loadAllowlist(): { patterns: string[]; paths: Set<string> } {
  const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8')) as {
    patterns?: string[]
    allowlist?: AllowlistEntry[]
  }
  return {
    patterns: raw.patterns ?? [],
    paths: new Set((raw.allowlist ?? []).map((e) => e.path)),
  }
}

function collectFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return collectFiles(entryPath)
    if (!entry.isFile() || !SCANNED_EXTENSIONS.test(entry.name)) return []
    return [entryPath]
  })
}

function relativePath(absPath: string): string {
  return path.relative(REPO_ROOT, absPath).split(path.sep).join('/')
}

function scanForViolations(allowlistPaths: Set<string>): string[] {
  const files = collectFiles(SRC_DIR)
  if (existsSync(INDEX_HTML)) files.push(INDEX_HTML)

  const violations: string[] = []
  for (const absPath of files.sort()) {
    const rel = relativePath(absPath)
    if (allowlistPaths.has(rel)) continue

    const lines = readFileSync(absPath, 'utf-8').split('\n')
    lines.forEach((line, idx) => {
      if (BRAND_PATTERNS.some((pat) => line.includes(pat))) {
        violations.push(`${rel}:${idx + 1}: ${line.trim().slice(0, 160)}`)
      }
    })
  }
  return violations
}

describe('Brand drift guard (R10)', () => {
  it('the shared Brand_Allowlist exists and is well-formed', () => {
    expect(existsSync(ALLOWLIST_PATH), `Brand_Allowlist not found at ${ALLOWLIST_PATH}`).toBe(true)
    const raw = JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8'))
    expect(Array.isArray(raw.allowlist)).toBe(true)
    for (const entry of raw.allowlist) {
      expect(entry.path, `allowlist entry missing 'path': ${JSON.stringify(entry)}`).toBeTruthy()
      expect(entry.reason, `allowlist entry missing 'reason': ${JSON.stringify(entry)}`).toBeTruthy()
    }
    // The allowlist's declared patterns must match what this guard enforces,
    // so the backend and frontend guards stay in lockstep.
    expect(raw.patterns).toEqual([...BRAND_PATTERNS])
  })

  it('no non-allowlisted brand strings under apps/admissions/src or index.html', () => {
    const { paths } = loadAllowlist()
    const violations = scanForViolations(paths)
    expect(
      violations,
      'Legacy brand strings/domains found in ' +
        'non-allowlisted frontend source. Either remove the brand fallback (R9) or, if this is ' +
        'legitimate tenant/preview/historical data, add the file to docs/legacy-brand-allowlist.json ' +
        'with a reason (R10.2).\nOffending hits:\n  ' +
        violations.join('\n  '),
    ).toEqual([])
  })

  it('frontend allowlist entries still contain a brand string (keeps the list small, R10.2)', () => {
    const { paths } = loadAllowlist()
    const stale: string[] = []
    for (const rel of [...paths].sort()) {
      if (!rel.startsWith('apps/admissions/')) continue // backend entries checked by the Python guard
      const absPath = path.join(REPO_ROOT, rel)
      if (!existsSync(absPath)) {
        stale.push(`${rel} (file missing)`)
        continue
      }
      const content = readFileSync(absPath, 'utf-8')
      if (!BRAND_PATTERNS.some((pat) => content.includes(pat))) {
        stale.push(`${rel} (no brand string present)`)
      }
    }
    expect(
      stale,
      'Stale Brand_Allowlist entries — remove these from docs/legacy-brand-allowlist.json:\n  ' +
        stale.join('\n  '),
    ).toEqual([])
  })
})
