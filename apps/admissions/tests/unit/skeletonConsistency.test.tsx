// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const SRC_ROOT = path.resolve(__dirname, '../../src')

function collectSourceFiles(dir: string, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      collectSourceFiles(fullPath, acc)
      continue
    }
    if (/\.(ts|tsx)$/.test(fullPath)) {
      acc.push(fullPath)
    }
  }
  return acc
}

describe('Skeleton consistency', () => {
  it('prevents legacy skeleton imports/classes from reappearing in source', () => {
    const files = collectSourceFiles(SRC_ROOT)
    const offenders: string[] = []

    for (const filePath of files) {
      const rel = path.relative(SRC_ROOT, filePath)
      const source = readFileSync(filePath, 'utf8')

      // Deprecated raw class from legacy skeleton implementation.
      if (source.includes('smooth-skeleton')) {
        offenders.push(`${rel}:smooth-skeleton`)
      }

      // Prevent pulling skeleton pieces from deprecated LoadingState surface.
      const loadingStateSkeletonImport = /import\s*\{[^}]*\b(TableSkeleton|CardSkeleton|Skeleton)\b[^}]*\}\s*from\s*['"]@\/components\/ui\/LoadingState['"]/.test(source)
      if (loadingStateSkeletonImport) {
        offenders.push(`${rel}:loading-state-skeleton-import`)
      }

      // Prevent direct skeleton imports from deprecated EnhancedLoadingSpinner surface.
      const enhancedSkeletonImport = /import\s*\{[^}]*\b(SkeletonCard|SkeletonTable|SkeletonForm)\b[^}]*\}\s*from\s*['"]@\/components\/ui\/EnhancedLoadingSpinner['"]/.test(source)
      if (enhancedSkeletonImport) {
        offenders.push(`${rel}:enhanced-loading-spinner-skeleton-import`)
      }
    }

    expect(offenders).toEqual([])
  })
})
