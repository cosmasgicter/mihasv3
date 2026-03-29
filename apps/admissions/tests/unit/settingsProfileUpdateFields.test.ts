import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Settings profile update field coverage', () => {
  it('keeps country and next-of-kin fields in frontend profile update allowlist', () => {
    const filePath = path.resolve(__dirname, '../../src/hooks/auth/useProfileQuery.ts')
    const source = fs.readFileSync(filePath, 'utf8')

    const match = source.match(/const\s+allowedFields\s*=\s*\[([\s\S]*?)\]/)
    expect(match).not.toBeNull()

    const fieldsBlock = match?.[1] ?? ''
    expect(fieldsBlock).toContain("'country'")
    expect(fieldsBlock).toContain("'next_of_kin_name'")
    expect(fieldsBlock).toContain("'next_of_kin_phone'")
  })
})
