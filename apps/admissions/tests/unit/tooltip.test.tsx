import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Tooltip } from '@/components/ui/tooltip'

describe('Tooltip wrapper', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders a valid element child when asChild is true', () => {
    const markup = renderToStaticMarkup(
      <Tooltip content="Helpful hint">
        <button type="button">Hover me</button>
      </Tooltip>
    )

    expect(markup).toContain('Hover me')
    expect(markup).toContain('Helpful hint')
  })

  it('throws a clear error when asChild receives an invalid child', () => {
    vi.stubEnv('NODE_ENV', 'development')

    expect(() =>
      renderToStaticMarkup(
        <Tooltip content="Helpful hint">
          {'not-an-element' as unknown as React.ReactElement}
        </Tooltip>
      )
    ).toThrow(
      'Tooltip with asChild expects exactly one valid React element child. Example: <Tooltip asChild><button>Hover</button></Tooltip>.'
    )
  })

  it('supports non-element children when asChild is false', () => {
    const markup = renderToStaticMarkup(
      <Tooltip asChild={false} content="Helpful hint">
        Plain text trigger
      </Tooltip>
    )

    expect(markup).toContain('Plain text trigger')
    expect(markup).toContain('Helpful hint')
  })
})
