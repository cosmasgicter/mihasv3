import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ErrorDisplay } from '@/components/ui/ErrorDisplay'

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

  it('renders inline variant compactly with role="alert"', () => {
    const doc = renderMarkup(
      <ErrorDisplay variant="inline" message="Field error" />
    )
    const alert = doc.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.getAttribute('aria-live')).toBe('assertive')
    expect(alert?.textContent).toContain('Field error')
  })

  it('uses text-destructive for error icon in section variant', () => {
    const doc = renderMarkup(
      <ErrorDisplay variant="section" message="Error" />
    )
    const icon = doc.querySelector('.text-destructive')
    expect(icon).not.toBeNull()
  })

  it('renders inline variant with title and retry', () => {
    const doc = renderMarkup(
      <ErrorDisplay variant="inline" title="Validation" message="Invalid input" onRetry={() => undefined} />
    )
    expect(doc.body.textContent).toContain('Validation')
    expect(doc.body.textContent).toContain('Invalid input')
    expect(doc.body.textContent).toContain('Try Again')
  })
})
