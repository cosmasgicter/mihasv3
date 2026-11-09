/**
 * R10 exploration: the build-version badge is a development diagnostic only.
 *
 * Spec: student-journey-repair task 1.9, clause 1.43 (design R10).
 *
 * At HEAD the production build shows "Runtime · Frontend … · Backend …" under
 * every authenticated page and in the public footer, and the badge probes
 * `/health/live/` from every visitor. Both render sites also keep a padded
 * wrapper, so gating the component alone would leave an empty band.
 *
 * Task 3.29 fixed this; the marker was removed at checkpoint 3.30.
 */
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getBackendBuildVersion = vi.fn(async () => '2.0.0')

vi.mock('@/lib/appVersion', () => ({
  formatBuildVersion: (value: string) => value,
  getFrontendBuildVersion: () => 'test-build',
  getBackendBuildVersion: () => getBackendBuildVersion(),
}))

const { BuildVersionBadge } = await import('@/components/ui/BuildVersionBadge')

afterEach(() => {
  vi.unstubAllEnvs()
  getBackendBuildVersion.mockClear()
})

/** Source without comments, so an explanation of the gate is not mistaken for it. */
function code(relative: string): string {
  return readFileSync(resolve(__dirname, '../../src', relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

/** The text between the nearest `import.meta.env.DEV &&` before the badge and the badge. */
function isInsideDevBlock(source: string): boolean {
  const badgeAt = source.indexOf('<BuildVersionBadge')
  if (badgeAt < 0) return true // not rendered at all is also acceptable
  const before = source.slice(0, badgeAt)
  const gateAt = before.lastIndexOf('import.meta.env.DEV &&')
  if (gateAt < 0) return false
  // The gate must open the block that contains the wrapper: no closing of that
  // JSX expression between the gate and the badge.
  const between = before.slice(gateAt)
  return !/\)\s*\}/.test(between)
}

describe('the diagnostics badge (clause 1.43)', () => {
  it('renders nothing and requests nothing when DEV is false', () => {
    vi.stubEnv('DEV', false)

    const { container } = render(<BuildVersionBadge />)

    expect(container.innerHTML).toBe('')
    expect(getBackendBuildVersion).not.toHaveBeenCalled()
  })

  it('AppLayout renders the badge wrapper only under import.meta.env.DEV', () => {
    expect(isInsideDevBlock(code('components/navigation/AppLayout.tsx'))).toBe(true)
  })

  it('SharedFooter renders the badge wrapper only under import.meta.env.DEV', () => {
    expect(isInsideDevBlock(code('components/layout/SharedFooter.tsx'))).toBe(true)
  })
})
