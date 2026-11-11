import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { Input } from '@/components/ui/input'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('Input UI/a11y consistency', () => {
  it('marks a required field by attribute and an optional one in words (task 24.4, R16.5)', () => {
    const required = renderMarkup(
      <Input id="email" label="Email" required />
    )
    // No asterisk: `required` and `aria-required` carry it.
    expect(required.body.textContent).not.toContain('*')
    expect(required.querySelector('input')?.getAttribute('aria-required')).toBe('true')

    const optional = renderMarkup(
      <Input id="nick" label="Nickname" optional />
    )
    expect(optional.body.textContent).toContain('(optional)')
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
