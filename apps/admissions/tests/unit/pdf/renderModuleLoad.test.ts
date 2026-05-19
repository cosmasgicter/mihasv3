/**
 * Smoke test — PDF module loading
 *
 * Verifies that the render and theme barrels can be dynamically imported
 * without hitting a Temporal Dead Zone (TDZ) error caused by circular
 * cross-chunk dependencies (e.g. importing @/lib/logger from within the
 * pdf chunk).
 */

import { describe, expect, it, vi } from 'vitest'

const { fontRegisterSpy, hyphenationSpy } = vi.hoisted(() => ({
  fontRegisterSpy: vi.fn(),
  hyphenationSpy: vi.fn(),
}))

vi.mock('@react-pdf/renderer', () => ({
  Font: {
    register: fontRegisterSpy,
    registerHyphenationCallback: hyphenationSpy,
  },
}))

describe('PDF module loading (TDZ guard)', () => {
  it('loads the render module without TDZ', async () => {
    await expect(import('@/lib/pdf/render')).resolves.toBeDefined()
  })

  it('loads the theme barrel without TDZ', async () => {
    await expect(import('@/lib/pdf/theme')).resolves.toBeDefined()
  })
})
