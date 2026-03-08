import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ErrorBanner, ErrorDisplay } from '@/components/ui/ErrorDisplay'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('ErrorDisplay', () => {
  it('renders a descriptive alert surface with retry action', () => {
    const document = renderMarkup(
      <ErrorDisplay
        error={{ status: 500, message: 'server failure' }}
        onRetry={() => undefined}
      />
    )

    const alert = document.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Server Error')
    expect(document.body.textContent).toContain('Try Again')
  })

  it('renders technical details in a disclosure region when requested', () => {
    const document = renderMarkup(
      <ErrorDisplay
        error={{ status: 500, message: 'server failure' }}
        showTechnicalDetails
      />
    )

    expect(document.querySelector('details')).not.toBeNull()
    expect(document.body.textContent).toContain('Technical Details')
  })
})

describe('ErrorBanner', () => {
  it('renders an alert banner with dismiss and retry affordances', () => {
    const document = renderMarkup(
      <ErrorBanner
        error={{ message: 'network failed' }}
        onDismiss={() => undefined}
        onRetry={() => undefined}
      />
    )

    const alert = document.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert?.textContent).toContain('Connection Problem')
    expect(document.body.textContent).toContain('Try Again')
    expect(document.querySelector('button[aria-label="Dismiss error"]')).not.toBeNull()
  })
})
