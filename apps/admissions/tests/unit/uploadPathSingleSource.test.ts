/**
 * Single upload path guard (student-journey-repair task 3.7, design R2-d, clause 2.10).
 *
 * `requiredDocumentsService.upload` -> `apiClient.upload` is the only upload
 * transport. Four older stacks remain in the tree, dead at HEAD 4a6c4ef; their
 * deletion is owned by Spec B S2 (DEC-1). Until then this scan freezes them: it
 * names every offending file and line, so a new reference to a dead path fails
 * here instead of quietly reviving a second timeout/retry/validation stack.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = path.resolve(__dirname, '../../src')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'generated') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full)
  }
  return out
}

const files = walk(SRC).map((file) => ({
  rel: path.relative(SRC, file).split(path.sep).join('/'),
  lines: fs.readFileSync(file, 'utf8').split('\n'),
}))

function find(pattern: RegExp): Array<{ rel: string; line: number }> {
  const hits: Array<{ rel: string; line: number }> = []
  for (const file of files) {
    file.lines.forEach((text, index) => {
      if (pattern.test(text)) hits.push({ rel: file.rel, line: index + 1 })
    })
  }
  return hits
}

const report = (hits: Array<{ rel: string; line: number }>) =>
  hits.map((hit) => `${hit.rel}:${hit.line}`)

// Dead at HEAD 4a6c4ef; deletion owned by Spec B S2 (DEC-1).
const FROZEN_UPLOAD_LITERAL_MODULES = new Set([
  'services/requiredDocuments.ts', // the live path
  'services/documents.ts',
  'lib/storage.ts',
  'lib/applicationSlipStorage.ts',
])

// Dead at HEAD 4a6c4ef; deletion owned by Spec B S2 (DEC-1).
const FROZEN_DEAD_REFERENCES: Record<string, string[]> = {
  'lib/storage.ts': ['uploadApplicationFile'],
  'lib/slipService.ts': ['applicationSlipStorage'],
  'pages/student/applicationWizard/hooks/useApplicationFileUploads.ts': ['uploadApplicationFile'],
  'pages/student/applicationWizard/hooks/wizard/index.ts': ['useWizardFileUploads'],
  'pages/student/applicationWizard/hooks/wizard/useWizardFileUploads.ts': ['useWizardFileUploads'],
}
const DEAD_SYMBOLS = /documentService\.upload|useWizardFileUploads|uploadApplicationFile|applicationSlipStorage/

describe('upload path single source (R2-d)', () => {
  it("'/documents/upload/' appears only in the live service and the three frozen dead modules", () => {
    const offenders = find(/\/documents\/upload\//).filter(
      (hit) => !FROZEN_UPLOAD_LITERAL_MODULES.has(hit.rel),
    )
    expect(report(offenders)).toEqual([])
  })

  it('no module references a dead upload path outside the frozen list', () => {
    const offenders = find(DEAD_SYMBOLS).filter((hit) => {
      const allowed = FROZEN_DEAD_REFERENCES[hit.rel]
      if (!allowed) return true
      const text = files.find((file) => file.rel === hit.rel)!.lines[hit.line - 1]
      return !allowed.some((symbol) => text.includes(symbol))
    })
    expect(report(offenders)).toEqual([])
  })

  it('nothing destructures the dead handlers from useApplicationFileUploads', () => {
    const offenders: string[] = []
    for (const file of files) {
      const text = file.lines.join('\n')
      const pattern =
        /\{[^{}]*\b(?:startUpload|handleResultSlipUpload|handleExtraKycUpload)\b[^{}]*\}\s*=\s*useApplicationFileUploads\b/g
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text)) !== null) {
        const line = text.slice(0, match.index).split('\n').length
        offenders.push(`${file.rel}:${line}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the live service uploads through apiClient.upload, never request or fetch', () => {
    const source = fs.readFileSync(path.join(SRC, 'services/requiredDocuments.ts'), 'utf8')
    expect(source).toContain("apiClient.upload")
    expect(source).not.toMatch(/apiClient\.request[^(]*\(\s*'\/documents\/upload\//)
  })
})
