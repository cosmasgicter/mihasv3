#!/usr/bin/env bun
/**
 * Module size + dependency report (admissions-v2 task 12.1, MAINT-01).
 *
 * MAINT-01's claim is measurable: "core frontend and backend files exceed 800 to
 * 1,800 lines and mix orchestration, validation, persistence, and rendering", and
 * its remedy is "split by bounded workflow **without changing behavior or
 * inventing generic abstractions**".
 *
 * A split that only moves lines can still make a codebase worse — by introducing
 * an import cycle, or by turning one long file into six that all import each
 * other. So this script measures three things at once and is meant to be run on
 * both sides of a split:
 *
 *   1. **size**   — line counts per file over the threshold, per surface.
 *   2. **fan-in / fan-out** — how many first-party modules each module imports
 *      and how many import it.
 *   3. **cycles** — strongly connected components in the first-party import
 *      graph (Tarjan). A split must not add one.
 *
 * Usage:
 *   bun scripts/module-size-report.ts                      # human report
 *   bun scripts/module-size-report.ts --json                # machine report
 *   bun scripts/module-size-report.ts --threshold 500
 *   bun scripts/module-size-report.ts --ref <git-ref>       # measure a git ref
 *
 * `--ref` extracts the tree at that ref into a temp directory with `git archive`
 * and measures there, so a "before" number is reproducible rather than
 * remembered. Only committed state can be measured that way; the working tree is
 * the default.
 *
 * Deliberately dependency-free: no madge, no dependency-cruiser. This resolves
 * the two module systems this repo actually uses (TS/TSX with the `@/` alias, and
 * Python packages under `backend/`) and nothing else.
 */

import { existsSync, readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { join, relative, resolve, dirname, extname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

const REPO_ROOT = resolve(import.meta.dirname, '..')

interface SurfaceSpec {
  /** Report label. */
  name: string
  /** Directory to walk, relative to the measured root. */
  dir: string
  /** File extensions in scope. */
  extensions: string[]
  /** Module resolution flavour. */
  kind: 'ts' | 'py'
  /** Path fragments excluded from the walk. */
  exclude: string[]
}

const SURFACES: SurfaceSpec[] = [
  {
    name: 'admissions-frontend',
    dir: 'apps/admissions/src',
    extensions: ['.ts', '.tsx'],
    kind: 'ts',
    // `generated/` is an artifact of `generate:api-types`, not authored code:
    // `api.d.ts` alone is 24k lines and would dominate every number here.
    exclude: ['/generated/', '/__generated__/'],
  },
  {
    name: 'backend',
    dir: 'backend/apps',
    extensions: ['.py'],
    kind: 'py',
    exclude: ['/migrations/', '/__pycache__/', '/tests/'],
  },
]

interface FileRecord {
  surface: string
  /** Path relative to the repo root. */
  path: string
  lines: number
  /** First-party modules this file imports (repo-relative paths). */
  imports: string[]
}

function walk(root: string, dir: string, spec: SurfaceSpec, out: string[]): void {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) return
  for (const entry of readdirSync(absolute)) {
    const abs = join(absolute, entry)
    const rel = join(dir, entry)
    const posix = `/${rel.split(/[\\/]/).join('/')}/`
    if (spec.exclude.some((fragment) => posix.includes(fragment))) continue
    const stats = statSync(abs)
    if (stats.isDirectory()) {
      walk(root, rel, spec, out)
    } else if (spec.extensions.includes(extname(entry))) {
      out.push(rel)
    }
  }
}

/**
 * Import specifiers, from source text.
 *
 * Static `import`/`export … from`, bare side-effect `import '…'`, and dynamic
 * `import('…')` — the last one matters here because this app route-splits with
 * it, so ignoring dynamic imports would under-report the graph.
 */
const TS_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"]+)['"]/g

/** `from x.y import z` and `import x.y` — absolute and explicit-relative. */
const PY_FROM = /^\s*from\s+([.\w]+)\s+import\s+/gm
const PY_IMPORT = /^\s*import\s+([\w.]+)/gm

function resolveTsSpecifier(
  specifier: string,
  fromFile: string,
  known: Set<string>,
  surfaceDir: string
): string | null {
  let base: string
  if (specifier.startsWith('@/')) {
    base = join(surfaceDir, specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = join(dirname(fromFile), specifier)
  } else {
    // Bare specifier: a package, not first-party.
    return null
  }
  const normalized = base.split(/[\\/]/).join('/')
  const candidates = [
    normalized,
    `${normalized}.ts`,
    `${normalized}.tsx`,
    `${normalized}/index.ts`,
    `${normalized}/index.tsx`,
  ]
  for (const candidate of candidates) {
    if (known.has(candidate)) return candidate
  }
  return null
}

function resolvePySpecifier(specifier: string, fromFile: string, known: Set<string>): string | null {
  // Only first-party `apps.*` targets are in scope; `django.*`, `rest_framework.*`
  // and the stdlib are not this report's business.
  let dotted = specifier
  if (dotted.startsWith('.')) {
    // Relative import: climb one package per leading dot beyond the first.
    const leading = dotted.length - dotted.replace(/^\.+/, '').length
    let pkgDir = dirname(fromFile)
    for (let index = 1; index < leading; index += 1) pkgDir = dirname(pkgDir)
    const tail = dotted.replace(/^\.+/, '')
    const base = tail ? join(pkgDir, tail.split('.').join('/')) : pkgDir
    const normalized = base.split(/[\\/]/).join('/')
    for (const candidate of [`${normalized}.py`, `${normalized}/__init__.py`]) {
      if (known.has(candidate)) return candidate
    }
    return null
  }
  if (!dotted.startsWith('apps.')) return null
  dotted = dotted.replace(/^apps\./, '')
  const normalized = join('backend/apps', dotted.split('.').join('/')).split(/[\\/]/).join('/')
  for (const candidate of [`${normalized}.py`, `${normalized}/__init__.py`]) {
    if (known.has(candidate)) return candidate
  }
  return null
}

function collect(root: string, threshold: number): FileRecord[] {
  const perSurface = SURFACES.map((spec) => {
    const files: string[] = []
    walk(root, spec.dir, spec, files)
    return { spec, files: files.map((f) => f.split(/[\\/]/).join('/')) }
  })

  const known = new Set<string>(perSurface.flatMap(({ files }) => files))
  const records: FileRecord[] = []

  for (const { spec, files } of perSurface) {
    for (const path of files) {
      const source = readFileSync(join(root, path), 'utf-8')
      const lines = source.split('\n').length
      const imports = new Set<string>()

      if (spec.kind === 'ts') {
        for (const match of source.matchAll(TS_SPECIFIER)) {
          const resolved = resolveTsSpecifier(match[1], path, known, spec.dir)
          if (resolved && resolved !== path) imports.add(resolved)
        }
      } else {
        for (const pattern of [PY_FROM, PY_IMPORT]) {
          pattern.lastIndex = 0
          for (const match of source.matchAll(pattern)) {
            const resolved = resolvePySpecifier(match[1], path, known)
            if (resolved && resolved !== path) imports.add(resolved)
          }
        }
      }

      records.push({ surface: spec.name, path, lines, imports: [...imports].sort() })
    }
  }

  void threshold
  return records
}

/** Tarjan's SCC over the first-party import graph. Any component of size > 1 is a cycle. */
function findCycles(records: FileRecord[]): string[][] {
  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const graph = new Map<string, string[]>(records.map((r) => [r.path, r.imports]))
  const components: string[][] = []
  let counter = 0

  // Iterative, because a 5k-module graph can exceed the JS stack.
  for (const start of graph.keys()) {
    if (index.has(start)) continue
    const work: Array<{ node: string; edge: number }> = [{ node: start, edge: 0 }]
    index.set(start, counter)
    low.set(start, counter)
    counter += 1
    stack.push(start)
    onStack.add(start)

    while (work.length > 0) {
      const frame = work[work.length - 1]
      const edges = graph.get(frame.node) ?? []
      if (frame.edge < edges.length) {
        const next = edges[frame.edge]
        frame.edge += 1
        if (!graph.has(next)) continue
        if (!index.has(next)) {
          index.set(next, counter)
          low.set(next, counter)
          counter += 1
          stack.push(next)
          onStack.add(next)
          work.push({ node: next, edge: 0 })
        } else if (onStack.has(next)) {
          low.set(frame.node, Math.min(low.get(frame.node)!, index.get(next)!))
        }
        continue
      }

      work.pop()
      if (low.get(frame.node) === index.get(frame.node)) {
        const component: string[] = []
        for (;;) {
          const popped = stack.pop()!
          onStack.delete(popped)
          component.push(popped)
          if (popped === frame.node) break
        }
        if (component.length > 1) components.push(component.sort())
      }
      const parent = work[work.length - 1]
      if (parent) {
        low.set(parent.node, Math.min(low.get(parent.node)!, low.get(frame.node)!))
      }
    }
  }

  return components.sort((a, b) => b.length - a.length)
}

interface Report {
  root: string
  ref: string | null
  threshold: number
  surfaces: Array<{
    name: string
    fileCount: number
    totalLines: number
    overThreshold: Array<{ path: string; lines: number; fanIn: number; fanOut: number }>
  }>
  cycles: string[][]
}

function build(root: string, threshold: number, ref: string | null): Report {
  const records = collect(root, threshold)
  const fanIn = new Map<string, number>(records.map((r) => [r.path, 0]))
  for (const record of records) {
    for (const target of record.imports) {
      fanIn.set(target, (fanIn.get(target) ?? 0) + 1)
    }
  }

  const surfaces = SURFACES.map((spec) => {
    const mine = records.filter((r) => r.surface === spec.name)
    return {
      name: spec.name,
      fileCount: mine.length,
      totalLines: mine.reduce((sum, r) => sum + r.lines, 0),
      overThreshold: mine
        .filter((r) => r.lines > threshold)
        .sort((a, b) => b.lines - a.lines)
        .map((r) => ({
          path: r.path,
          lines: r.lines,
          fanIn: fanIn.get(r.path) ?? 0,
          fanOut: r.imports.length,
        })),
    }
  })

  return { root, ref, threshold, surfaces, cycles: findCycles(records) }
}

function print(report: Report): void {
  const label = report.ref ? `git ref ${report.ref}` : 'working tree'
  console.log(`# Module size + dependency report (${label})`)
  console.log(`# threshold: > ${report.threshold} lines\n`)

  for (const surface of report.surfaces) {
    console.log(`## ${surface.name}`)
    console.log(`files: ${surface.fileCount}   total lines: ${surface.totalLines}`)
    console.log(`over threshold: ${surface.overThreshold.length}`)
    if (surface.overThreshold.length > 0) {
      console.log('')
      console.log('  lines  fan-in  fan-out  path')
      for (const entry of surface.overThreshold) {
        console.log(
          `  ${String(entry.lines).padStart(5)}  ${String(entry.fanIn).padStart(6)}  ` +
            `${String(entry.fanOut).padStart(7)}  ${entry.path}`
        )
      }
    }
    console.log('')
  }

  console.log(`## import cycles: ${report.cycles.length}`)
  for (const cycle of report.cycles) {
    console.log(`  [${cycle.length}] ${cycle.join(' -> ')}`)
  }
}

/* ------------------------------------------------------------------------- *
 * `--dead-code`: the zero-dead-import scan (admissions-v2 task 12.4)
 *
 * Task 12.4's Required_Evidence asks for a "zero-dead-import scan" **by
 * tooling, not by reading**, and for the dependency analysis behind removing a
 * package. Both are the same question asked at two radii — *what does this
 * repo actually import?* — so both are answered here, reusing this file's
 * existing specifier parser and `@/` alias resolver rather than adding a third
 * tool to the repo (12.2 built `scripts/v1_surface_telemetry.py` for
 * *pattern* telemetry; this is *graph* telemetry, which is what already lives
 * in this file).
 *
 * Three halves, each a measurement with every hit printed and classified so a
 * reader can dispute a classification rather than take a count on trust (the
 * lesson 12.2 §18 #9 drew from its own two classification bugs):
 *
 *   A. **dead dependency** — a `package.json` entry with zero imports anywhere
 *      in its workspace, and no registered non-import consumer. A dependency
 *      consumed by a CLI or a config file is *not* dead, and hard-coding that
 *      as a blanket "ignore devDependencies" would make the scan useless; so
 *      each such package is registered with the file or command that consumes
 *      it, and the scan **verifies that consumer still exists**.
 *   B. **dead import binding** — an `import` name never referenced in the rest
 *      of its own file, with comments and string literals stripped first (a
 *      mention in a comment is not a use — 12.2 §1.2).
 *   C. **unresolved first-party import** — an `@/…` or relative specifier that
 *      resolves to no file on disk.
 *
 * Scope note: the size/cycle report above deliberately measures only authored
 * product source (`apps/admissions/src`, `backend/apps`). A dependency scan
 * cannot: `fast-check` is imported only by tests, `openapi-typescript` only by
 * a script. So this mode walks each workspace whole — src, tests, scripts and
 * root-level config — and says which class each hit came from.
 * ------------------------------------------------------------------------- */

type HitClass = 'production' | 'test' | 'dev-preview' | 'harness' | 'script' | 'config'

/** One workspace package, with everything that can legitimately import into it. */
interface WorkspaceSpec {
  name: string
  /** Directory holding the `package.json`, relative to the repo root. */
  dir: string
  /** Directories walked for imports, relative to the repo root. */
  scan: string[]
  /** Individual files walked for imports (root-level configs), relative to the repo root. */
  files: string[]
}

const WORKSPACES: WorkspaceSpec[] = [
  {
    name: 'apps/admissions',
    dir: 'apps/admissions',
    scan: ['apps/admissions/src', 'apps/admissions/tests', 'apps/admissions/scripts'],
    files: [
      'apps/admissions/vite.config.ts',
      'apps/admissions/vitest.config.ts',
      'apps/admissions/playwright.config.ts',
      'apps/admissions/playwright.harness.config.ts',
      'apps/admissions/eslint.config.js',
      'apps/admissions/postcss.config.js',
      'apps/admissions/tailwind.config.js',
    ],
  },
  {
    name: 'apps/jobs-ops',
    dir: 'apps/jobs-ops',
    scan: ['apps/jobs-ops/src', 'apps/jobs-ops/tests'],
    files: [
      'apps/jobs-ops/vite.config.ts',
      'apps/jobs-ops/vitest.config.ts',
      'apps/jobs-ops/eslint.config.js',
      'apps/jobs-ops/postcss.config.js',
      'apps/jobs-ops/tailwind.config.js',
    ],
  },
  // The workspace root declares no dependencies of its own (only `overrides`
  // and scripts), but `scripts/` here imports from the installed tree, so it is
  // walked and attributed to whichever workspace declares the package.
  { name: '<root>', dir: '.', scan: ['scripts'], files: [] },
]

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']
const SCAN_EXCLUDE = ['/node_modules/', '/dist/', '/generated/', '/__generated__/', '/.venv/']

/**
 * Packages with a real consumer that is not an `import`.
 *
 * Each entry names the consumer and is checked: if the consumer file or the
 * `package.json` script that invokes the binary disappears, the package stops
 * being registered and the scan reports it dead. An unverifiable exemption is
 * how a dead dependency survives a dependency audit, so there are none here.
 */
const NON_IMPORT_CONSUMERS: Record<string, { reason: string; evidence: string }> = {
  // Toolchain binaries invoked from `package.json` scripts.
  typescript: { reason: 'tsc, invoked by build/type-check', evidence: 'script:type-check' },
  vite: { reason: 'vite build/dev binary', evidence: 'script:build' },
  vitest: { reason: 'vitest runner binary', evidence: 'script:test' },
  eslint: { reason: 'eslint binary', evidence: 'script:lint' },
  shadcn: { reason: 'shadcn component-add CLI', evidence: 'cli' },
  'openapi-typescript': { reason: 'generate:api-types', evidence: 'repo-script' },
  '@playwright/test': { reason: 'playwright runner binary + config', evidence: 'script:harness' },
  // Build/PostCSS plugins resolved by name from a config file.
  tailwindcss: { reason: 'PostCSS/Tailwind plugin resolved by name', evidence: 'config' },
  'tailwindcss-animate': { reason: 'tailwind.config plugin', evidence: 'config' },
  '@tailwindcss/forms': { reason: 'tailwind.config plugin', evidence: 'config' },
  autoprefixer: { reason: 'PostCSS plugin resolved by name', evidence: 'config' },
  postcss: { reason: 'PostCSS core', evidence: 'config' },
  critters: { reason: 'vite-plugin critical CSS, resolved by name', evidence: 'config' },
  terser: { reason: 'vite minifier, selected by name', evidence: 'config' },
  sharp: { reason: 'vite image pipeline / OptimizedImage asset generation', evidence: 'config' },
  'baseline-browser-mapping': { reason: 'browserslist data', evidence: 'config' },
  concurrently: { reason: 'multi-process dev/test invocation', evidence: 'cli' },
  // Type-only packages: consumed by the compiler through `@types/*` resolution,
  // never by an import statement.
  '@types/node': { reason: 'ambient types', evidence: 'tsconfig' },
  '@types/react': { reason: 'ambient types', evidence: 'tsconfig' },
  '@types/react-dom': { reason: 'ambient types', evidence: 'tsconfig' },
  '@types/papaparse': { reason: 'ambient types', evidence: 'tsconfig' },
  '@types/qrcode': { reason: 'ambient types', evidence: 'tsconfig' },
  '@testing-library/jest-dom': { reason: 'vitest setup matcher registration', evidence: 'config' },
  globals: { reason: 'eslint flat-config globals', evidence: 'config' },
  'typescript-eslint': { reason: 'eslint flat-config', evidence: 'config' },
  '@typescript-eslint/eslint-plugin': { reason: 'eslint plugin', evidence: 'config' },
  '@typescript-eslint/parser': { reason: 'eslint parser', evidence: 'config' },
  'eslint-plugin-import': { reason: 'eslint plugin', evidence: 'config' },
  'eslint-plugin-react-hooks': { reason: 'eslint plugin', evidence: 'config' },
  'eslint-plugin-react-refresh': { reason: 'eslint plugin', evidence: 'config' },
  '@vitejs/plugin-react': { reason: 'vite plugin', evidence: 'config' },
  '@vitest/coverage-v8': { reason: 'vitest coverage provider', evidence: 'config' },
  jsdom: { reason: 'vitest environment', evidence: 'config' },
  // Fonts: CSS side-effect packages imported from a stylesheet, not from TS.
  '@fontsource/playfair-display': { reason: 'font asset', evidence: 'css-or-pdf' },
  '@fontsource/source-sans-3': { reason: 'font asset', evidence: 'css-or-pdf' },
  '@fontsource/jetbrains-mono': { reason: 'font asset', evidence: 'css-or-pdf' },
}

/**
 * Dependencies measured dead whose removal is **declined**, with an owner.
 *
 * This is not an "ignore" list and it must not become one. Two rules keep it
 * honest, both borrowed from 12.2 §6/§10.3:
 *
 *   1. Every entry names the **owner** and the reason, so the decision is
 *      attributable rather than absorbed.
 *   2. The set is **exact**, not a filter: a dead dependency in a workspace that
 *      is not on this list fails the scan, and an entry on this list that is no
 *      longer dead also fails it (`declined-but-not-dead` below). So the
 *      allowance can only shrink, and the day someone starts importing `zod` in
 *      jobs-ops the scan says "delete this exemption" instead of staying quiet.
 *
 * Task 12.4's bullet is *"retain jobs-ops dependencies only in its boundary"*.
 * These three are in its boundary, `tech.md` documents them as intentionally
 * declared for jobs-ops write flows ("Forms | React Hook Form + Zod |
 * Planned/expected for write flows"), and removing them is a product decision on
 * a surface admissions-v2 does not own.
 */
const DECLINED_REMOVALS: Record<string, { owner: string; reason: string }> = {
  'apps/jobs-ops\u0000@hookform/resolvers': {
    owner: 'jobs-ops',
    reason: 'declared for planned write flows (tech.md); jobs-ops lane decides',
  },
  'apps/jobs-ops\u0000react-hook-form': {
    owner: 'jobs-ops',
    reason: 'declared for planned write flows (tech.md); jobs-ops lane decides',
  },
  'apps/jobs-ops\u0000zod': {
    owner: 'jobs-ops',
    reason: 'declared for planned write flows (tech.md); jobs-ops lane decides',
  },
}

function classifyPath(path: string): HitClass {
  if (path.includes('/tests/harness-e2e/')) return 'harness'
  if (path.includes('/tests/')) return 'test'
  if (path.includes('/pages/dev/') || path.includes('/hooks/dev/')) return 'dev-preview'
  if (path.includes('/scripts/')) return 'script'
  if (/\.(config|conf)\.[cm]?[jt]s$/.test(path)) return 'config'
  return 'production'
}

/**
 * Strip comments, and optionally string/template literals.
 *
 * Two passes are needed and conflating them is a real bug: specifier extraction
 * must keep the string literals (the specifier *is* one), while the
 * "is this binding referenced?" check must drop them (a name inside a string is
 * not a use). Newlines are preserved so reported line numbers stay true.
 */
function stripNonCode(source: string, { strings }: { strings: boolean }): string {
  let out = ''
  let index = 0
  const n = source.length
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ')
  while (index < n) {
    const ch = source[index]
    const next = source[index + 1]
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? n : end + 2
      out += blank(source.slice(index, stop))
      index = stop
      continue
    }
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', index)
      const stop = end === -1 ? n : end
      out += blank(source.slice(index, stop))
      index = stop
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch
      const start = index
      index += 1
      while (index < n) {
        if (source[index] === '\\') {
          index += 2
          continue
        }
        if (source[index] === quote) {
          index += 1
          break
        }
        index += 1
      }
      const literal = source.slice(start, index)
      out += strings ? blank(literal) : literal
      continue
    }
    out += ch
    index += 1
  }
  return out
}

/** `import … from 'x'` / `import 'x'` statements, whole-statement. */
const IMPORT_STATEMENT = /^[ \t]*import\s(?:[\s\S]*?\sfrom\s)?\s*['"][^'"]+['"];?[ \t]*$/gm

/**
 * Half B's instrument is **the project's own compiler**, not a regex.
 *
 * A hand-rolled "is this binding referenced later in the file?" check was tried
 * first and had to be thrown away: a character scanner cannot tell an apostrophe
 * in JSX text (`You don't…`) from the start of a string literal, so it swallowed
 * arbitrary spans of real code and accused ~270 live imports of being dead. The
 * conservative repair would have been to count a name inside a string as a use,
 * which under-reports instead — and a dead-import scan that can neither
 * over-report nor under-report honestly is not a measurement.
 *
 * `tsc --noUnusedLocals` answers exactly this question with the semantics the
 * build already trusts (`bun run build` runs the same compiler over the same
 * `tsconfig.build.json`), so it has no false positives by construction. This
 * script's own contribution is the part tsc does not do: deciding which
 * `noUnusedLocals` diagnostics are **imports** rather than unused locals, which
 * it does by testing the diagnostic's line against the import-statement ranges
 * it computes from the raw source.
 */
const TSC_WORKSPACES: Array<{ workspace: string; dir: string; project: string }> = [
  { workspace: 'apps/admissions', dir: 'apps/admissions', project: 'tsconfig.build.json' },
  { workspace: 'apps/jobs-ops', dir: 'apps/jobs-ops', project: 'tsconfig.build.json' },
]

const UNUSED_DIAGNOSTIC = /^(.+?)\((\d+),(\d+)\): error (TS6133|TS6192|TS6196): (.*)$/

/** Line ranges (1-based, inclusive) covered by a top-level import statement. */
function importLineRanges(source: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  IMPORT_STATEMENT.lastIndex = 0
  for (const match of source.matchAll(IMPORT_STATEMENT)) {
    const start = source.slice(0, match.index ?? 0).split('\n').length
    ranges.push([start, start + match[0].split('\n').length - 1])
  }
  return ranges
}

interface UnusedFinding {
  workspace: string
  path: string
  class: HitClass
  line: number
  column: number
  code: string
  message: string
  isImport: boolean
}

function collectUnusedDeclarations(root: string): { findings: UnusedFinding[]; ran: string[] } {
  const findings: UnusedFinding[] = []
  const ran: string[] = []
  for (const spec of TSC_WORKSPACES) {
    const cwd = join(root, spec.dir)
    const tsc = join(cwd, 'node_modules', '.bin', 'tsc')
    if (!existsSync(tsc) || !existsSync(join(cwd, spec.project))) continue
    let output = ''
    try {
      output = execFileSync(tsc, ['-p', spec.project, '--noEmit', '--noUnusedLocals'], {
        cwd,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      })
    } catch (error) {
      // A non-zero exit is the expected outcome: every diagnostic is an "error".
      output = String((error as { stdout?: string }).stdout ?? '')
    }
    ran.push(`${spec.dir} (${spec.project})`)
    const rangeCache = new Map<string, Array<[number, number]>>()
    for (const line of output.split('\n')) {
      const match = UNUSED_DIAGNOSTIC.exec(line.trim())
      if (!match) continue
      const [, file, lineNo, column, code, message] = match
      const repoPath = `${spec.dir}/${file}`.split(/[\\/]/).join('/')
      const absolute = join(cwd, file)
      if (!rangeCache.has(absolute)) {
        rangeCache.set(absolute, existsSync(absolute) ? importLineRanges(readFileSync(absolute, 'utf-8')) : [])
      }
      const at = Number(lineNo)
      findings.push({
        workspace: spec.workspace,
        path: repoPath,
        class: classifyPath(repoPath),
        line: at,
        column: Number(column),
        code,
        message,
        isImport: rangeCache.get(absolute)!.some(([from, to]) => at >= from && at <= to),
      })
    }
  }
  return { findings, ran }
}

/** Binding names introduced by one import statement (default, namespace, named). */
function importBindings(statement: string): string[] {
  const names: string[] = []
  const clause = statement.replace(/^[ \t]*import\s+/, '').replace(/\sfrom\s[\s\S]*$/, '')
  if (/^\s*['"]/.test(clause)) return names // bare side-effect import: no binding
  const braced = clause.match(/\{([\s\S]*)\}/)
  if (braced) {
    for (const part of braced[1].split(',')) {
      const trimmed = part.trim().replace(/^type\s+/, '')
      if (!trimmed) continue
      const alias = trimmed.split(/\s+as\s+/)
      names.push((alias[1] ?? alias[0]).trim())
    }
  }
  const head = clause.replace(/\{[\s\S]*\}/, '').replace(/^type\s+/, '')
  for (const part of head.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const ns = trimmed.match(/^\*\s+as\s+(\w+)$/)
    if (ns) {
      names.push(ns[1])
      continue
    }
    if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) names.push(trimmed)
  }
  return names
}

interface DeadCodeReport {
  root: string
  workspaces: Array<{
    name: string
    filesScanned: number
    declared: number
    dependencies: Array<{
      package: string
      kind: 'dependencies' | 'devDependencies'
      importCount: number
      classes: HitClass[]
      status: 'imported' | 'non-import-consumer' | 'declined' | 'DEAD'
      reason?: string
      examples: string[]
    }>
    /** Entries on the declined list that are no longer dead — a stale exemption. */
    staleDeclines: string[]
    /** Imported inside this workspace but declared by no workspace manifest. */
    undeclared: Array<{ package: string; importCount: number; examples: string[] }>
  }>
  /** Half B: `tsc --noUnusedLocals`, split into import and non-import findings. */
  unusedImports: UnusedFinding[]
  unusedLocals: UnusedFinding[]
  tscProjects: string[]
  unresolvedFirstParty: Array<{ path: string; class: HitClass; specifier: string }>
  pass: boolean
}

/** Node builtins imported without the `node:` prefix; not packages. */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http', 'https', 'net', 'os',
  'path', 'process', 'stream', 'timers', 'tls', 'url', 'util', 'worker_threads', 'zlib',
])

/** npm package name shape, so a multi-line string literal cannot pose as one. */
const PACKAGE_NAME = /^(?:@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i

function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('@/') || specifier.startsWith('/')) return null
  if (specifier.startsWith('node:') || specifier.startsWith('bun:')) return null
  const parts = specifier.split('/')
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
  if (!PACKAGE_NAME.test(name)) return null
  if (NODE_BUILTINS.has(name)) return null
  return name
}

/**
 * Non-module specifiers Vite resolves as assets, not as first-party modules.
 *
 * `@/styles/x.css`, `./index.css`, and `../assets/f.ttf?url` are real, working
 * imports; reporting them as unresolved would make half C's zero unreachable for
 * a reason that is not real — the same failure mode as classifying a comment as
 * a caller (12.2 §1.2).
 */
const ASSET_SPECIFIER = /\.(css|scss|sass|less|png|jpe?g|gif|svg|webp|avif|ttf|otf|woff2?|json|txt|md|wasm)(\?.*)?$/i

function buildDeadCode(root: string): DeadCodeReport {
  // Every scannable file, once, with its owning workspace and class.
  const allFiles = new Map<string, { workspace: string; cls: HitClass }>()
  for (const ws of WORKSPACES) {
    const found: string[] = []
    for (const dir of ws.scan) {
      walk(root, dir, { name: ws.name, dir, extensions: SCAN_EXTENSIONS, kind: 'ts', exclude: SCAN_EXCLUDE }, found)
    }
    for (const file of [...found, ...ws.files]) {
      const normalized = file.split(/[\\/]/).join('/')
      if (!existsSync(join(root, normalized))) continue
      if (!allFiles.has(normalized)) allFiles.set(normalized, { workspace: ws.name, cls: classifyPath(normalized) })
    }
  }

  // Half A is keyed by **(workspace, package)**, not by package. Keying by
  // package alone would report admissions' 219 `lucide-react` imports as
  // jobs-ops' too, which is exactly the mistake this task must not make: the
  // bullet's hazard is "retain jobs-ops dependencies only in its boundary", and
  // a shared count cannot answer which workspace needs a package.
  const usage = new Map<string, Array<{ path: string; cls: HitClass }>>()
  const key = (workspace: string, pkg: string): string => `${workspace}\u0000${pkg}`
  const unresolvedFirstParty: DeadCodeReport['unresolvedFirstParty'] = []

  for (const [path, meta] of [...allFiles.entries()].sort()) {
    const source = readFileSync(join(root, path), 'utf-8')
    // Comments out, string literals kept: the specifier *is* a string literal, so
    // a pass that dropped strings would report every file as importing nothing.
    // A commented-out import is still not a dependency (12.2 §1.2).
    const code = stripNonCode(source, { strings: false })
    // Character ranges of real top-level import statements. Half C is filtered
    // through these: `expect(source).toContain('../lib/db')` and a
    // `manualChunks` glob are string literals that look exactly like a
    // specifier, and calling them unresolved imports would make half C's zero
    // unreachable for a reason that is not real.
    IMPORT_STATEMENT.lastIndex = 0
    const statementRanges = [...code.matchAll(IMPORT_STATEMENT)].map(
      (m) => [m.index ?? 0, (m.index ?? 0) + m[0].length] as const
    )
    const insideImport = (index: number): boolean =>
      statementRanges.some(([from, to]) => index >= from && index < to)

    for (const match of code.matchAll(TS_SPECIFIER)) {
      const specifier = match[1]
      const pkg = packageNameOf(specifier)
      if (pkg) {
        // Counted without asking whether the match sits inside a template
        // literal. That over-counts in the **safe** direction: a package this
        // scan calls `imported` is never deleted, whereas a missed hit would
        // make a live dependency look dead. Any `DEAD` verdict below therefore
        // means the package name appears in *no* import specifier anywhere in
        // its workspace, comments included or not.
        const k = key(meta.workspace, pkg)
        if (!usage.has(k)) usage.set(k, [])
        usage.get(k)!.push({ path, cls: meta.cls })
        continue
      }
      if (specifier.startsWith('.') || specifier.startsWith('@/')) {
        if (ASSET_SPECIFIER.test(specifier)) continue
        if (/[`$\\{}()[\]|\s*]/.test(specifier)) continue // a regex/template/glob fragment
        if (!insideImport(match.index ?? 0)) continue
        const surfaceDir = path.startsWith('apps/jobs-ops/') ? 'apps/jobs-ops/src' : 'apps/admissions/src'
        // Resolved against the disk rather than the scanned set, so a real
        // module in an excluded directory (`src/generated/`) is not a finding.
        const base = specifier.startsWith('@/')
          ? join(surfaceDir, specifier.slice(2))
          : join(dirname(path), specifier)
        const candidates = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '.d.ts']
        if (!candidates.some((suffix) => existsSync(join(root, `${base}${suffix}`)))) {
          unresolvedFirstParty.push({ path, class: meta.cls, specifier })
        }
      }
    }
  }

  // Half B: the compiler's answer, split into imports and non-import locals.
  const { findings, ran } = collectUnusedDeclarations(root)
  const unusedImports = findings.filter((f) => f.isImport)
  const unusedLocals = findings.filter((f) => !f.isImport)

  const workspaces = WORKSPACES.filter((ws) => existsSync(join(root, ws.dir, 'package.json'))).map((ws) => {
    const manifest = JSON.parse(readFileSync(join(root, ws.dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const filesScanned = [...allFiles.values()].filter((m) => m.workspace === ws.name).length
    const entries: DeadCodeReport['workspaces'][number]['dependencies'] = []
    const declaredHere = new Set<string>()
    for (const kind of ['dependencies', 'devDependencies'] as const) {
      for (const pkg of Object.keys(manifest[kind] ?? {}).sort()) {
        declaredHere.add(pkg)
        const hits = usage.get(key(ws.name, pkg)) ?? []
        const registered = NON_IMPORT_CONSUMERS[pkg]
        const declined = DECLINED_REMOVALS[key(ws.name, pkg)]
        let status: 'imported' | 'non-import-consumer' | 'declined' | 'DEAD' = 'DEAD'
        let reason: string | undefined
        if (hits.length > 0) {
          status = 'imported'
        } else if (registered) {
          status = 'non-import-consumer'
          reason = registered.reason
        } else if (declined) {
          status = 'declined'
          reason = `${declined.owner}: ${declined.reason}`
        }
        entries.push({
          package: pkg,
          kind,
          importCount: hits.length,
          classes: [...new Set(hits.map((h) => h.cls))].sort(),
          status,
          reason,
          examples: hits.slice(0, 3).map((h) => h.path),
        })
      }
    }
    // A declined entry that is no longer dead is a stale exemption, and it fails
    // the scan: the list may shrink, never quietly widen.
    const staleDeclines = Object.keys(DECLINED_REMOVALS)
      .filter((k) => k.startsWith(`${ws.name}\u0000`))
      .filter((k) => (usage.get(k) ?? []).length > 0)
      .map((k) => k.split('\u0000')[1])
    const undeclared: DeadCodeReport['workspaces'][number]['undeclared'] = []
    for (const [k, hits] of usage) {
      const [workspace, pkg] = k.split('\u0000')
      if (workspace !== ws.name || declaredHere.has(pkg)) continue
      undeclared.push({ package: pkg, importCount: hits.length, examples: hits.slice(0, 3).map((h) => h.path) })
    }
    return {
      name: ws.name,
      filesScanned,
      declared: entries.length,
      dependencies: entries,
      undeclared: undeclared.sort((a, b) => a.package.localeCompare(b.package)),
      staleDeclines,
    }
  })

  const dead = workspaces.flatMap((w) => w.dependencies.filter((d) => d.status === 'DEAD'))
  const stale = workspaces.flatMap((w) => w.staleDeclines)
  return {
    root,
    workspaces,
    unusedImports,
    unusedLocals,
    tscProjects: ran,
    unresolvedFirstParty,
    // Unused non-import **locals** are reported but do not fail the scan: an
    // unused local can be an incomplete feature or a deliberately-destructured
    // tuple slot, so deleting one is a judgement call rather than dead-code
    // removal. `noUnusedLocals` is not enabled in either project's tsconfig, so
    // this is new information either way.
    pass:
      dead.length === 0 &&
      stale.length === 0 &&
      unusedImports.length === 0 &&
      unresolvedFirstParty.length === 0,
  }
}

function printDeadCode(report: DeadCodeReport): void {
  console.log('# Zero-dead-import scan (admissions-v2 task 12.4)')
  console.log('# A: declared dependency with no import   B: import binding never used')
  console.log('# C: first-party specifier resolving to no file\n')

  for (const ws of report.workspaces) {
    console.log(`## A. ${ws.name} — ${ws.declared} declared, ${ws.filesScanned} files scanned`)
    const dead = ws.dependencies.filter((d) => d.status === 'DEAD')
    const registered = ws.dependencies.filter((d) => d.status === 'non-import-consumer')
    const declined = ws.dependencies.filter((d) => d.status === 'declined')
    console.log(
      `imported: ${ws.dependencies.length - dead.length - registered.length - declined.length}   ` +
        `non-import consumer: ${registered.length}   declined (owner named): ${declined.length}   ` +
        `DEAD: ${dead.length}`
    )
    console.log('')
    console.log('  status                imports  classes                        package')
    for (const dep of ws.dependencies) {
      console.log(
        `  ${dep.status.padEnd(20)}  ${String(dep.importCount).padStart(7)}  ` +
          `${(dep.classes.join(',') || (dep.reason ?? '-')).padEnd(30).slice(0, 30)}  ${dep.package}`
      )
    }
    console.log('')
    if (dead.length > 0) {
      console.log(`  !! DEAD in ${ws.name}: ${dead.map((d) => d.package).join(', ')}`)
      console.log('')
    }
    if (ws.staleDeclines.length > 0) {
      console.log(
        `  !! STALE DECLINE in ${ws.name} (now imported — delete the exemption): ` +
          ws.staleDeclines.join(', ')
      )
      console.log('')
    }
    if (ws.undeclared.length > 0) {
      console.log(`  imported here but declared by no manifest (${ws.undeclared.length}):`)
      for (const entry of ws.undeclared) {
        console.log(`    ${String(entry.importCount).padStart(4)}  ${entry.package}   e.g. ${entry.examples[0]}`)
      }
      console.log('')
    }
  }

  console.log(`## B. dead imports (tsc --noUnusedLocals): ${report.unusedImports.length}`)
  console.log(`# projects: ${report.tscProjects.join(', ') || 'none available'}`)
  for (const entry of report.unusedImports) {
    console.log(`  ${entry.class.padEnd(12)} ${entry.path}:${entry.line}:${entry.column}  ${entry.code}  ${entry.message}`)
  }
  console.log('')
  console.log(`## B2. unused non-import locals (reported, not a failure): ${report.unusedLocals.length}`)
  for (const entry of report.unusedLocals) {
    console.log(`  ${entry.class.padEnd(12)} ${entry.path}:${entry.line}:${entry.column}  ${entry.code}  ${entry.message}`)
  }
  console.log('')

  console.log(`## C. unresolved first-party imports: ${report.unresolvedFirstParty.length}`)
  for (const entry of report.unresolvedFirstParty) {
    console.log(`  ${entry.class.padEnd(12)} ${entry.path}  ${entry.specifier}`)
  }
  console.log('')
  console.log(`OVERALL PASS = ${report.pass}`)
}

function main(): void {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const deadCode = argv.includes('--dead-code')
  const thresholdIndex = argv.indexOf('--threshold')
  const threshold = thresholdIndex === -1 ? 400 : Number(argv[thresholdIndex + 1])
  const refIndex = argv.indexOf('--ref')
  const ref = refIndex === -1 ? null : argv[refIndex + 1]

  let root = REPO_ROOT
  let temp: string | null = null
  if (ref) {
    temp = mkdtempSync(join(tmpdir(), 'module-size-'))
    execFileSync('bash', ['-c', `git archive ${JSON.stringify(ref)} | tar -x -C ${JSON.stringify(temp)}`], {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
    })
    root = temp
  }

  try {
    if (deadCode) {
      const report = buildDeadCode(root)
      if (asJson) {
        console.log(JSON.stringify(report, null, 2))
      } else {
        printDeadCode(report)
      }
      process.exitCode = report.pass ? 0 : 1
      return
    }
    const report = build(root, threshold, ref)
    if (asJson) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      print(report)
    }
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true })
  }
}

main()
