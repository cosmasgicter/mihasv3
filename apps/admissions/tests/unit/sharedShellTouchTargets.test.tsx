/**
 * Shared Shell Touch-Target Guard — PublicSiteHeader + SharedFooter
 *
 * `routeMobileOverflowGuard.test.tsx` deliberately mocks out `PublicLayout`
 * (and therefore `PublicSiteHeader` / `SharedFooter`, which render inside it)
 * so each page body can be measured in isolation. That means the shared
 * header/footer chrome itself was never covered by a touch-target signal
 * check — which is exactly how the real production defect slipped through:
 * a real headless-chrome + `getBoundingClientRect()` pass against
 * `https://apply.beanola.com` measured the home-logo link at 40×40px and the
 * footer credit link at 145.5×17px, both below the 44×44px minimum
 * (`docs/launch-evidence/04-mobile-ui/mobile-ui-evidence.json`).
 *
 * Per the same jsdom-has-no-layout-engine constraint documented in
 * `routeMobileOverflowGuard.test.tsx`, this guard checks the same
 * source-level 44px signal (`min-h-touch` / `min-w-touch` / `h-11`+ / an
 * explicit `min-h-[44px]`) on the two specific interactive links that failed
 * the real measurement, so a regression back to an unsized inline/40px link
 * fails CI before it ever reaches a live measurement pass again.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SRC_ROOT = path.resolve(__dirname, '../../src')

const TOUCH_SIGNAL = /\bmin-h-touch\b|\bmin-w-touch\b|\bh-(1[1-9]|[2-9]\d)\b|\bmin-h-\[(4[4-9]|[5-9]\d|\d{3,})px\]/

function readSource(relPath: string): string {
  return fs.readFileSync(path.join(SRC_ROOT, relPath), 'utf-8')
}

/** Extract the JSX opening tag (attributes only) starting at `anchor` in `source`. */
function extractTagStartingAt(source: string, anchor: string): string {
  const idx = source.indexOf(anchor)
  expect(idx, `expected to find ${JSON.stringify(anchor)} in source`).toBeGreaterThanOrEqual(0)
  // Walk backward to the nearest '<' that opens this tag.
  const tagStart = source.lastIndexOf('<', idx)
  const tagEnd = source.indexOf('>', idx)
  return source.slice(tagStart, tagEnd + 1)
}

describe('Shared shell touch targets (PublicSiteHeader + SharedFooter)', () => {
  it('PublicSiteHeader home-logo Link carries a >=44px touch signal', () => {
    const source = readSource('components/layout/PublicSiteHeader.tsx')
    const tag = extractTagStartingAt(source, 'aria-label="Beanola Admissions - Home"')
    expect(tag).toMatch(TOUCH_SIGNAL)
  })

  it('SharedFooter "Beanola Technologies" credit link carries a >=44px touch signal', () => {
    const source = readSource('components/layout/SharedFooter.tsx')
    const tag = extractTagStartingAt(source, 'href="https://beanola.com"')
    expect(tag).toMatch(TOUCH_SIGNAL)
  })

  it('regression guard: fails on an unsized inline link (sanity check for the matcher itself)', () => {
    const unsized = '<a href="https://beanola.com" className="font-semibold text-white">Beanola Technologies</a>'
    expect(unsized).not.toMatch(TOUCH_SIGNAL)
  })
})
