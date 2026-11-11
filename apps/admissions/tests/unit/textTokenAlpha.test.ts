/**
 * No alpha modifier on a text token (platform-simplification task 23.2, Requirement 18.3).
 *
 * `text-muted-foreground/60` is a text colour at 60% opacity: it fails WCAG AA on white
 * and nothing in the type system says so. The scan reads the token names from
 * `design-tokens.css` (not the `-rgb` channel variables) and fails, naming file and
 * line, on any `text-<token>/<NN>` with or without a variant prefix. `text-white/NN` is a
 * Tailwind palette colour, not a token, and axe's `color-contrast` rule measures its
 * composited contrast, so it is out of scope (design section 12, Phase 5).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')
const SRC = join(ROOT, 'src')

export function tokenNames(css: string): string[] {
  const names = new Set<string>()
  for (const match of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
    const name = match[1]!
    if (name.endsWith('-rgb')) continue
    names.add(name)
  }
  return [...names]
}

export function findAlphaTextTokens(source: string, tokens: string[]): number[] {
  // Longest names first so `muted-foreground` is tried before `muted`.
  const alternation = [...tokens].sort((a, b) => b.length - a.length).join('|')
  const pattern = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*text-(?:${alternation})/\\d+(?![\\w-])`)
  const lines: number[] = []
  source.split('\n').forEach((line, i) => {
    if (pattern.test(line)) lines.push(i + 1)
  })
  return lines
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|css)$/.test(entry)) out.push(full)
  }
  return out
}

const tokens = tokenNames(readFileSync(join(SRC, 'styles', 'design-tokens.css'), 'utf8'))

describe('text-token alpha modifiers (Requirement 18.3)', () => {
  it('reads real token names and no channel variables', () => {
    expect(tokens).toContain('muted-foreground')
    expect(tokens).toContain('primary')
    expect(tokens.some((t) => t.endsWith('-rgb'))).toBe(false)
  })

  it('matches a variant-prefixed use but not text-white/NN', () => {
    expect(findAlphaTextTokens('<a className="hover:text-primary/80">', tokens)).toEqual([1])
    expect(findAlphaTextTokens('<i className="placeholder:text-muted-foreground/60" />', tokens)).toEqual([1])
    expect(findAlphaTextTokens('<p className="text-white/80">', tokens)).toEqual([])
    expect(findAlphaTextTokens('<p className="bg-primary/10 text-foreground">', tokens)).toEqual([])
  })

  it('no file under src/ uses a text token with an alpha modifier', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const lines = findAlphaTextTokens(readFileSync(file, 'utf8'), tokens)
      for (const line of lines) offenders.push(`${relative(ROOT, file)}:${line}`)
    }
    expect(offenders).toEqual([])
  })
})
