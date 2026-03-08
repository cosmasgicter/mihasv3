import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/admin/ReportTemplates.tsx')
const source = fs.readFileSync(FILE_PATH, 'utf-8')

describe('ReportTemplates legacy endpoint guard', () => {
  it('does not call removed /api/reports endpoints', () => {
    expect(source).not.toContain('/api/reports/templates')
    expect(source).not.toContain('/api/reports/schedule')
    expect(source).not.toContain('fetch(')
  })
})
