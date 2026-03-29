import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { ApplicationCard, type ApplicationSummary } from '@/components/admin/applications/ApplicationCard'

const baseApplication: ApplicationSummary = {
  id: 'app-1',
  application_number: 'APP-0001',
  full_name: 'Jane Doe',
  email: 'jane@example.com',
  phone: '+260000000000',
  program: 'Nursing',
  intake: 'January 2026',
  institution: 'MIHAS',
  status: 'submitted',
  payment_status: 'pending_review',
  payment_verified_at: null,
  payment_verified_by: null,
  payment_verified_by_name: null,
  payment_verified_by_email: null,
  last_payment_audit_id: null,
  last_payment_audit_at: null,
  last_payment_audit_by_name: null,
  last_payment_audit_by_email: null,
  last_payment_audit_notes: null,
  last_payment_reference: null,
  application_fee: 153,
  paid_amount: 153,
  submitted_at: '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  result_slip_url: '',
  extra_kyc_url: '',
  pop_url: '',
  grades_summary: '',
  total_subjects: 5,
  points: 8,
  days_since_submission: 2,
  isDraft: false,
  completionPercentage: 100,
  lastUpdated: '2026-01-01T00:00:00.000Z',
}

const noop = vi.fn()

describe('ApplicationCard grades_summary rendering', () => {
  it('renders plain text summary content', () => {
    const html = renderToStaticMarkup(
      <ApplicationCard
        application={{ ...baseApplication, grades_summary: 'English: A\nMath: B+' }}
        onStatusUpdate={noop}
        onPaymentStatusUpdate={noop}
        onViewDetails={noop}
        updatingStatus={false}
        updatingPayment={false}
      />
    )

    expect(html).toContain('English: A\nMath: B+')
    expect(html).toContain('whitespace-pre-line')
  })

  it('treats malicious payload as text instead of executable html', () => {
    const payload = '<img src=x onerror=alert(1)><script>alert(1)</script>Bad'
    const html = renderToStaticMarkup(
      <ApplicationCard
        application={{ ...baseApplication, grades_summary: payload }}
        onStatusUpdate={noop}
        onPaymentStatusUpdate={noop}
        onViewDetails={noop}
        updatingStatus={false}
        updatingPayment={false}
      />
    )

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;Bad')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})
