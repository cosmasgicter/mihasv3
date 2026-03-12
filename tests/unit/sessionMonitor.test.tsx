import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const mockUseRoleVerification = vi.fn(() => ({
  roleStatus: 'verified',
  profileRole: 'student',
  authRole: 'student',
  isAdmin: false,
  hasRoleData: true,
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'student@example.com' },
  }),
}))

vi.mock('@/hooks/auth/useRoleVerification', () => ({
  useRoleVerification: () => mockUseRoleVerification(),
}))

import { SessionMonitor } from '@/components/auth/SessionMonitor'

describe('SessionMonitor runtime work', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    mockUseRoleVerification.mockClear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('does not trigger duplicate role verification queries just to render the session warning shell', () => {
    act(() => {
      root.render(<SessionMonitor />)
    })

    expect(mockUseRoleVerification).not.toHaveBeenCalled()
  })
})
