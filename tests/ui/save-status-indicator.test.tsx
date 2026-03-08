import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { SaveStatusIndicator } from '@/components/ui/SaveStatusIndicator'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('SaveStatusIndicator accessibility', () => {
  it('announces save state changes through a live status region', () => {
    const document = renderMarkup(
      <SaveStatusIndicator
        status="saved"
        lastSaved={new Date('2026-03-08T10:00:00.000Z')}
        isOnline
      />
    )

    const statusRegion = document.querySelector('[role="status"]')
    expect(statusRegion).not.toBeNull()
    expect(statusRegion?.getAttribute('aria-live')).toBe('polite')
    expect(statusRegion?.textContent).toContain('Saved')
  })

  it('renders actionable save failures as an alert with retry context', () => {
    const document = renderMarkup(
      <SaveStatusIndicator
        status="error"
        saveError="Could not sync to the server."
        saveAttempts={2}
        onForceSave={() => undefined}
      />
    )

    const errorAlert = document.querySelector('[role="alert"]')
    expect(errorAlert).not.toBeNull()
    expect(errorAlert?.textContent).toContain('Could not sync to the server.')
    expect(document.body.textContent).toContain('Retry save')
  })
})
