import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/admin/UserImport.tsx')
const source = fs.readFileSync(FILE_PATH, 'utf-8')

describe('UserImport endpoint consistency', () => {
  it('uses canonical admin register action via apiClient', () => {
    expect(source).toContain("apiClient.request<{ user?: unknown; message?: string }>('/admin?action=register'")
    expect(source).not.toContain("fetch('/api/admin?action=create-user'")
  })
})
