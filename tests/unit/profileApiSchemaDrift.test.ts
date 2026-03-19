import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Auth profile API schema alignment', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../api-src/auth.ts'), 'utf8')

  it('allows country updates in handleProfile PATCH allowlist', () => {
    const allowlistMatch = source.match(/const\s+allowedFields\s*=\s*\[([\s\S]*?)\]\s+as\s+const/)
    expect(allowlistMatch).not.toBeNull()
    expect(allowlistMatch?.[1] ?? '').toContain("'country'")
  })

  it('returns country in handleProfile GET and PATCH SQL payloads', () => {
    expect(source).toContain('SELECT id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality')
    expect(source).toContain('RETURNING id, full_name, first_name, last_name, email, phone, role, date_of_birth, sex, residence_town, country, nationality')
  })
})
