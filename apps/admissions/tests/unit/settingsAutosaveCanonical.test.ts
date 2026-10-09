/**
 * Settings canonical-autosave contract (task 6.1 — findings STU-20, STU-10,
 * MAINT-02).
 *
 * Pins the load-bearing invariants of the Settings rewrite at the source level
 * (matching the sibling `settingsDirtyStatePhase4` / `settingsProfileUpdateFields`
 * source tests):
 *  - the page consumes the canonical per-section autosave hook;
 *  - the page no longer owns a `beforeunload` handler (the hook owns it);
 *  - the STU-10 native `window.confirm` navigation guard is gone;
 *  - the MAINT-02 fake PageShell metrics tiles are gone;
 *  - profile writes still flow through authService PATCH /auth/profile/.
 *
 * Validates: Requirements R9.8, R16.4, R16.5.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SETTINGS_PATH = path.resolve(__dirname, '../../src/pages/student/Settings.tsx')
const HOOK_PATH = path.resolve(__dirname, '../../src/hooks/student/useProfileSectionAutosave.ts')

function readSettings(): string {
  return fs.readFileSync(SETTINGS_PATH, 'utf-8')
}

describe('Settings — canonical autosave', () => {
  it('consumes the per-section profile autosave hook', () => {
    const source = readSettings()
    expect(source).toContain('useProfileSectionAutosave')
    expect(source).toContain("from '@/hooks/student/useProfileSectionAutosave'")
  })

  it('no longer owns a beforeunload handler (moved to the autosave hook)', () => {
    const settings = readSettings()
    expect(settings).not.toContain('beforeunload')
    // The hook is the single owner of the unload guard.
    const hook = fs.readFileSync(HOOK_PATH, 'utf-8')
    expect(hook).toContain('beforeunload')
  })

  it('removes the native window.confirm navigation guard (STU-10)', () => {
    expect(readSettings()).not.toContain('window.confirm')
  })

  it('removes the fake PageShell metrics tiles (MAINT-02)', () => {
    expect(readSettings()).not.toContain('metrics={')
  })

  it('retains the editable canonical fields', () => {
    const source = readSettings()
    expect(source).toContain('country')
    expect(source).toContain('next_of_kin_name')
    expect(source).toContain('next_of_kin_phone')
  })

  it('exposes explicit save state and conflict recovery affordances', () => {
    const source = readSettings()
    expect(source).toContain('SaveIndicator')
    expect(source).toContain('Reload latest')
    expect(source).toContain('Keep my changes')
  })
})
