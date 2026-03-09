import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  Skeleton as LoadingStateSkeleton,
  TableSkeleton as LoadingStateTableSkeleton,
  CardSkeleton as LoadingStateCardSkeleton,
} from '@/components/ui/LoadingState'
import {
  SkeletonCard as LegacySkeletonCard,
  SkeletonTable as LegacySkeletonTable,
  SkeletonForm as LegacySkeletonForm,
} from '@/components/ui/EnhancedLoadingSpinner'

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
  it('uses the shared pulse+muted style in LoadingState skeletons', () => {
    const single = renderToStaticMarkup(<LoadingStateSkeleton className="h-4 w-20" />)
    const table = renderToStaticMarkup(<LoadingStateTableSkeleton rows={2} columns={2} />)
    const card = renderToStaticMarkup(<LoadingStateCardSkeleton />)

    expect(single).toContain('bg-muted')
    expect(single).toContain('animate-pulse')
    expect(single).not.toContain('animate-shimmer')

    expect(table).toContain('bg-muted')
    expect(table).toContain('animate-pulse')
    expect(table).not.toContain('animate-shimmer')

    expect(card).toContain('bg-muted')
    expect(card).toContain('animate-pulse')
    expect(card).not.toContain('animate-shimmer')
  })

  it('does not use legacy smooth-skeleton classes in deprecated enhanced skeleton helpers', () => {
    const card = renderToStaticMarkup(<LegacySkeletonCard />)
    const table = renderToStaticMarkup(<LegacySkeletonTable />)
    const form = renderToStaticMarkup(<LegacySkeletonForm />)

    expect(card).not.toContain('smooth-skeleton')
    expect(table).not.toContain('smooth-skeleton')
    expect(form).not.toContain('smooth-skeleton')

    expect(card).toContain('bg-muted')
    expect(table).toContain('bg-muted')
    expect(form).toContain('bg-muted')
  })

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
