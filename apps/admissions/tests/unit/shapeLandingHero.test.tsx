import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Unit tests for ShapeLandingHero component.
 *
 * Validates: Requirements 4.2, 4.5
 */

// Stub IntersectionObserver for child components (ShinyText, TextEffect)
globalThis.IntersectionObserver = class IntersectionObserver {
  constructor(private cb: IntersectionObserverCallback) {}
  observe() { /* noop */ }
  unobserve() { /* noop */ }
  disconnect() { /* noop */ }
} as unknown as typeof globalThis.IntersectionObserver

// Mock useReducedMotion from animation-config
let mockReducedMotion = false
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Mock react-router-dom Link as a plain <a> tag
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}))

// Import after mock setup
import { ShapeLandingHero } from '@/components/smoothui/shape-landing-hero'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const defaultProps = {
  headline: 'Your Future in Healthcare Starts Here',
  description: 'Join MIHAS-KATC for world-class health programs.',
  rotatingPhrases: ['Nursing', 'Pharmacy', 'Public Health'],
  primaryCta: { label: 'Start Your Application', href: '/apply' },
  secondaryCta: { label: 'Learn More', href: '/programs' },
}

function renderHero(props = defaultProps) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<ShapeLandingHero {...props} />)
  })

  return {
    container,
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('ShapeLandingHero', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockReducedMotion = false
  })

  it('renders both CTA links with correct hrefs', () => {
    const { container, unmount } = renderHero()
    const links = container.querySelectorAll('a')
    const hrefs = Array.from(links).map((a) => a.getAttribute('href'))

    expect(hrefs).toContain('/apply')
    expect(hrefs).toContain('/programs')
    unmount()
  })

  it('contains exactly one <h1> element with the headline text', () => {
    const { container, unmount } = renderHero()
    const h1Elements = container.querySelectorAll('h1')

    expect(h1Elements).toHaveLength(1)
    expect(h1Elements[0]!.textContent).toContain('Your Future in Healthcare Starts Here')
    unmount()
  })
})
