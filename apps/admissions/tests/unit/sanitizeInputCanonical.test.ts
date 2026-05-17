import { describe, it, expect } from 'vitest'
import { execSync } from 'child_process'
import path from 'path'

describe('sanitizeInput canonical source', () => {
  const srcDir = path.resolve(__dirname, '../../src')

  it('has exactly ONE sanitizeInput function definition in apps/admissions/src/', () => {
    // grep for function definitions (export function sanitizeInput or function sanitizeInput)
    // Exclude re-exports (export { sanitizeInput } from ...) and imports
    const result = execSync(
      `grep -r --include="*.ts" --include="*.tsx" "export function sanitizeInput" "${srcDir}" || true`,
      { encoding: 'utf-8' }
    )
    const definitions = result
      .split('\n')
      .filter(line => line.trim().length > 0)
    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toContain('lib/security.ts')
  })

  it('re-exports exist only via export { sanitizeInput } from', () => {
    const result = execSync(
      `grep -r --include="*.ts" --include="*.tsx" "export { sanitizeInput }" "${srcDir}" || true`,
      { encoding: 'utf-8' }
    )
    const reExports = result
      .split('\n')
      .filter(line => line.trim().length > 0)
    // Only wizardUtils.ts should re-export for backward compat
    for (const line of reExports) {
      expect(line).toContain('@/lib/security')
    }
  })
})
