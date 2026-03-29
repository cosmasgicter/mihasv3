import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/useBulkOperations', () => ({
  useBulkOperations: () => ({
    bulkUpdateStatus: vi.fn(),
    bulkUpdatePaymentStatus: vi.fn(),
  }),
}))

import { useApplicationBulkActions } from '@/hooks/admin/useApplicationBulkActions'

type HookState = ReturnType<typeof useApplicationBulkActions>

describe('useApplicationBulkActions', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latestHook: HookState | null = null

  function HookHarness() {
    latestHook = useApplicationBulkActions()
    return null
  }

  beforeEach(() => {
    latestHook = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<HookHarness />)
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('toggles select-all from current state even when called twice before rerender', () => {
    expect(latestHook).not.toBeNull()

    act(() => {
      latestHook!.selectAll(['app-1', 'app-2'])
      latestHook!.selectAll(['app-1', 'app-2'])
    })

    expect(latestHook!.selectedApplications).toEqual([])
  })
})
