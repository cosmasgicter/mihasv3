import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { UnifiedLoader } from '@/components/ui/UnifiedLoader'
import { DashboardLoadingState } from '@/components/ui/DashboardLoadingState'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('UnifiedLoader compatibility', () => {
  it('accepts the legacy message prop as an accessible label alias', () => {
    const document = renderMarkup(
      <UnifiedLoader variant="inline" size="sm" message="Loading details" />
    )

    const status = document.querySelector('[role="status"]')
    expect(status?.getAttribute('aria-label')).toBe('Loading details')
  })

  it('renders the shared dashboard loading state with an accessible page label', () => {
    const document = renderMarkup(
      <DashboardLoadingState label="Loading student dashboard" />
    )

    const root = document.querySelector('[role="status"]')
    expect(root?.getAttribute('aria-label')).toBe('Loading student dashboard')
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThanOrEqual(4)
  })
})
