/**
 * @vitest-environment node
 *
 * Task 1 regression: the submit hook must send `Idempotency-Key` exactly once
 * and must NOT send `X-Idempotency-Key` (which broke CORS preflight).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const hookSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/hooks/useApplicationSubmit.ts'),
  'utf-8',
)

const serviceSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/services/applications.ts'),
  'utf-8',
)

describe('Idempotency header — CORS safety', () => {
  it('useApplicationSubmit sends Idempotency-Key header', () => {
    expect(hookSource).toContain("'Idempotency-Key'")
  })

  it('useApplicationSubmit does NOT send X-Idempotency-Key', () => {
    const lower = hookSource.toLowerCase()
    expect(lower).not.toContain('x-idempotency-key')
  })

  it('Idempotency-Key appears exactly once in the hook', () => {
    const matches = hookSource.match(/['"]Idempotency-Key['"]/g)
    expect(matches).toHaveLength(1)
  })

  it('applicationService.submit passes headers through without adding extra idempotency headers', () => {
    // The service should spread options.headers, not add its own X-Idempotency-Key
    const lower = serviceSource.toLowerCase()
    expect(lower).not.toContain('x-idempotency-key')
  })
})
