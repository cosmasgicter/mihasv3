import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { AnimatedSelect } from '@/components/smoothui/animated-select'
import { AnimatedFileUpload } from '@/components/smoothui/animated-file-upload'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('smoothui form control a11y consistency', () => {
  it('only sets aria-invalid when animated input has an error', () => {
    const noErrorDocument = renderMarkup(<AnimatedInput id="name" label="Name" />)
    const noErrorInput = noErrorDocument.querySelector('input')
    expect(noErrorInput?.hasAttribute('aria-invalid')).toBe(false)

    const errorDocument = renderMarkup(<AnimatedInput id="name" label="Name" error="Required" />)
    const errorInput = errorDocument.querySelector('input')
    expect(errorInput?.getAttribute('aria-invalid')).toBe('true')
  })

  it('sets required marker and ARIA contract on animated select', () => {
    const document = renderMarkup(
      <AnimatedSelect
        id="sex"
        label="Sex"
        required
        options={[
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
        ]}
      />
    )
    const select = document.querySelector('select')
    expect(select?.getAttribute('aria-required')).toBe('true')
    expect(document.body.textContent).toContain('*')
  })

  it('uses destructive required marker and conditional aria-invalid on animated file upload', () => {
    const noErrorDocument = renderMarkup(
      <AnimatedFileUpload id="file" label="Result Slip" required />
    )
    const noErrorInput = noErrorDocument.querySelector('input[type="file"]')
    expect(noErrorInput?.hasAttribute('aria-invalid')).toBe(false)
    expect(noErrorDocument.body.textContent).toContain('*')

    const errorDocument = renderMarkup(
      <AnimatedFileUpload id="file" label="Result Slip" error="Upload failed" />
    )
    const errorInput = errorDocument.querySelector('input[type="file"]')
    expect(errorInput?.getAttribute('aria-invalid')).toBe('true')
  })
})
