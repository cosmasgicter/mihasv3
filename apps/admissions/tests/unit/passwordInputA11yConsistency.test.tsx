import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { PasswordInput } from '@/components/ui/PasswordInput'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('PasswordInput UI/a11y consistency', () => {
  it('only sets aria-invalid when an error exists', () => {
    const noErrorDocument = renderMarkup(
      <PasswordInput id="password" label="Password" />
    )
    const noErrorInput = noErrorDocument.querySelector('input')
    expect(noErrorInput?.getAttribute('aria-invalid')).toBe('false')

    const errorDocument = renderMarkup(
      <PasswordInput id="password" label="Password" error="Password is required" />
    )
    const errorInput = errorDocument.querySelector('input')
    expect(errorInput?.getAttribute('aria-invalid')).toBe('true')
  })

  it('keeps the visibility toggle at touch-target minimum', () => {
    const document = renderMarkup(
      <PasswordInput id="password" label="Password" />
    )
    const toggleButton = document.querySelector('button')
    // Task 24.6: `p-2` around a 20 px icon measured 36 x 36 px; the target is now 44 x 44 px.
    expect(toggleButton?.getAttribute('class')).toContain('min-h-touch')
    expect(toggleButton?.getAttribute('class')).toContain('min-w-touch')
  })
})
