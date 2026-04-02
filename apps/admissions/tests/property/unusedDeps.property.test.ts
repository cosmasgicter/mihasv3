/**
 * Property-based tests for Unused Dependencies Removal
 * Feature: tech-debt-remediation
 *
 * Property 5 (frontend): Unused deps removed from package.json
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import * as fs from 'node:fs'
import * as path from 'node:path'

const PKG_PATH = path.resolve(__dirname, '../../package.json')

/** The 8 npm packages that must not appear in package.json after remediation */
const REMOVED_PACKAGES = [
  'exceljs',
  'xlsx',
  'form-data',
  'dotenv',
  'react-window',
  '@types/react-window',
  '@tsparticles/react',
  '@tsparticles/slim',
] as const

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('Property 5 (frontend): Unused deps removed from package.json', () => {
  const pkgContent = JSON.parse(fs.readFileSync(PKG_PATH, 'utf-8'))
  const allDeps = {
    ...pkgContent.dependencies,
    ...pkgContent.devDependencies,
  }

  const removedPkgArb = fc.constantFrom(...REMOVED_PACKAGES)

  /**
   * After remediation, none of the 8 removed packages SHALL appear
   * in either dependencies or devDependencies of package.json.
   *
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
   */
  it('none of the removed packages appear in package.json dependencies', () => {
    fc.assert(
      fc.property(removedPkgArb, (pkgName) => {
        expect(allDeps).not.toHaveProperty(pkgName)
      }),
      { numRuns: 50 },
    )
  })

  /**
   * Verify the raw package.json text does not contain any of the
   * removed package names as dependency keys, guarding against
   * non-standard fields or peerDependencies.
   *
   * **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 9.6**
   */
  it('removed package names do not appear as dependency keys in raw package.json', () => {
    const rawContent = fs.readFileSync(PKG_PATH, 'utf-8')

    fc.assert(
      fc.property(removedPkgArb, (pkgName) => {
        // Match "packageName": pattern (a JSON key)
        const keyPattern = new RegExp(`"${escapeRegex(pkgName)}"\\s*:`)
        expect(rawContent).not.toMatch(keyPattern)
      }),
      { numRuns: 50 },
    )
  })
})
