import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ErrorDisplay, ErrorBanner, LegacyErrorDisplay } from '@/components/ui/ErrorDisplay'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('ErrorDisplay (canonical)', () => {
  it('renders section variant with role="alert" and aria-live="assertive"', () => {
    const doc = renderMarkup(
      <ErrorDisplay message="Something went wrong" />
    )
    const alert = doc.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.getAttribute('aria-live')).toBe('assertive')
    expect(alert?.textContent).toContain('Something went wrong')
  })

  it('renders title when provided', () => {
    const doc = renderMarkup(
      <ErrorDisplay title="Fetch Failed" message="Could not load data" />
    )
    expect(doc.body.textContent).toContain('Fetch Failed')
    expect(doc.body.textContent).toContain('Could not load data')
  })

  it('shows Try Again button only when onRetry is provided', () => {
    const withoutRetry = renderMarkup(
      <ErrorDisplay message="Error" />
    )
    expect(withoutRetry.body.textContent).not.toContain('Try Again')

    const withRetry = renderMarkup(
      <ErrorDisplay message="Error" onRetry={() => undefined} />
    )
    expect(withRetry.body.textContent).toContain('Try Again')
  })

  it('renders inline variant compactly', () => {
    const doc = renderMarkup(
      <ErrorDisplay variant="inline" message="Field error" />
    )
    const alert = doc.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.getAttribute('aria-live')).toBe('assertive')
    expect(alert?.textContent).toContain('Field error')
  })

  it('uses text-destructive for error icon', () => {
    const doc = renderMarkup(
      <ErrorDisplay variant="section" message="Error" />
    )
    const icon = doc.querySelector('.text-destructive')
    expect(icon).not.toBeNull()
  })
})

describe('LegacyErrorDisplay', () => {
  it('renders a descriptive alert surface with retry action', () => {
    const doc = renderMarkup(
      <LegacyErrorDisplay
        error={{ status: 500, message: 'server failure' }}
        onRetry={() => undefined}
      />
    )
    const alert = doc.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Server Error')
    expect(doc.body.textContent).toContain('Try Again')
  })
})

describe('ErrorBanner', () => {
  it('renders an alert banner with dismiss and retry affordances', () => {
    const doc = renderMarkup(
      <ErrorBanner
        error={{ message: 'network failed' }}
        onDismiss={() => undefined}
        onRetry={() => undefined}
      />
    )
    const alert = doc.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Connection Problem')
    expect(doc.body.textContent).toContain('Try Again')
    expect(doc.querySelector('button[aria-label="Dismiss error"]')).not.toBeNull()
  })
})
