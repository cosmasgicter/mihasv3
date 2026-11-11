/**
 * User-facing copy does not narrate the system to its developers (task 27.5, R20.7).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const PHRASES = [
  'The column exists',
  'does not drift',
  'the platform does not measure',
  'Each number states what it counts',
  'rather than assumed',
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (full.includes(`${path.sep}generated`)) return []
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('no developer self-narration in UI copy', () => {
  it('renders none of the quoted phrases', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const code = strip(readFileSync(file, 'utf8')).toLowerCase()
      for (const phrase of PHRASES) {
        if (code.includes(phrase.toLowerCase())) offenders.push(`${path.relative(SRC, file)}: ${phrase}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
