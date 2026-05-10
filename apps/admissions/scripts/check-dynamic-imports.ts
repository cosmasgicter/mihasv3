#!/usr/bin/env bun
/**
 * Dead-import check — fails if any `await import('pkg')` references a
 * package that isn't in package.json (dependencies or devDependencies).
 *
 * Motivation: during the PDF migration we removed `jspdf` from deps without
 * realizing two admin-export files still called `await import('jspdf')`.
 * TypeScript didn't catch it because the argument is a string literal.
 * Vite can catch it at build time, but only if the build actually runs
 * (env-var validation sometimes fails earlier). This check is faster and
 * catches the specific failure mode directly.
 *
 * Usage:
 *   bun scripts/check-dynamic-imports.ts
 *
 * Exits non-zero on failure. Intended for CI.
 */

import fg from 'fast-glob'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '..')

type PackageJson = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

async function readInstalledPackages(): Promise<Set<string>> {
  const raw = await fs.readFile(path.join(ROOT, 'package.json'), 'utf8')
  const pkg = JSON.parse(raw) as PackageJson
  const names = new Set<string>()
  for (const key of Object.keys(pkg.dependencies ?? {})) names.add(key)
  for (const key of Object.keys(pkg.devDependencies ?? {})) names.add(key)
  // Node built-ins used as dynamic imports are also fine
  for (const builtin of [
    'node:fs',
    'node:fs/promises',
    'node:path',
    'node:url',
    'node:crypto',
    'node:buffer',
    'node:stream',
    'node:util',
  ]) {
    names.add(builtin)
  }
  return names
}

/**
 * Extract the first string-literal argument from `await import('pkg')` or
 * `import('pkg')`. Multi-line + template-literal forms with no interpolation
 * are also handled.
 */
function extractDynamicImportSpecifiers(source: string): string[] {
  const specifiers: string[] = []
  // Match: import('...') or import("...") or import(`...`)
  // Allow optional whitespace and newlines between keyword and parenthesis.
  const re = /(?:^|[^\w$])import\s*\(\s*(['"`])((?:\\\1|(?!\1).)*?)\1\s*\)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) {
    specifiers.push(match[2]!)
  }
  return specifiers
}

/**
 * Reduce an import specifier to its package name.
 *   "@foo/bar"          → "@foo/bar"
 *   "@foo/bar/sub"      → "@foo/bar"
 *   "foo"               → "foo"
 *   "foo/bar"           → "foo"
 *   "./local"           → null (relative, not a package)
 *   "/abs"              → null
 */
function packageNameOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    if (parts.length < 2) return null
    return `${parts[0]}/${parts[1]}`
  }
  return specifier.split('/')[0] ?? null
}

async function main() {
  const installed = await readInstalledPackages()
  const sources = await fg(['src/**/*.{ts,tsx}', 'scripts/**/*.{ts,tsx}'], {
    cwd: ROOT,
    absolute: true,
    ignore: [
      '**/*.d.ts',
      // This script itself contains example strings like `import('pkg')`
      // that would self-match the regex. Skip it.
      'scripts/check-dynamic-imports.ts',
    ],
  })

  const problems: Array<{ file: string; specifier: string; packageName: string }> = []

  for (const file of sources) {
    const source = await fs.readFile(file, 'utf8')
    const specifiers = extractDynamicImportSpecifiers(source)
    for (const specifier of specifiers) {
      // Template-literal specifiers with ${...} interpolation cannot be
      // statically resolved. They're almost always intentional (e.g.
      // computed chunk names) and skipping them is safe.
      if (specifier.includes('${')) continue
      const pkg = packageNameOf(specifier)
      if (!pkg) continue // relative / absolute path — safe
      if (pkg.startsWith('@/')) continue // Vite alias — handled separately
      if (!installed.has(pkg)) {
        problems.push({
          file: path.relative(ROOT, file),
          specifier,
          packageName: pkg,
        })
      }
    }
  }

  if (problems.length === 0) {
    console.log(`✓ All dynamic imports resolve to installed dependencies.`)
    console.log(`  Scanned ${sources.length} source files.`)
    process.exit(0)
  }

  console.error(`✗ Dead dynamic imports found — these packages are referenced via`)
  console.error(`  \`import('...')\` but are not listed in package.json:`)
  console.error()
  for (const problem of problems) {
    console.error(`  ${problem.file}`)
    console.error(`    → import('${problem.specifier}')  (package: ${problem.packageName})`)
  }
  console.error()
  console.error(`  Either install the missing package or update the source to use`)
  console.error(`  a different specifier.`)
  process.exit(1)
}

void main().catch((err) => {
  console.error('check-dynamic-imports failed:', err)
  process.exit(1)
})
