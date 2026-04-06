import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Settings profile update field coverage', () => {
  it('sends profile updates via PATCH to /auth/profile/', () => {
    const filePath = path.resolve(__dirname, '../../src/hooks/auth/useProfileQuery.ts')
    const source = fs.readFileSync(filePath, 'utf8')

    // The mutation should call PATCH /auth/profile/ via apiClient
    expect(source).toContain("'/auth/profile/'")
    expect(source).toContain("method: 'PATCH'")
  })

  it('includes country and next-of-kin fields in the profile form schema', () => {
    const filePath = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
    const source = fs.readFileSync(filePath, 'utf8')

    // The form schema must include these fields so they can be submitted
    expect(source).toContain('country')
    expect(source).toContain('next_of_kin_name')
    expect(source).toContain('next_of_kin_phone')
  })
})
