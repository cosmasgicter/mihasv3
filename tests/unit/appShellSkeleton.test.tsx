// @ts-nocheck
/**
 * Unit tests for AppShellSkeleton component.
 *
 * Verifies the minimal app shell skeleton renders a header placeholder
 * and content area during the auth session check, instead of a blank page.
 *
 * Requirements: 14.2
 */

import React from 'react'
import { describe, it, expect } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

import { AppShellSkeleton } from '@/components/ui/AppShellSkeleton'

function renderInto(element: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(element) })
  return {
    container,
    unmount() {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

describe('AppShellSkeleton', () => {
  it('renders a visible container (not null/empty)', () => {
    const { container, unmount } = renderInto(<AppShellSkeleton />)
    expect(container.innerHTML).not.toBe('')
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    unmount()
  })

  it('renders a header placeholder with h-16 height class', () => {
    const { container, unmount } = renderInto(<AppShellSkeleton />)
    const header = container.querySelector('.h-16')
    expect(header).not.toBeNull()
    unmount()
  })

  it('renders content area skeleton blocks', () => {
    const { container, unmount } = renderInto(<AppShellSkeleton />)
    const pulseElements = container.querySelectorAll('.animate-pulse')
    // Header has 3 pulse elements (name bar + 2 circles), content has 5 more
    expect(pulseElements.length).toBeGreaterThanOrEqual(5)
    unmount()
  })

  it('has accessible aria-label', () => {
    const { container, unmount } = renderInto(<AppShellSkeleton />)
    const root = container.querySelector('[aria-label="Loading application"]')
    expect(root).not.toBeNull()
    unmount()
  })
})
