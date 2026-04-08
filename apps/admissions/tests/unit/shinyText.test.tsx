import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Unit tests for ShinyText component.
 *
 * Validates: Requirements 3.1, 3.3
 */

// Mock useReducedMotion from animation-config
let mockReducedMotion = false
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Import after mock setup
import { ShinyText } from '@/components/smoothui/shiny-text'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderShinyText(props: { text: string; as?: 'span' | 'p' | 'h1' | 'h2' | 'h3'; className?: string; animateOnEntry?: boolean }) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<ShinyText {...props} />)
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

describe('ShinyText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockReducedMotion = false
  })

  it('renders the provided text content', () => {
    const { container, unmount } = renderShinyText({ text: 'MIHAS-KATC', animateOnEntry: false })
    expect(container.textContent).toContain('MIHAS-KATC')
    unmount()
  })

  it('applies shiny-text-animate class when reduced motion is false and animateOnEntry is false', () => {
    mockReducedMotion = false
    const { container, unmount } = renderShinyText({ text: 'Test', animateOnEntry: false })
    const el = container.querySelector('.shiny-text-animate')
    expect(el).not.toBeNull()
    unmount()
  })

  it('applies shimmer animation style when reduced motion is false and animateOnEntry is false', () => {
    mockReducedMotion = false
    const { container, unmount } = renderShinyText({ text: 'Test', animateOnEntry: false })
    const el = container.querySelector('.shiny-text-animate') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.animation).toContain('shiny-text-shimmer')
    unmount()
  })

  it('injects a <style> block with @keyframes when not in reduced motion', () => {
    mockReducedMotion = false
    const { container, unmount } = renderShinyText({ text: 'Test', animateOnEntry: false })
    const style = container.querySelector('style')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('@keyframes shiny-text-shimmer')
    unmount()
  })

  it('applies shiny-text-static class when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderShinyText({ text: 'Test' })
    const el = container.querySelector('.shiny-text-static')
    expect(el).not.toBeNull()
    unmount()
  })

  it('does NOT apply shiny-text-animate class when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderShinyText({ text: 'Test' })
    const el = container.querySelector('.shiny-text-animate')
    expect(el).toBeNull()
    unmount()
  })

  it('does NOT set animation style when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderShinyText({ text: 'Test' })
    const span = container.querySelector('.shiny-text-static') as HTMLElement
    expect(span).not.toBeNull()
    expect(span.style.animation).toBeFalsy()
    unmount()
  })

  it('renders with the specified tag via "as" prop', () => {
    const { container, unmount } = renderShinyText({ text: 'Heading', as: 'h1', animateOnEntry: false })
    const h1 = container.querySelector('h1')
    expect(h1).not.toBeNull()
    expect(h1?.textContent).toBe('Heading')
    unmount()
  })

  it('applies custom className', () => {
    const { container, unmount } = renderShinyText({ text: 'Test', className: 'custom-class', animateOnEntry: false })
    const el = container.querySelector('.custom-class')
    expect(el).not.toBeNull()
    unmount()
  })
})
