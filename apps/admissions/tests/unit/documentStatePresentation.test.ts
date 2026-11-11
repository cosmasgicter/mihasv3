import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_STATE_PRESENTATION,
  documentStateFromVerification,
} from '@/lib/documentStatePresentation'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '../../src')
const REPO = path.resolve(HERE, '../../../..')

describe('documentStatePresentation (task 26.5, R14.7)', () => {
  it('has an entry for every document state the backend publishes (drift guard)', () => {
    const backend = readFileSync(
      path.join(REPO, 'backend/apps/applications/required_documents.py'),
      'utf8',
    )
    const match = backend.match(/DOCUMENT_STATES\s*=\s*\(([^)]*)\)/)
    expect(match, 'DOCUMENT_STATES is declared in required_documents.py').not.toBeNull()
    const states = Array.from(match![1]!.matchAll(/"([a-z_]+)"/g)).map(m => m[1]!)
    expect(states.length).toBeGreaterThan(0)
    for (const state of states) {
      expect(DOCUMENT_STATE_PRESENTATION, `no presentation for backend state ${state}`).toHaveProperty(state)
    }
  })

  it('gives each state one distinct word and one distinct icon', () => {
    const entries = Object.values(DOCUMENT_STATE_PRESENTATION)
    expect(new Set(entries.map(e => e.label)).size).toBe(entries.length)
    expect(new Set(entries.map(e => e.icon)).size).toBe(entries.length)
  })

  it('maps a stored document to the same state wherever it is shown', () => {
    expect(documentStateFromVerification('pending')).toBe('uploaded')
    expect(documentStateFromVerification(undefined)).toBe('uploaded')
    expect(documentStateFromVerification('verified')).toBe('verified')
    expect(documentStateFromVerification('approved')).toBe('verified')
    expect(documentStateFromVerification('rejected')).toBe('needs_attention')
  })
})

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

describe('student surfaces do not render missing data as a value (task 26.5, R14.6)', () => {
  const strip = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it('has no "Not available" / "Not provided" / "Not specified" literal on a student page or component', () => {
    const files = [
      ...walk(path.join(SRC, 'pages/student')),
      ...walk(path.join(SRC, 'components/student')),
    ]
    const offenders: string[] = []
    for (const file of files) {
      const code = strip(readFileSync(file, 'utf8'))
      for (const phrase of ["'Not available'", '"Not available"', "'Not provided'", '"Not provided"', "'Not specified'", '"Not specified"']) {
        if (code.includes(phrase)) offenders.push(`${path.relative(SRC, file)}: ${phrase}`)
      }
    }
    // The timeline helper turns the shared formatter's "Not available" into
    // "To be confirmed"; it names the phrase to do so and renders none.
    expect(offenders.filter(o => !o.startsWith('components/student/applicationStatus/applicationTimeline.ts'))).toEqual([])
  })
})
