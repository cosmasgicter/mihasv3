/**
 * R7-c (task 5.3): ConditionsDialog validation. Confirm stays disabled until every
 * row is valid; rows are limited to 10; past deadlines are refused.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConditionsDialog, conditionRowError, localDateString } from '@/components/admin/applications/ConditionsDialog'

function open(onConfirm = vi.fn()) {
  render(<ConditionsDialog open onOpenChange={() => undefined} onConfirm={onConfirm} />)
  return { onConfirm, dialog: screen.getByRole('dialog') }
}

describe('conditionRowError', () => {
  const today = '2030-06-15'
  it('requires a trimmed description', () => {
    expect(conditionRowError({ description: '   ', deadline: today }, today)).not.toBeNull()
  })
  it('caps the description at 500 characters', () => {
    expect(conditionRowError({ description: 'x'.repeat(501), deadline: today }, today)).not.toBeNull()
    expect(conditionRowError({ description: 'x'.repeat(500), deadline: today }, today)).toBeNull()
  })
  it('accepts today and refuses yesterday', () => {
    expect(conditionRowError({ description: 'ok', deadline: today }, today)).toBeNull()
    expect(conditionRowError({ description: 'ok', deadline: '2030-06-14' }, today)).not.toBeNull()
  })
  it('requires a deadline', () => {
    expect(conditionRowError({ description: 'ok', deadline: '' }, today)).not.toBeNull()
  })
})

describe('ConditionsDialog', () => {
  it('disables Confirm until the row is valid, then sends trimmed conditions', async () => {
    const { onConfirm, dialog } = open()
    const confirm = within(dialog).getByRole('button', { name: /record conditional offer/i }) as HTMLButtonElement
    expect(confirm.disabled).toBe(true)
    fireEvent.change(within(dialog).getAllByRole('textbox')[0]!, { target: { value: '  Certified transcript  ' } })
    fireEvent.change(dialog.querySelector('input[type="date"]')!, { target: { value: localDateString() } })
    expect(confirm.disabled).toBe(false)
    await act(async () => {
      fireEvent.click(confirm)
    })
    expect(onConfirm).toHaveBeenCalledWith([{ description: 'Certified transcript', deadline: localDateString() }])
  })

  it('stops adding rows at ten', () => {
    const { dialog } = open()
    for (let i = 0; i < 9; i += 1) {
      fireEvent.click(within(dialog).getByRole('button', { name: /add another condition/i }))
    }
    expect(within(dialog).queryByRole('button', { name: /add another condition/i })).toBeNull()
    expect(within(dialog).getAllByRole('textbox')).toHaveLength(10)
  })
})
