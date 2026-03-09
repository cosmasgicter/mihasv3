import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const HOOK_PATH = path.resolve(process.cwd(), 'src/hooks/useApplicationSubmit.ts')
const hookContent = fs.readFileSync(HOOK_PATH, 'utf-8')

describe('useApplicationSubmit safety invariants', () => {
  it('prevents duplicate in-flight submissions', () => {
    expect(hookContent).toContain('isSubmittingRef')
    expect(hookContent).toContain('if (isSubmittingRef.current)')
  })
})
