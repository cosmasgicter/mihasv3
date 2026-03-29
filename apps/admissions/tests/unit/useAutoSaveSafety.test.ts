import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const HOOK_PATH = path.resolve(process.cwd(), 'src/hooks/useAutoSave.ts')
const hookContent = fs.readFileSync(HOOK_PATH, 'utf-8')

describe('useAutoSave safety invariants', () => {
  it('preserves the required 8-second autosave default interval', () => {
    expect(hookContent).toContain('interval = 8000')
  })

  it('guards against overlapping autosave requests', () => {
    expect(hookContent).toContain('inFlightSaveRef')
    expect(hookContent).toContain('if (inFlightSaveRef.current)')
  })

  it('does not clear drafts automatically on route changes', () => {
    expect(hookContent).not.toContain('}, [location.pathname, clearOnSubmit, clearSavedData])')
  })
})
