import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import path from 'path'

describe('sanitizeInput canonical source', () => {
  const srcDir = path.resolve(__dirname, '../../src')
  const sourceFiles = collectSourceFiles(srcDir)

  it('has exactly ONE sanitizeInput function definition in apps/admissions/src/', () => {
    const definitions = sourceFiles.filter(({ content }) =>
      content.includes('export function sanitizeInput')
    )
    expect(definitions).toHaveLength(1)
    expect(definitions[0]?.filePath).toContain('lib/security.ts')
  })

  it('re-exports exist only via export { sanitizeInput } from', () => {
    const reExports = sourceFiles.filter(({ content }) =>
      content.includes('export { sanitizeInput }')
    )
    // Only wizardUtils.ts should re-export for backward compat
    for (const { content } of reExports) {
      expect(content).toContain('@/lib/security')
    }
  })
})

function collectSourceFiles(dir: string): Array<{ filePath: string; content: string }> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath)
    }

    if (!entry.isFile() || !/\.(ts|tsx)$/.test(entry.name)) {
      return []
    }

    return [{ filePath: entryPath, content: readFileSync(entryPath, 'utf-8') }]
  })
}
