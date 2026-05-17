/**
 * Drift-guard test: asserts the frontend ERROR_CODE_MESSAGES keys are a
 * superset of the canonical backend error catalog.
 *
 * Reads `backend/apps/common/error_codes.py` at test time, parses the
 * dict keys, and compares against the TS map + fixture.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, it, expect } from 'vitest'
import { ERROR_CODE_MESSAGES } from '@/lib/errorMessages'
import { BACKEND_ERROR_CODES, BACKEND_ERROR_CODE_KEYS } from './__fixtures__/errorCodesBackendMirror'

function parseBackendErrorCodes(): string[] {
  const backendRoot = resolve(__dirname, '../../../../backend')
  
  // Parse the main error_codes.py for directly-defined codes
  const mainPath = resolve(backendRoot, 'apps/common/error_codes.py')
  const mainContent = readFileSync(mainPath, 'utf-8')
  const keys: string[] = []
  const keyPattern = /^\s*"([A-Z][A-Z0-9_]+)":\s*\{/gm
  let match: RegExpExecArray | null
  while ((match = keyPattern.exec(mainContent)) !== null) {
    keys.push(match[1])
  }

  // Parse payment_error_codes.py (merged via import)
  const paymentPath = resolve(backendRoot, 'apps/documents/payment_error_codes.py')
  const paymentContent = readFileSync(paymentPath, 'utf-8')
  const paymentKeyPattern = /^\s+"([A-Z][A-Z0-9_]+)":\s*PaymentErrorCode\(/gm
  while ((match = paymentKeyPattern.exec(paymentContent)) !== null) {
    keys.push(match[1])
  }

  return [...new Set(keys)].sort()
}

describe('Error Codes Drift Guard', () => {
  const backendKeys = parseBackendErrorCodes()

  it('backend error_codes.py is parseable and non-empty', () => {
    expect(backendKeys.length).toBeGreaterThan(30)
  })

  it('fixture BACKEND_ERROR_CODE_KEYS matches parsed backend keys', () => {
    const missing = backendKeys.filter(k => !BACKEND_ERROR_CODE_KEYS.includes(k))
    const extra = BACKEND_ERROR_CODE_KEYS.filter(k => !backendKeys.includes(k))
    expect(missing).toEqual([])
    expect(extra).toEqual([])
  })

  it('frontend ERROR_CODE_MESSAGES covers all canonical backend codes', () => {
    const frontendKeys = Object.keys(ERROR_CODE_MESSAGES)
    const missingInFrontend = backendKeys.filter(k => !frontendKeys.includes(k))
    expect(missingInFrontend).toEqual([])
  })

  it('fixture BACKEND_ERROR_CODES has correct category for each code', () => {
    const categories = new Set(['payment', 'application', 'auth', 'document', 'validation', 'common'])
    for (const [code, entry] of Object.entries(BACKEND_ERROR_CODES)) {
      expect(categories.has(entry.category)).toBe(true)
    }
  })
})
