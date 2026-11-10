import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

describe('sidebar status block (task 28.1, R13.1)', () => {
  it('has no fixed "Workspace ready / Navigation synced" status in either variant', () => {
    const source = readFileSync(path.join(SRC, 'components/navigation/DesktopSidebar.tsx'), 'utf8')
    expect(source).not.toContain('Workspace ready')
    expect(source).not.toContain('Navigation synced')
  })
})
