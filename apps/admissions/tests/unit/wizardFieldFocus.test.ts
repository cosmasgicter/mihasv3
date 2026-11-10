import { afterEach, describe, expect, it } from 'vitest'
import { findWizardField, focusWizardField } from '@/pages/student/applicationWizard/lib/wizardFieldFocus'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Go to field (task 25.2)', () => {
  it('finds a field by its name and focuses it', () => {
    document.body.innerHTML = `
      <div data-wizard-form-region>
        <input name="full_name" />
        <input name="nrc_number" />
      </div>`
    expect(focusWizardField('nrc_number')).toBe(true)
    expect((document.activeElement as HTMLInputElement).name).toBe('nrc_number')
  })

  it('falls back to the first control in the step when the item has no single field', () => {
    document.body.innerHTML = `
      <div data-wizard-form-region>
        <select name="grade_0"></select>
        <input type="file" />
      </div>`
    expect(findWizardField('grades')?.getAttribute('name')).toBe('grade_0')
    expect(focusWizardField('grades')).toBe(true)
  })

  it('reports false when the step has nothing to focus', () => {
    document.body.innerHTML = '<div></div>'
    expect(focusWizardField('payment')).toBe(false)
  })
})
