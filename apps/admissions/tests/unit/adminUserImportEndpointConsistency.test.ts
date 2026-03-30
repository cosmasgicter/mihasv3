import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/admin/UserImport.tsx')
const source = fs.readFileSync(FILE_PATH, 'utf-8')

describe('UserImport endpoint consistency', () => {
  it('uses canonical admin users endpoint via apiClient', () => {
    expect(source).toContain("apiClient.request<{ id?: string; message?: string }>('/admin/users/'")
    expect(source).not.toContain("?action=register")
    expect(source).not.toContain("?action=create-user")
  })
})
