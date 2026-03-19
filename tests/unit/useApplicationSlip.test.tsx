import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useApplicationSlip } from '@/pages/student/applicationWizard/hooks/useApplicationSlip'
import type { ApplicationSlipData } from '@/lib/applicationSlip'
import type { SlipServiceResult } from '@/lib/slipService'

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

describe('useApplicationSlip email handling', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    document.body.removeChild(container)
  })

  it('shows success toast when email is queued successfully', async () => {
    const showSuccess = vi.fn()
    const showWarning = vi.fn()
    const createApplicationSlip = vi.fn<Promise<SlipServiceResult>, [ApplicationSlipData]>().mockResolvedValue({
      emailed: true,
      queuedId: 'queue-1',
      fallbackDownloadUrl: 'https://example.com/slips/app-1.pdf',
    })

    const slipPayload: ApplicationSlipData = {
      application_id: 'app-1',
      application_number: 'MIHAS000001',
      public_tracking_code: 'TRK12345',
      status: 'submitted',
      payment_status: 'pending_review',
      submitted_at: '2026-03-07T12:00:00.000Z',
      updated_at: '2026-03-07T12:00:00.000Z',
      program_name: 'Nursing',
      intake_name: 'January 2026',
      institution: 'MIHAS',
      institution_name: 'MIHAS',
      full_name: 'Jane Student',
      email: 'student@example.com',
      phone: '+260970000000',
      nationality: 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
    }

    let handleEmailSlip: (() => Promise<void>) | undefined

    function Harness() {
      const hook = useApplicationSlip({
        submittedApplication: {
          applicationNumber: 'MIHAS000001',
          trackingCode: 'TRK12345',
          program: 'Nursing',
          institution: 'MIHAS',
          email: 'student@example.com',
        },
        slipPayload,
        success: true,
        toast: { showSuccess, showWarning },
        createApplicationSlip: createApplicationSlip as any,
      })
      handleEmailSlip = hook.handleEmailSlip
      return null
    }

    await act(async () => {
      root.render(<Harness />)
      await flushPromises()
    })

    await act(async () => {
      await handleEmailSlip?.()
      await flushPromises()
    })

    expect(createApplicationSlip).toHaveBeenCalledTimes(1)
    expect(showSuccess).toHaveBeenCalledWith('Email queued', 'Application slip will be sent to student@example.com')
    expect(showWarning).not.toHaveBeenCalled()
  })

  it('shows fallback download guidance when email queueing fails', async () => {
    const showSuccess = vi.fn()
    const showWarning = vi.fn()
    const createApplicationSlip = vi.fn<Promise<SlipServiceResult>, [ApplicationSlipData]>().mockResolvedValue({
      emailed: false,
      emailError: 'Queue service unavailable',
      fallbackDownloadUrl: 'https://example.com/slips/app-1.pdf',
    })

    const slipPayload: ApplicationSlipData = {
      application_id: 'app-1',
      application_number: 'MIHAS000001',
      public_tracking_code: 'TRK12345',
      status: 'submitted',
      payment_status: 'pending_review',
      submitted_at: '2026-03-07T12:00:00.000Z',
      updated_at: '2026-03-07T12:00:00.000Z',
      program_name: 'Nursing',
      intake_name: 'January 2026',
      institution: 'MIHAS',
      institution_name: 'MIHAS',
      full_name: 'Jane Student',
      email: 'student@example.com',
      phone: '+260970000000',
      nationality: 'Zambian',
      admin_feedback: null,
      admin_feedback_date: null,
    }

    let handleEmailSlip: (() => Promise<void>) | undefined

    function Harness() {
      const hook = useApplicationSlip({
        submittedApplication: {
          applicationNumber: 'MIHAS000001',
          trackingCode: 'TRK12345',
          program: 'Nursing',
          institution: 'MIHAS',
          email: 'student@example.com',
        },
        slipPayload,
        success: true,
        toast: { showSuccess, showWarning },
        createApplicationSlip: createApplicationSlip as any,
      })
      handleEmailSlip = hook.handleEmailSlip
      return null
    }

    await act(async () => {
      root.render(<Harness />)
      await flushPromises()
    })

    await act(async () => {
      await handleEmailSlip?.()
      await flushPromises()
    })

    expect(showSuccess).not.toHaveBeenCalled()
    expect(showWarning).toHaveBeenCalledTimes(1)
    const warningMessage = String(showWarning.mock.calls[0]?.[1] || '')
    expect(warningMessage).toContain('Queue service unavailable')
    expect(warningMessage).toContain('Download Slip')
  })
})
