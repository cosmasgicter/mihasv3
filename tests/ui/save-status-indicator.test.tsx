import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AutoSaveIndicator } from '@/components/ui/AutoSaveIndicator'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('AutoSaveIndicator accessibility', () => {
  it('announces save state changes through a live status region', () => {
    const document = renderMarkup(
      <AutoSaveIndicator
        status="saved"
        lastSavedAt={new Date('2026-03-08T10:00:00.000Z').getTime()}
      />
    )

    const statusRegion = document.querySelector('[role="status"]')
    expect(statusRegion).not.toBeNull()
    expect(statusRegion?.getAttribute('aria-live')).toBe('polite')
    expect(statusRegion?.textContent).toContain('Saved')
  })

  it('renders save failures with destructive styling', () => {
    const document = renderMarkup(
      <AutoSaveIndicator
        status="error"
      />
    )

    const statusRegion = document.querySelector('[role="status"]')
    expect(statusRegion).not.toBeNull()
    expect(statusRegion?.textContent).toContain('Save failed')
  })

  it('shows saving state with pulse indicator', () => {
    const document = renderMarkup(
      <AutoSaveIndicator
        status="saving"
      />
    )

    const statusRegion = document.querySelector('[role="status"]')
    expect(statusRegion).not.toBeNull()
    expect(statusRegion?.textContent).toContain('Saving...')
  })

  it('renders nothing visible when idle', () => {
    const document = renderMarkup(
      <AutoSaveIndicator
        status="idle"
      />
    )

    const statusRegion = document.querySelector('[role="status"]')
    expect(statusRegion).not.toBeNull()
    // Idle state should have minimal/no visible text
    const visibleText = statusRegion?.textContent?.trim() ?? ''
    expect(visibleText).toBe('')
  })
})
