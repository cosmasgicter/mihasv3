import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssignedSchoolStep from '@/pages/student/applicationWizard/steps/AssignedSchoolStep'
import type { AssignmentPreview } from '@/services/catalog'

const preview = (fee: AssignmentPreview['fee']): AssignmentPreview => ({
  program_id: 'p',
  intake_id: 'i',
  program_offering_id: 'o',
  institution_id: 'inst',
  assigned_school: { id: 's', name: 'Example School' },
  program_name: 'Diploma',
  intake_name: 'January 2027',
  fee,
  required_documents: [],
  contact: {},
})

const render = (fee: AssignmentPreview['fee']) =>
  renderToStaticMarkup(<AssignedSchoolStep preview={preview(fee)} isLoading={false} />)

describe('assigned-school fee estimate (task 26.4)', () => {
  it('shows the server total, the breakdown and the estimate note, as sent', () => {
    const markup = render({
      amount: '500.00',
      currency: 'ZMW',
      residency_category: 'local',
      source: 'program_fee',
      provider_fee_estimate: '5.00',
      customer_total: '505.00',
      bearer: 'customer',
      is_binding_quote: false,
    })
    expect(markup).toContain('Total you will pay: K505.00')
    expect(markup).toContain('Application fee K500.00')
    expect(markup).toContain('Transaction fee K5.00')
    expect(markup).toContain('Estimate before any fee waiver. The payment step confirms the amount.')
    expect(markup).toContain('Zambian applicant rate')
    // The code itself is never the label.
    expect(markup).not.toMatch(/>local</)
  })

  it('leaves out a zero transaction fee instead of showing K0.00', () => {
    const markup = render({
      amount: '500.00',
      currency: 'ZMW',
      residency_category: 'international',
      source: 'program_fee',
      provider_fee_estimate: '0.00',
      customer_total: '500.00',
      bearer: 'merchant',
      is_binding_quote: false,
    })
    expect(markup).toContain('Total you will pay: K500.00')
    expect(markup).not.toContain('Transaction fee')
    expect(markup).toContain('International applicant rate')
  })

  it('falls back to the base amount when the server sent no total', () => {
    const markup = render({
      amount: '500.00',
      currency: 'ZMW',
      residency_category: 'local',
      source: 'program_fee',
    })
    expect(markup).toContain('K500.00')
    expect(markup).not.toContain('Total you will pay')
  })
})

describe('plain labels for raw values (task 28.2)', () => {
  it('maps the residency code to the applicant-rate wording and never prints the code', async () => {
    const { residencyRateLabel } = await import('@/lib/serverAmount')
    expect(residencyRateLabel('local')).toBe('Zambian applicant rate')
    expect(residencyRateLabel('International')).toBe('International applicant rate')
    expect(residencyRateLabel('something_else')).toBe('')
    expect(residencyRateLabel(undefined)).toBe('')
  })

  it('names how a payment was made, not the provider that carried it', async () => {
    const { PAYMENT_CHANNEL_LABEL } = await import('@/lib/paymentStatus')
    expect(PAYMENT_CHANNEL_LABEL).toBe('Mobile money or card')
    const { readFileSync } = await import('node:fs')
    for (const file of [
      'src/pages/student/applicationWizard/steps/SubmitStep.tsx',
      'src/components/student/applicationStatus/PaymentStatusBlock.tsx',
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain('Processed via Lenco')
      expect(source).not.toContain('Lenco Payment Gateway')
    }
  })
})
