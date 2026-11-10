/**
 * No student surface hardcodes an email address (task 27.2, R20.2).
 *
 * A student who needs a human is sent to the resolved school's own admissions
 * address, or to the neutral in-app contact route, through
 * `resolveTenantSupportContact`. An address typed into a component is one school's
 * (or the platform's) inbox printed into every tenant's UI.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
/** Placeholders and documentation addresses that belong to no one. */
const ALLOWED_DOMAINS = /@(?:example\.(?:com|org|net)|test\.invalid)$/i

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : []
  })
}

const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('student surfaces name no email address of their own', () => {
  it('has no hardcoded address under pages/student, components/student or pages/public/tracker', () => {
    const roots = ['pages/student', 'components/student', 'pages/public/tracker'].map(r => path.join(SRC, r))
    const offenders: string[] = []
    for (const file of roots.flatMap(walk)) {
      for (const match of strip(readFileSync(file, 'utf8')).matchAll(EMAIL)) {
        if (!ALLOWED_DOMAINS.test(match[0])) offenders.push(`${path.relative(SRC, file)}: ${match[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
