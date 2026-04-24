import React, { useEffect } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePaymentStatus } from '@/hooks/usePaymentStatus'
import { apiClient } from '@/services/client'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/services/client', () => ({
  apiClient: {
    request: vi.fn(),
  },
}))

describe('usePaymentStatus', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  it('verifies the latest pending payment and promotes it to successful', async () => {
    const requestMock = vi.mocked(apiClient.request)
    const observedStatuses: Array<string | null> = []

    requestMock
      .mockResolvedValueOnce([
        {
          id: 'payment-1',
          status: 'pending',
          created_at: '2026-04-24T19:20:25.000Z',
        },
      ] as never)
      .mockResolvedValueOnce({
        status: 'successful',
      } as never)

    function Harness() {
      const { status } = usePaymentStatus('app-1', null)

      useEffect(() => {
        observedStatuses.push(status)
      }, [status])

      return null
    }

    await act(async () => {
      root.render(React.createElement(Harness))
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(requestMock).toHaveBeenNthCalledWith(
      1,
      '/payments/?application_id=app-1'
    )
    expect(requestMock).toHaveBeenNthCalledWith(
      2,
      '/payments/payment-1/verify/',
      { method: 'POST' }
    )
    expect(observedStatuses).toContain('successful')
  })
})
