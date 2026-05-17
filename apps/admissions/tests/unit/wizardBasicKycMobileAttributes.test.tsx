import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * Validates that BasicKycStep has the correct mobile-friendly HTML attributes
 * on key input fields by inspecting the source code directly.
 */
describe('BasicKycStep mobile attributes', () => {
  const filePath = path.resolve(
    __dirname,
    '../../src/pages/student/applicationWizard/steps/BasicKycStep.tsx'
  )
  const source = readFileSync(filePath, 'utf-8')

  it('date_of_birth field has type="date" and autoComplete="bday"', () => {
    // Find the AnimatedInput block containing date_of_birth
    const block = source.match(
      /<AnimatedInput[\s\S]*?date_of_birth[\s\S]*?\/>/
    )
    expect(block).not.toBeNull()
    const text = block![0]
    expect(text).toContain('type="date"')
    expect(text).toContain('autoComplete="bday"')
  })

  it('next_of_kin_name field has autoComplete="off"', () => {
    const block = source.match(
      /<AnimatedInput[\s\S]*?next_of_kin_name[\s\S]*?\/>/
    )
    expect(block).not.toBeNull()
    expect(block![0]).toContain('autoComplete="off"')
  })

  it('next_of_kin_phone field has type="tel", inputMode="tel", autoComplete="off"', () => {
    const block = source.match(
      /<AnimatedInput[\s\S]*?next_of_kin_phone[\s\S]*?\/>/
    )
    expect(block).not.toBeNull()
    const text = block![0]
    expect(text).toContain('type="tel"')
    expect(text).toContain('inputMode="tel"')
    expect(text).toContain('autoComplete="off"')
  })
})
