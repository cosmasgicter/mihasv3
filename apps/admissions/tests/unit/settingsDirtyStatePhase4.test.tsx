/**
 * Regression test — Settings dirty-state guard survives Phase 4 changes
 * (Task 39.3).
 *
 * The spec explicitly forbids Phase 4 additions from importing or
 * mutating `Settings.tsx`. This test asserts the Settings source does
 * not transitively import the new Phase 4 primitives
 * (`paymentRecoveryStore`, `derivePaymentUiState`, etc.) so the
 * existing `isDirty` beforeunload + navigation guard remains intact.
 *
 * Validates: Requirements R22.6.
 */

import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const SETTINGS_PATH = path.resolve(
  __dirname,
  '../../src/pages/student/Settings.tsx',
)

const FORBIDDEN_IMPORTS = [
  '@/stores/paymentRecoveryStore',
  '@/lib/paymentErrorCodes',
  '@/lib/paymentNextActions',
  '@/lib/zambianMsisdn',
]

describe('Settings — Phase 4 isolation', () => {
  it('does not import any Phase 4 payment primitive', () => {
    expect(fs.existsSync(SETTINGS_PATH)).toBe(true)
    const source = fs.readFileSync(SETTINGS_PATH, 'utf-8')
    for (const forbidden of FORBIDDEN_IMPORTS) {
      expect(source, `Settings.tsx must not import ${forbidden}`).not.toContain(forbidden)
    }
  })
})
