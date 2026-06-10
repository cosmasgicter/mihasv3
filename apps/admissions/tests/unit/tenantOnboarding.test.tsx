/**
 * Unit coverage for the tenant onboarding IA building blocks added in
 * task 23.1 (structured rule builders + collision surfacing).
 *
 * Scope:
 *   - `tenantErrorMessage` / `isCollisionError` — surface backend slug/code/
 *     hostname collision messages instead of a generic fallback (R11.2).
 *   - `TokenChips` — the structured country allow/deny builder that replaces
 *     raw JSON rule entry (R11.7): add, de-dupe, and remove.
 *
 * **Validates: Requirements R11.2, R11.7**
 */
import { render, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, afterEach, vi } from 'vitest'

import { tenantErrorMessage, isCollisionError } from '@/pages/admin/tenants/errors'
import { TokenChips } from '@/pages/admin/tenants/primitives'

afterEach(() => {
  cleanup()
})

describe('tenantErrorMessage', () => {
  it('prefers a backend collision message over the generic fallback', () => {
    const error = Object.assign(new Error('Institution slug is already in use.'), { status: 400 })
    expect(tenantErrorMessage(error, 'Institution was not saved')).toBe('Institution slug is already in use.')
  })

  it('joins DRF field errors when present', () => {
    const error = Object.assign(new Error('Validation failed'), {
      fieldErrors: { hostname: 'Domain hostname is already in use.' },
    })
    expect(tenantErrorMessage(error, 'fallback')).toBe('Domain hostname is already in use.')
  })

  it('falls back when the message is a generic API error', () => {
    const error = Object.assign(new Error('API Error: Bad Request'), { status: 400 })
    expect(tenantErrorMessage(error, 'Institution was not saved')).toBe('Institution was not saved')
  })
})

describe('isCollisionError', () => {
  it('detects "already in use" collisions', () => {
    expect(isCollisionError(new Error('Institution code is already in use.'))).toBe(true)
  })

  it('detects 409 conflicts', () => {
    expect(isCollisionError(Object.assign(new Error('Conflict'), { status: 409 }))).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isCollisionError(new Error('Network down'))).toBe(false)
  })
})

describe('TokenChips structured rule builder', () => {
  it('adds a trimmed value on the Add button and de-duplicates case-insensitively', () => {
    const onChange = vi.fn()
    const { getByLabelText, getByRole, rerender } = render(
      <TokenChips label="Allowed countries" values={[]} onChange={onChange} />,
    )

    const input = getByLabelText('Allowed countries') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Zambia  ' } })
    fireEvent.click(getByRole('button', { name: 'Add' }))
    expect(onChange).toHaveBeenLastCalledWith(['Zambia'])

    // A case-insensitive duplicate is rejected (no change emitted).
    onChange.mockClear()
    rerender(<TokenChips label="Allowed countries" values={['Zambia']} onChange={onChange} />)
    fireEvent.change(getByLabelText('Allowed countries'), { target: { value: 'zambia' } })
    fireEvent.click(getByRole('button', { name: 'Add' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('removes a value via its remove control', () => {
    const onChange = vi.fn()
    const { getByLabelText } = render(
      <TokenChips label="Excluded countries" values={['Zambia', 'Other']} onChange={onChange} />,
    )
    fireEvent.click(getByLabelText('Remove Zambia'))
    expect(onChange).toHaveBeenCalledWith(['Other'])
  })

  it('shows an "applies to all" hint when empty', () => {
    const { getByText } = render(
      <TokenChips label="Allowed countries" values={[]} onChange={vi.fn()} />,
    )
    expect(getByText('No entries — applies to all.')).toBeTruthy()
  })
})
