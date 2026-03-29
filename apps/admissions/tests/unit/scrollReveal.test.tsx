import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('react-intersection-observer', () => ({
  useInView: () => ({
    ref: () => {},
    inView: true,
  }),
}))

vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => false,
}))

import { StaggerReveal, StaggerItem } from '@/components/smoothui/scroll-reveal'

describe('StaggerReveal', () => {
  it('renders stagger items visibly when parent section is in view', () => {
    const markup = renderToStaticMarkup(
      <StaggerReveal>
        <StaggerItem>
          <div>Visible content</div>
        </StaggerItem>
      </StaggerReveal>
    )

    expect(markup).toContain('Visible content')
    expect(markup).toContain('opacity-100')
    expect(markup).not.toContain('opacity-0 translate-y-5')
  })
})
