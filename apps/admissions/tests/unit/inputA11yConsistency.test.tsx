import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Input } from '@/components/ui/input'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('Input UI/a11y consistency', () => {
  it('shows required marker in the same pattern as other form controls', () => {
    const document = renderMarkup(
      <Input id="email" label="Email" required />
    )

    expect(document.body.textContent).toContain('*')
  })

  it('only sets aria-invalid when an error exists', () => {
    const noErrorDocument = renderMarkup(
      <Input id="email" label="Email" />
    )
    const noErrorInput = noErrorDocument.querySelector('input')
    expect(noErrorInput?.hasAttribute('aria-invalid')).toBe(false)

    const errorDocument = renderMarkup(
      <Input id="email" label="Email" error="Email is required" />
    )
    const errorInput = errorDocument.querySelector('input')
    expect(errorInput?.getAttribute('aria-invalid')).toBe('true')
  })
})
