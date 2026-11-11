/**
 * Task 27.4 (R20.6, D9 option C): every letter mention the app shows agrees with
 * Spec A's letter copy ([R7.4], commit e7589a18f). A letter the school has not set
 * up reads "isn't available yet", never "ready"; no copy promises a letter rendered
 * with neutral fallback branding; and no copy mentions a rejection letter, because
 * D9 does not add that document type (rejections stay email-only).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { OFFICIAL_DOCUMENT_COPY } from '@/lib/officialDocumentPresentation'

const SRC = join(__dirname, '..', '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx)$/.test(name) ? [path] : []
  })
}

const files = sourceFiles(SRC).map(path => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))

describe('letter copy follows D9 option C and Spec A [R7.4]', () => {
  it('no source file mentions a rejection letter', () => {
    const offenders = files.filter(f => /rejection letter/i.test(f.text)).map(f => f.path)
    expect(offenders).toEqual([])
  })

  it('no copy says a letter is ready or will be generated with default branding', () => {
    const pattern = /letter (is |will be )?(ready|generated with (the )?(default|neutral|platform) branding)/i
    const offenders = files.filter(f => pattern.test(f.text)).map(f => f.path)
    expect(offenders).toEqual([])
  })

  it('the only letter types the app names are the two Spec A covers', () => {
    const letterTypes = Object.keys(OFFICIAL_DOCUMENT_COPY).filter(type => /letter|offer/.test(type))
    expect(letterTypes.sort()).toEqual(['acceptance_letter', 'conditional_offer'])
  })
})
