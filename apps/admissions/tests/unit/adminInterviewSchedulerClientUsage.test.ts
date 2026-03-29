import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const FILE_PATH = path.resolve(process.cwd(), 'src/components/admin/InterviewScheduler.tsx')
const source = fs.readFileSync(FILE_PATH, 'utf-8')

describe('InterviewScheduler API usage', () => {
  it('delegates scheduling to applicationService instead of hard-coded action routes', () => {
    expect(source).toContain("import { applicationService } from '@/services/applications'")
    expect(source).toContain('applicationService.scheduleInterview(applicationId')
    expect(source).not.toContain('action=schedule-interview')
    expect(source).not.toContain("fetch('/api/applications")
  })
})
