/**
 * Dead-dependency and dev-preview-payload removal guard — the executable half of
 * the task 12.4 lock/bundle diff.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 12.4
 *               ("Remove admissions AI/OCR/browser and other dead
 *               dependencies/assets").
 * Requirements: **R11.9** — "THE build SHALL remove unused browser OCR
 *               packages/assets and admissions AI UI, endpoints, settings,
 *               caches, throttles, circuit breakers, prompts, **and imports**";
 *               **R16.5** — remove AI framing and redundant surfaces from
 *               primary workflows.
 * Findings:     **STU-06**, **STU-07**, **MAINT-02**.
 *
 * Task 7.5 built the same guard for browser OCR and wrote the reason down: "a
 * one-off deletion is reversible by the next `bun add`. This test is what makes
 * it stay deleted." This is that test for the six dependencies 12.4 removed and
 * for the dev-preview PDF payload it took out of the production bundle.
 *
 * The measurement behind every assertion here is
 * `bun scripts/module-size-report.ts --dead-code`, recorded in
 * `docs/v2-evidence/12.4/raw/dead-code-scan-{before,after}.txt`.
 *
 * Validates: Requirements R11.9, R16.5
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(ADMISSIONS_ROOT, '../..')

function read(relative: string): string {
  return fs.readFileSync(path.join(ADMISSIONS_ROOT, relative), 'utf-8')
}

/** Every scannable source file under a directory, recursively. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      sourceFiles(full, acc)
    } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

/**
 * The six packages task 12.4 removed, each with what the scan measured.
 *
 * `date-fns` is the one worth reading twice: `src/lib/dateFormat.ts` carries the
 * comment "Extended helpers (added to replace direct date-fns imports)", so the
 * replacement had already happened and only the declaration was left behind.
 */
const REMOVED_PACKAGES = [
  'recharts',
  'date-fns',
  'papaparse',
  '@types/papaparse',
  '@radix-ui/react-toast',
  '@radix-ui/react-navigation-menu',
] as const

describe('dead dependency removal (task 12.4, R11.9)', () => {
  const pkg = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })

  it.each(REMOVED_PACKAGES)('declares no %s dependency', (name) => {
    expect(declared).not.toContain(name)
  })

  it('carries none of them in the workspace lockfile either', () => {
    // A dependency that leaves package.json but stays in the lockfile is not
    // removed: `bun install` still resolves, downloads and hoists it, and the
    // next import of it succeeds silently.
    const lock = fs.readFileSync(path.join(REPO_ROOT, 'bun.lock'), 'utf-8')
    for (const name of REMOVED_PACKAGES) {
      expect(lock, `${name} is still in bun.lock`).not.toContain(`"${name}"`)
    }
    // recharts' transitive tail, which is the reason the lock diff is 38 entries
    // for 6 direct removals: a chart library nothing imported was pulling a whole
    // redux stack and eleven d3 packages into the install tree.
    for (const transitive of ['"@reduxjs/toolkit"', '"react-redux"', '"victory-vendor"', '"d3-scale"']) {
      expect(lock, `${transitive} should have gone with recharts`).not.toContain(transitive)
    }
  })

  it('imports none of them anywhere in src/, tests/ or scripts/', () => {
    const files = [
      ...sourceFiles(path.join(ADMISSIONS_ROOT, 'src')),
      ...sourceFiles(path.join(ADMISSIONS_ROOT, 'tests')),
      ...sourceFiles(path.join(ADMISSIONS_ROOT, 'scripts')),
    ]
    const offenders: string[] = []
    for (const file of files) {
      const contents = fs.readFileSync(file, 'utf-8')
      for (const name of REMOVED_PACKAGES) {
        if (name.startsWith('@types/')) continue // never imported by name
        const pattern = new RegExp(`(?:from|import\\()\\s*['"]${name.replace(/[/@]/g, '\\$&')}`)
        if (pattern.test(contents)) offenders.push(`${path.relative(ADMISSIONS_ROOT, file)} → ${name}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('defines no vendor-charts chunk rule for a chart engine that is gone', () => {
    expect(read('vite.config.ts')).not.toContain("return 'vendor-charts'")
  })

  it('keeps the bundle guard markers so a reintroduction is still caught', () => {
    // 7.5's precedent, verbatim: the removal is the fix, the guard is the
    // seatbelt. `launchVerificationBundle.property.test.ts` and
    // `launchBundleGuard.test.ts` (other specs') pin these markers, and a chart
    // engine re-added tomorrow must still be refused entry to the entry chunk.
    expect(read('scripts/check-entry-chunk.ts')).toContain('recharts')
    expect(read('scripts/launchBundlePredicate.ts')).toContain('vendor-charts')
  })
})

describe('dev-only PDF preview payload (task 12.4, R11.9 / R16.5)', () => {
  const app = read('src/App.tsx')

  it('guards the lazy import expression, not only the route element', () => {
    // The distinction is the whole finding. With the guard only on `<Route>`,
    // Vite replaces `import.meta.env.DEV` with `false`, Rollup drops the two
    // unreachable routes — and the module-scope `lazy(() => import(…))` calls
    // survive, so the dynamic imports are still emitted. The production build
    // shipped `AcceptanceLetterPreview-*.js`, `DocumentPreview-*.js` and the
    // 1.43 MB `vendor-react-pdf-*.js` engine they pull. Measured, not assumed:
    // docs/v2-evidence/12.4/raw/dist-name-diff.txt.
    for (const preview of ['@/pages/dev/AcceptanceLetterPreview', '@/pages/dev/DocumentPreview']) {
      const guarded = new RegExp(
        `import\\.meta\\.env\\.DEV[\\s\\S]{0,80}?lazy\\(\\(\\)\\s*=>\\s*import\\('${preview.replace(/[/@]/g, '\\$&')}'\\)\\)`
      )
      expect(app, `${preview} must be behind the DEV guard at the import expression`).toMatch(guarded)
    }
  })

  it('keeps the dev previews themselves — this is a bundling fix, not a deletion', () => {
    // The steering rule allows `@/lib/pdf` exactly here: "Frontend `@/lib/pdf`
    // code is legacy/preview-only unless a specific non-official preview use
    // case is documented." The previews are that documented case and they still
    // work in `bun run dev`; what changed is that students no longer download
    // them.
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'src/pages/dev/AcceptanceLetterPreview.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'src/pages/dev/DocumentPreview.tsx'))).toBe(true)
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'src/lib/pdf/index.ts'))).toBe(true)
  })

  it('no production module reaches for @/lib/pdf', () => {
    // R7.1/R7.3/R7.4 and the steering rule: official documents come from the
    // backend pipeline through `@/services/officialDocuments`, never a client
    // render. `@/lib/pdf` may be imported only by a dev preview, its own
    // internals, the sample renderer script, or a test.
    const allowedPrefixes = ['src/pages/dev/', 'src/lib/pdf/', 'src/lib/slipService.ts']
    const offenders = sourceFiles(path.join(ADMISSIONS_ROOT, 'src'))
      .map((file) => path.relative(ADMISSIONS_ROOT, file))
      .filter((relative) => !allowedPrefixes.some((prefix) => relative.startsWith(prefix)))
      .filter((relative) => {
        const contents = read(relative)
        return /(?:from|import\()\s*['"]@\/lib\/pdf/.test(contents)
      })
    expect(offenders).toEqual([])
  })
})

describe('one mobile bottom navigation (task 12.4, R16.3 / R16.5)', () => {
  it('has no second, unrendered mobile bottom-nav implementation', () => {
    // `src/components/navigation/MobileBottomNav.tsx` had **zero** importers.
    // `AppLayout` renders `components/ui/BottomNavigation` with
    // capability-filtered items, so the deleted file was a full second copy of
    // the mobile bar — including its own admin "More" menu and its own tenant
    // item — that no user could reach. Worse, three test docstrings cited it as
    // the *mobile* witness for desktop/mobile capability parity (R13.4), so a
    // surface nobody rendered was standing in as evidence about the surface that
    // ships.
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'src/components/navigation/MobileBottomNav.tsx'))).toBe(false)
  })

  it('routes every nav surface through the one capability helper', () => {
    // What the deleted duplicate was supposed to demonstrate, asserted against
    // the surfaces that exist: both derive the capability-variant tenant entry
    // from `tenantNav`, so R13.4's parity is structural rather than coincidental.
    for (const surface of [
      'src/components/navigation/DesktopSidebar.tsx',
      'src/components/navigation/AppLayout.tsx',
    ]) {
      expect(read(surface), `${surface} must use the shared tenant nav helper`).toMatch(
        /useTenantNavItem\(\)/
      )
    }
    expect(read('src/components/navigation/AppLayout.tsx')).toContain('BottomNavigation')
  })
})
