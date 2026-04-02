/**
 * Property-based tests for Error Boundary Reporting
 * Feature: tech-debt-remediation
 *
 * Property 1: Error boundary calls reportError, not fetch('/log-error')
 *
 * **Validates: Requirements 1.1, 1.2, 1.3**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SOURCE_FILE = path.resolve(
  __dirname,
  '../../src/components/ui/EnhancedErrorHandling.tsx',
)

const sourceCode = fs.readFileSync(SOURCE_FILE, 'utf-8')

describe('Property 1: Error boundary calls reportError, not fetch(\'/log-error\')', () => {
  /**
   * The Error_Boundary source SHALL NOT contain any reference to the
   * `/log-error` endpoint. After remediation, all error reporting goes
   * through the centralized `reportError()` pipeline.
   *
   * We use fast-check to generate arbitrary substrings of `/log-error`
   * variants and confirm none appear in the source.
   *
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */

  /** Arbitrary for possible /log-error path variants */
  const logErrorVariantArb = fc.constantFrom(
    '/log-error',
    "'/log-error'",
    '"/log-error"',
    '`/log-error`',
    'fetch(\'/log-error\')',
    'fetch("/log-error")',
    'fetch(`/log-error`)',
  )

  it('source file does not contain any /log-error reference', () => {
    fc.assert(
      fc.property(logErrorVariantArb, (variant) => {
        expect(sourceCode).not.toContain(variant)
      }),
      { numRuns: 50 },
    )
  })

  it('source file imports reportError from errorReporter', () => {
    fc.assert(
      fc.property(fc.constant(sourceCode), (src) => {
        // Must import reportError
        expect(src).toContain('reportError')
        // Must import from the errorReporter module
        expect(src).toMatch(/import\s+.*reportError.*from\s+['"]@\/lib\/errorReporter['"]/)
      }),
      { numRuns: 1 },
    )
  })

  it('componentDidCatch calls reportError, not fetch', () => {
    fc.assert(
      fc.property(fc.constant(sourceCode), (src) => {
        // Extract the componentDidCatch method body (rough heuristic)
        const catchIdx = src.indexOf('componentDidCatch')
        expect(catchIdx).toBeGreaterThan(-1)

        // Look at the region after componentDidCatch up to the next method
        const regionAfterCatch = src.slice(catchIdx, catchIdx + 600)

        // Must call reportError within componentDidCatch
        expect(regionAfterCatch).toContain('reportError')

        // Must NOT call fetch within componentDidCatch
        expect(regionAfterCatch).not.toMatch(/fetch\s*\(/)
      }),
      { numRuns: 1 },
    )
  })
})
