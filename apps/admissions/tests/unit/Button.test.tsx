import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'

describe('Button asChild behavior', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('supports loading in asChild mode without throwing', () => {
    const markup = renderToStaticMarkup(
      <Button asChild loading>
        <a href="/apply">Apply now</a>
      </Button>
    )

    expect(markup).toContain('Apply now')
    expect(markup).toContain('animate-spin')
  })

  it('throws a clear error when asChild does not receive exactly one valid element child', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(() =>
      renderToStaticMarkup(
        <Button asChild>
          {'not-an-element' as unknown as React.ReactNode}
        </Button>
      )
    ).toThrow('Button with asChild expects exactly one valid React element child')
  })

  it('still renders loading spinner in normal button mode', () => {
    const markup = renderToStaticMarkup(<Button loading>Submit</Button>)

    expect(markup).toContain('Submit')
    expect(markup).toContain('animate-spin')
    expect(markup).toContain('aria-busy="true"')
  })
})
