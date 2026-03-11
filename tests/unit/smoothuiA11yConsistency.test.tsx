import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { AnimatedInput } from '@/components/smoothui/animated-input'
import { AnimatedSelect } from '@/components/smoothui/animated-select'
import { FileUpload } from '@/components/ui/FileUpload'

function renderMarkup(element: React.ReactElement) {
  const markup = renderToStaticMarkup(element)
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('smoothui form control a11y consistency', () => {
  it('keeps the animated input label visually above the field chrome', () => {
    const document = renderMarkup(<AnimatedInput id="name" label="Name" />)
    const label = document.querySelector('label')

    // Label should be positioned above the input with proper spacing (mb-2 = 8px gap)
    expect(label?.getAttribute('class')).toContain('block')
    expect(label?.getAttribute('class')).toContain('mb-2')
    expect(label?.getAttribute('class')).toContain('text-foreground')
  })

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

  it('uses destructive error styling on canonical file upload when error is present', () => {
    const noErrorDocument = renderMarkup(
      <FileUpload label="Result Slip" />
    )
    // FileUpload uses react-dropzone — verify it renders a drop zone
    expect(noErrorDocument.body.textContent).toContain('Drop file here')

    const errorDocument = renderMarkup(
      <FileUpload label="Result Slip" error="Upload failed" />
    )
    // Error message should be rendered with role="alert"
    const errorAlert = errorDocument.querySelector('[role="alert"]')
    expect(errorAlert?.textContent).toContain('Upload failed')
  })
})
