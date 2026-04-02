/**
 * Property-based tests for Dead Code Removal
 * Feature: tech-debt-remediation
 *
 * Property 4: Dead files don't exist post-remediation
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

/** The 4 dead files that must not exist after remediation */
const DEAD_FILE_PATHS = [
  'services/documentExtraction.ts',
  'utils/lazy-imports.ts',
  'utils/animationOptimization.ts',
  'utils/performance.ts',
] as const

describe('Property 4: Dead files do not exist post-remediation', () => {
  /**
   * After remediation, the 4 identified dead code files SHALL NOT exist
   * on disk. We use fast-check to draw from the set of dead file paths
   * and assert none resolve to an existing file.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
   */

  const deadFileArb = fc.constantFrom(...DEAD_FILE_PATHS)

  it('none of the dead code files exist on disk', () => {
    fc.assert(
      fc.property(deadFileArb, (relativePath) => {
        const fullPath = path.join(SRC_ROOT, relativePath)
        expect(fs.existsSync(fullPath)).toBe(false)
      }),
      { numRuns: 50 },
    )
  })

  it('no other module imports the dead files', () => {
    fc.assert(
      fc.property(deadFileArb, (relativePath) => {
        // Strip extension to get the import path stem
        const stem = relativePath.replace(/\.ts$/, '')

        // Scan all .ts/.tsx files under src for imports referencing the dead module
        const allSourceFiles = collectSourceFiles(SRC_ROOT)
        for (const file of allSourceFiles) {
          const content = fs.readFileSync(file, 'utf-8')
          // Match import/require statements that reference the dead module path
          const importPattern = new RegExp(
            `(?:import|require)\\s*\\(?\\s*['"].*${escapeRegex(stem)}['"]`,
          )
          expect(content).not.toMatch(importPattern)
        }
      }),
      { numRuns: 4 }, // one run per dead file is sufficient
    )
  })
})

/** Recursively collect all .ts and .tsx files under a directory */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = []
  if (!fs.existsSync(dir)) return results

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory() && entry.name !== 'node_modules') {
      results.push(...collectSourceFiles(fullPath))
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
      results.push(fullPath)
    }
  }
  return results
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
