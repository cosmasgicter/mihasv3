/**
 * Browser-OCR removal guard — the executable half of the task 7.5 bundle diff.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 7.5
 *               ("Remove unused frontend Tesseract assets and build preparation").
 * Requirements: R11.9 — "THE build SHALL remove unused browser OCR
 *               packages/assets".
 * Findings:     STU-07 — "Frontend Tesseract packages and an OCR asset
 *               preparation step add build/runtime weight without a frontend
 *               runtime import."
 *
 * A one-off deletion is reversible by the next `bun add`. This test is what makes
 * it stay deleted: it fails if the dependency, the asset-copy script, the copied
 * WASM payload, the chunk rule, or a source import comes back.
 *
 * Validates: Requirements R11.9
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ADMISSIONS_ROOT = path.resolve(__dirname, '../..')
const REPO_ROOT = path.resolve(ADMISSIONS_ROOT, '../..')

function read(relative: string): string {
  return fs.readFileSync(path.join(ADMISSIONS_ROOT, relative), 'utf-8')
}

/** Every source file under src/, recursively. */
function sourceFiles(dir: string, acc: string[] = []): string[] {
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

describe('browser OCR removal (task 7.5, R11.9)', () => {
  const pkg = JSON.parse(read('package.json')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    scripts?: Record<string, string>
  }

  it('declares no tesseract dependency', () => {
    const declared = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
    expect(declared.filter(name => name.includes('tesseract'))).toEqual([])
  })

  it('runs no OCR asset preparation step in any script', () => {
    const offenders = Object.entries(pkg.scripts ?? {})
      .filter(([, command]) => command.includes('prepare-ocr-assets') || command.includes('tesseract'))
      .map(([name]) => name)
    expect(offenders).toEqual([])
  })

  it('has no OCR asset preparation script on disk', () => {
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'scripts/prepare-ocr-assets.mjs'))).toBe(false)
  })

  it('ships no copied tesseract WASM payload in public/', () => {
    expect(fs.existsSync(path.join(ADMISSIONS_ROOT, 'public/ocr'))).toBe(false)
  })

  it('no longer needs a gitignore entry for generated OCR assets', () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf-8')
    expect(gitignore).not.toContain('apps/admissions/public/ocr')
  })

  it('defines no vendor-ocr chunk rule', () => {
    expect(read('vite.config.ts')).not.toContain("return 'vendor-ocr'")
  })

  it('imports no OCR engine anywhere in src/', () => {
    const offenders = sourceFiles(path.join(ADMISSIONS_ROOT, 'src'))
      .filter(file => {
        const contents = fs.readFileSync(file, 'utf-8')
        return (
          /from\s+['"]tesseract/.test(contents) ||
          /import\(['"]tesseract/.test(contents) ||
          /require\(['"]tesseract/.test(contents) ||
          contents.includes('createWorker(')
        )
      })
      .map(file => path.relative(ADMISSIONS_ROOT, file))
    expect(offenders).toEqual([])
  })

  it('keeps the entry-chunk guard markers so a reintroduction is still caught', () => {
    // The removal is the fix; the guard is the seatbelt. If someone re-adds a
    // browser OCR engine, `check-entry-chunk.ts` must still refuse to let it into
    // the entry bundle rather than silently shipping 29 MB of WASM.
    expect(read('scripts/check-entry-chunk.ts')).toContain('tesseract')
    expect(read('scripts/launchBundlePredicate.ts')).toContain('vendor-ocr')
  })
})
