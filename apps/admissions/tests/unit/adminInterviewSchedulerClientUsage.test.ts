import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/admin/InterviewScheduler.tsx')
const source = fs.readFileSync(FILE_PATH, 'utf-8')

describe('InterviewScheduler API client usage', () => {
  it('uses canonical apiClient request instead of direct fetch', () => {
    expect(source).toContain("import { apiClient } from '@/services/client'")
    expect(source).toContain("apiClient.request('/applications?action=schedule-interview'")
    expect(source).not.toContain("fetch('/api/applications?action=schedule-interview'")
  })
})
