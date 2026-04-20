import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

/**
 * Unit tests for InfiniteGrid component.
 *
 * Validates: Requirements 1.1, 1.4
 */

// Mock useReducedMotion from animation-config
let mockReducedMotion = false
vi.mock('@/lib/animation-config', () => ({
  useReducedMotion: () => mockReducedMotion,
}))

// Import after mock setup
import { InfiniteGrid } from '@/components/smoothui/infinite-grid'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function renderGrid(props: Parameters<typeof InfiniteGrid>[0] = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(<InfiniteGrid {...props} />)
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

describe('InfiniteGrid', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockReducedMotion = false
  })

  it('mounts and produces SVG output', () => {
    const { container, unmount } = renderGrid()
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    unmount()
  })

  it('renders a pattern element inside the SVG', () => {
    const { container, unmount } = renderGrid()
    const pattern = container.querySelector('pattern')
    expect(pattern).not.toBeNull()
    expect(pattern?.getAttribute('patternUnits')).toBe('userSpaceOnUse')
    unmount()
  })

  it('injects a <style> block with @keyframes', () => {
    const { unmount } = renderGrid()
    const style = document.querySelector('style[data-style-key]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('@keyframes infinite-grid-scroll')
    unmount()
  })

  it('applies animated class when reduced motion is false', () => {
    mockReducedMotion = false
    const { container, unmount } = renderGrid()
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('infinite-grid-animated')).toBe(true)
    unmount()
  })

  it('does NOT apply animated class when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderGrid()
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('infinite-grid-animated')).toBe(false)
    unmount()
  })

  it('does NOT set inline animation style when reduced motion is true', () => {
    mockReducedMotion = true
    const { container, unmount } = renderGrid()
    const svg = container.querySelector('svg')
    expect(svg?.style.animation).toBeFalsy()
    unmount()
  })

  it('sets inline animation style when reduced motion is false', () => {
    mockReducedMotion = false
    const { container, unmount } = renderGrid()
    const svg = container.querySelector('svg')
    expect(svg?.style.animation).toContain('infinite-grid-scroll')
    unmount()
  })

  it('renders with aria-hidden="true" on the wrapper', () => {
    const { container, unmount } = renderGrid()
    const wrapper = container.querySelector('[aria-hidden="true"]')
    expect(wrapper).not.toBeNull()
    unmount()
  })

  it('respects custom cellSize prop', () => {
    const { container, unmount } = renderGrid({ cellSize: 60 })
    const pattern = container.querySelector('pattern')
    expect(pattern?.getAttribute('width')).toBe('60')
    expect(pattern?.getAttribute('height')).toBe('60')
    unmount()
  })
})
