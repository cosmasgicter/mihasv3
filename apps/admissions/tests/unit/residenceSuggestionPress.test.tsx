/**
 * The residence suggestion row must not collapse in the middle of a press
 * (admissions-v2 task 6.3 completion pass — R10.7 "without blocking", R16.2).
 *
 * The browser run of `ocr-manual-fallback.spec.ts` caught "Continue to
 * Education" refusing to advance with no request and no error. The cause was
 * layout, not the draft machine: the town field's 44 px suggestion chips are
 * rendered while it has focus, a press on Continue blurred the field, the blur
 * removed the chips on `pointerdown`, everything below moved up 52 px before
 * `pointerup`, and the click landed on whatever slid under the pointer. The row
 * now closes when the press that blurred the field is released.
 *
 * These cases drive the real component through the pointer and focus events a
 * browser sends, in the order it sends them.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useResidenceLocationOptions', () => ({
  useResidenceLocationOptions: () => ({
    countryOptions: [{ value: 'Zambia', label: 'Zambia' }],
    cityOptions: [
      { value: 'Lusaka', label: 'Lusaka' },
      { value: 'Livingstone', label: 'Livingstone' },
    ],
    loadingCountries: false,
    loadingCities: false,
  }),
}))

import { ResidenceLocationFields } from '@/pages/student/applicationWizard/components/ResidenceLocationFields'
import type { WizardFormData } from '@/pages/student/applicationWizard/types'

function Harness() {
  const form = useForm<WizardFormData>({
    defaultValues: { country: 'Zambia', residence_town: '' } as WizardFormData,
  })
  return (
    <div>
      <ResidenceLocationFields form={form} />
      <button type="button">Continue to Education</button>
    </div>
  )
}

const townRow = () => document.getElementById('residence-town-suggestions')

function focusTown() {
  const town = screen.getByLabelText(/residence town/i)
  act(() => {
    town.focus()
  })
  fireEvent.focus(town)
  return town
}

describe('residence suggestion row and a press elsewhere', () => {
  it('stays open for the whole press that blurs the field and its click, then closes', async () => {
    render(<Harness />)
    const town = focusTown()
    expect(townRow()).not.toBeNull()

    const continueButton = screen.getByRole('button', { name: /continue to education/i })
    // pointerdown -> blur (the browser moves focus) -> pointerup -> click
    fireEvent.pointerDown(continueButton)
    fireEvent.blur(town)
    expect(townRow(), 'the row must not collapse while the pointer is still down').not.toBeNull()

    fireEvent.pointerUp(continueButton)
    fireEvent.click(continueButton)
    expect(townRow(), 'the row is still there when the click is delivered').not.toBeNull()

    await waitFor(() => expect(townRow(), 'the row closes after the press').toBeNull())
  })

  it('closes at once on a keyboard blur, with no press in progress', () => {
    render(<Harness />)
    const town = focusTown()
    expect(townRow()).not.toBeNull()

    fireEvent.blur(town)
    expect(townRow()).toBeNull()
  })

  it('stays open when the press returns focus to the field before it ends', async () => {
    render(<Harness />)
    const town = focusTown()
    const continueButton = screen.getByRole('button', { name: /continue to education/i })

    fireEvent.pointerDown(continueButton)
    fireEvent.blur(town)
    fireEvent.focus(town)
    fireEvent.pointerUp(continueButton)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
    expect(townRow()).not.toBeNull()
  })

  it('closes at once when a suggestion is chosen', () => {
    render(<Harness />)
    focusTown()
    fireEvent.click(screen.getByRole('button', { name: 'Lusaka' }))
    expect(townRow()).toBeNull()
    expect((screen.getByLabelText(/residence town/i) as HTMLInputElement).value).toBe('Lusaka')
  })
})
