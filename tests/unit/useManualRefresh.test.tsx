import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockResetQueries = vi.fn(() => Promise.resolve())
const mockRefetchQueries = vi.fn(() => Promise.resolve())

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    resetQueries: mockResetQueries,
    refetchQueries: mockRefetchQueries,
  }),
}))

import { useManualRefresh, type UseManualRefreshReturn } from '@/hooks/useManualRefresh'

describe('useManualRefresh', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let latestHook: UseManualRefreshReturn | null = null

  function HookHarness() {
    latestHook = useManualRefresh({
      queryKeys: [['applications']],
    })
    return null
  }

  beforeEach(() => {
    latestHook = null
    mockResetQueries.mockClear()
    mockRefetchQueries.mockClear()
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

  it('deduplicates overlapping refresh requests from the same render frame', async () => {
    expect(latestHook).not.toBeNull()

    await act(async () => {
      await Promise.all([
        latestHook!.forceRefresh(),
        latestHook!.forceRefresh(),
      ])
    })

    expect(mockResetQueries).toHaveBeenCalledTimes(1)
    expect(mockRefetchQueries).toHaveBeenCalledTimes(1)
  })
})
