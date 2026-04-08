import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Unit tests for TextEffect component.
 *
 * Validates: Requirements 6.2, 6.4
 */

// Mock useReducedMotion from animation-config
let mockReducedMotion = false
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Import after mock setup
import { TextEffect } from '@/components/smoothui/text-effect'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// IntersectionObserver mock — class-based so it works as a constructor
let capturedCallback: IntersectionObserverCallback | null = null
let mockDisconnect: ReturnType<typeof vi.fn>

class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect: ReturnType<typeof vi.fn>
  root = null
  rootMargin = ''
  thresholds: number[] = []
  takeRecords = vi.fn(() => [] as IntersectionObserverEntry[])

  constructor(callback: IntersectionObserverCallback) {
    capturedCallback = callback
    mockDisconnect = vi.fn()
    this.disconnect = mockDisconnect
  }
}

function triggerIntersection(isIntersecting: boolean) {
  if (capturedCallback) {
    capturedCallback(
      [{ isIntersecting } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
  }
}

function renderTextEffect(props: {
  children: React.ReactNode
  effect?: 'fadeUp' | 'fadeIn' | 'slideLeft' | 'blur'
  delay?: number
  className?: string
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<TextEffect {...props} />)
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

describe('TextEffect', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockReducedMotion = false
    capturedCallback = null

    Object.defineProperty(window, 'IntersectionObserver', {
      writable: true,
      value: MockIntersectionObserver,
    })
  })

  it('renders text content in the DOM before intersection (visible, not hidden)', () => {
    const { container, unmount } = renderTextEffect({ children: 'Hello World' })

    // Text must be in the DOM before any intersection fires
    expect(container.textContent).toContain('Hello World')

    // Must NOT use visibility:hidden or display:none
    const el = container.querySelector('[class*="text-effect"]') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.style.visibility).not.toBe('hidden')
    expect(el.style.display).not.toBe('none')

    unmount()
  })

  it('applies initial class before intersection (e.g. text-effect--fade-up-initial)', () => {
    const { container, unmount } = renderTextEffect({ children: 'Animate me' })

    const el = container.querySelector('.text-effect--fade-up-initial')
    expect(el).not.toBeNull()

    unmount()
  })

  it('applies animated class after intersection triggers', () => {
    const { container, unmount } = renderTextEffect({ children: 'Animate me' })

    // Before intersection: initial class present
    expect(container.querySelector('.text-effect--fade-up-initial')).not.toBeNull()
    expect(container.querySelector('.text-effect--fade-up-animated')).toBeNull()

    // Trigger intersection
    act(() => {
      triggerIntersection(true)
    })

    // After intersection: animated class present, initial class gone
    expect(container.querySelector('.text-effect--fade-up-animated')).not.toBeNull()
    expect(container.querySelector('.text-effect--fade-up-initial')).toBeNull()

    unmount()
  })

  it('disconnects observer after first intersection (triggerOnce)', () => {
    renderTextEffect({ children: 'Once only' })

    act(() => {
      triggerIntersection(true)
    })

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('does not apply animation classes when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderTextEffect({ children: 'Static text' })

    // Should have the base text-effect class only
    const el = container.querySelector('.text-effect')
    expect(el).not.toBeNull()

    // Should NOT have initial or animated classes
    expect(container.querySelector('.text-effect--fade-up-initial')).toBeNull()
    expect(container.querySelector('.text-effect--fade-up-animated')).toBeNull()

    // Text should still be visible
    expect(container.textContent).toContain('Static text')

    unmount()
  })

  it('supports different effect types (fadeIn)', () => {
    const { container, unmount } = renderTextEffect({
      children: 'Fade in',
      effect: 'fadeIn',
    })

    expect(container.querySelector('.text-effect--fade-in-initial')).not.toBeNull()

    act(() => {
      triggerIntersection(true)
    })

    expect(container.querySelector('.text-effect--fade-in-animated')).not.toBeNull()

    unmount()
  })

  it('applies custom className', () => {
    const { container, unmount } = renderTextEffect({
      children: 'Custom',
      className: 'my-custom-class',
    })

    const el = container.querySelector('.my-custom-class')
    expect(el).not.toBeNull()

    unmount()
  })
})
