import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Unit tests for TextRotate component.
 *
 * Validates: Requirements 5.1, 5.3, 5.4
 */

// Mock useReducedMotion from animation-config
let mockReducedMotion = false
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Import after mock setup
import { TextRotate } from '@/components/smoothui/text-rotate'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderTextRotate(props: { phrases: string[]; interval?: number; duration?: number; className?: string; announce?: boolean }) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<TextRotate {...props} />)
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

describe('TextRotate', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockReducedMotion = false
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the first phrase initially', () => {
    const { container, unmount } = renderTextRotate({ phrases: ['Hello', 'World', 'Test'] })
    expect(container.textContent).toContain('Hello')
    unmount()
  })

  it('cycles through phrases over time (Requirement 5.1)', () => {
    const { container, unmount } = renderTextRotate({
      phrases: ['First', 'Second', 'Third'],
      interval: 3000,
      duration: 500,
    })

    expect(container.textContent).toContain('First')

    // Advance past the interval to trigger advance()
    act(() => { vi.advanceTimersByTime(3000) })
    // Advance past the half-duration setTimeout inside advance() to swap the phrase
    act(() => { vi.advanceTimersByTime(250) })

    expect(container.textContent).toContain('Second')

    // Advance again to cycle to the third phrase
    act(() => { vi.advanceTimersByTime(3000) })
    act(() => { vi.advanceTimersByTime(250) })

    expect(container.textContent).toContain('Third')
    unmount()
  })

  it('has aria-live="polite" attribute (Requirement 5.4)', () => {
    const { container, unmount } = renderTextRotate({ phrases: ['Hello', 'World'], announce: true })
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    unmount()
  })

  it('has aria-live="polite" in reduced motion mode (Requirement 5.4)', () => {
    mockReducedMotion = true
    const { container, unmount } = renderTextRotate({ phrases: ['Hello', 'World'], announce: true })
    const liveRegion = container.querySelector('[aria-live="polite"]')
    expect(liveRegion).not.toBeNull()
    unmount()
  })

  it('shows static text with text-rotate-static class when reduced motion is enabled (Requirement 5.3)', () => {
    mockReducedMotion = true
    const { container, unmount } = renderTextRotate({ phrases: ['Hello', 'World', 'Test'] })
    const staticEl = container.querySelector('.text-rotate-static')
    expect(staticEl).not.toBeNull()
    expect(staticEl?.textContent).toBe('Hello')
    unmount()
  })

  it('does NOT cycle phrases when reduced motion is enabled (Requirement 5.3)', () => {
    mockReducedMotion = true
    const { container, unmount } = renderTextRotate({
      phrases: ['First', 'Second', 'Third'],
      interval: 3000,
      duration: 500,
    })

    expect(container.textContent).toContain('First')

    // Advance well past the interval — phrase should not change
    act(() => { vi.advanceTimersByTime(10000) })

    expect(container.textContent).toContain('First')
    expect(container.textContent).not.toContain('Second')
    unmount()
  })

  it('does NOT have text-rotate-wrapper class when reduced motion is enabled', () => {
    mockReducedMotion = true
    const { container, unmount } = renderTextRotate({ phrases: ['Hello', 'World'] })
    const wrapper = container.querySelector('.text-rotate-wrapper')
    expect(wrapper).toBeNull()
    unmount()
  })

  it('renders nothing when phrases array is empty', () => {
    const { container, unmount } = renderTextRotate({ phrases: [] })
    expect(container.textContent).toBe('')
    unmount()
  })

  it('applies custom className', () => {
    const { container, unmount } = renderTextRotate({ phrases: ['Hello'], className: 'custom-class' })
    const el = container.querySelector('.custom-class')
    expect(el).not.toBeNull()
    unmount()
  })
})
