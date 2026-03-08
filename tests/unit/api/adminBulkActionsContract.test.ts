import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const apiPath = path.resolve(process.cwd(), 'api-src/admin.ts')
const validationPath = path.resolve(process.cwd(), 'lib/validation/admin.ts')

const apiSource = fs.readFileSync(apiPath, 'utf-8')
const validationSource = fs.readFileSync(validationPath, 'utf-8')

describe('admin bulk actions contract', () => {
  it('registers bulk action routes in admin handler', () => {
    expect(apiSource).toContain("case 'bulk-email'")
    expect(apiSource).toContain("case 'bulk-status'")
    expect(apiSource).toContain("case 'export-users'")
  })

  it('enforces zod validation for bulk mutation payloads', () => {
    expect(apiSource).toContain('validateBody(bulkEmailBodySchema')
    expect(apiSource).toContain('validateBody(bulkStatusBodySchema')
    expect(validationSource).toContain('export const bulkEmailBodySchema')
    expect(validationSource).toContain('export const bulkStatusBodySchema')
  })
})
