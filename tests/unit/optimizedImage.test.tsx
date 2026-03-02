import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { OptimizedImage } from '@/components/ui/OptimizedImage'

describe('OptimizedImage', () => {
  it('does not render unsupported fetchPriority dom attribute', () => {
    const markup = renderToStaticMarkup(
      <OptimizedImage
        src="/images/programs/katc-campus.webp"
        alt="Campus"
        priority
        width={320}
        height={180}
      />
    )

    expect(markup).toContain('loading="eager"')
    expect(markup).not.toContain('fetchPriority=')
    expect(markup).not.toContain('fetchpriority=')
  })
})
