/**
 * The landing makes no promise the platform cannot keep (tasks 29.1, 29.3; R12.1, R20.1).
 *
 * Each phrase below was a claim with no feature behind it: there is no SMS sender, no
 * room booking, no review-turnaround commitment, no grade conversion, and no source
 * for the stats or the 30-minute estimate.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')
const files = [
  'lib/constants/landing.ts',
  'components/landing/LandingHero.tsx',
  'components/landing/LandingPageSections.tsx',
  'pages/LandingPage.tsx',
]
const strip = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const copy = files.map(f => strip(readFileSync(path.join(SRC, f), 'utf8'))).join('\n').toLowerCase()

describe('landing copy', () => {
  it.each([
    'sms',
    'within a few working days',
    'we will convert',
    'request a room',
    'first pick',
    'about 30 minutes',
    'takes 2 minutes',
    'start tonight',
    'government accredited',
    'recognized by',
    'teach the job',
    'hostel matrons',
    'we enroll students from',
    'tuition and accommodation invoices',
    'school-buyer',
    'white-label',
  ])('does not say %s', phrase => {
    expect(copy).not.toContain(phrase)
  })

  it('has no stats constant and no hardcoded programme list', () => {
    expect(copy).not.toContain('export const stats')
    expect(copy).not.toContain('export const programs')
  })

  it('gives both hero actions the same width rule on a phone', () => {
    const hero = readFileSync(path.join(SRC, 'components/landing/LandingHero.tsx'), 'utf8')
    for (const marker of ['data-landing-action="primary"', 'data-landing-action="secondary"']) {
      expect(hero).toContain(marker)
    }
    // Both actions share one base rule that carries w-full sm:w-auto.
    expect(hero).toContain('w-full')
    expect(hero.match(/\bactionBase,/g)).toHaveLength(2)
    expect(hero).toMatch(/actionBase =[\s\S]*?sm:w-auto/)
  })
})
