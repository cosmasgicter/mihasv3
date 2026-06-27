import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseCapabilities = vi.fn()

vi.mock('@/contexts/CapabilityContext', () => ({
  useCapabilities: () => mockUseCapabilities(),
}))

vi.mock('@/pages/admin/tenants/SuperAdminTenantConsole', () => ({
  SuperAdminTenantConsole: () => <div>super admin tenant console</div>,
}))

vi.mock('@/pages/admin/tenants/TenantAdminSchoolConsole', () => ({
  TenantAdminSchoolConsole: () => <div>tenant admin school console</div>,
}))

import AdminTenants from '@/pages/admin/Tenants'

describe('tenant console authority boundaries', () => {
  beforeEach(() => {
    mockUseCapabilities.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the platform tenant console for super admins', () => {
    mockUseCapabilities.mockReturnValue({ isSuperAdmin: true, isTenantAdmin: false, isLoading: false })

    const { queryByText } = render(<AdminTenants />)

    expect(queryByText('super admin tenant console')).toBeTruthy()
    expect(queryByText('tenant admin school console')).toBeNull()
  })

  it('renders only the scoped school console for tenant admins', () => {
    mockUseCapabilities.mockReturnValue({ isSuperAdmin: false, isTenantAdmin: true, isLoading: false })

    const { queryByText } = render(<AdminTenants />)

    expect(queryByText('tenant admin school console')).toBeTruthy()
    expect(queryByText('super admin tenant console')).toBeNull()
  })

  it('renders no tenant data when the admin has no scope', () => {
    mockUseCapabilities.mockReturnValue({ isSuperAdmin: false, isTenantAdmin: false, isLoading: false })

    const { queryByText } = render(<AdminTenants />)

    expect(queryByText('No access')).toBeTruthy()
    expect(queryByText('super admin tenant console')).toBeNull()
    expect(queryByText('tenant admin school console')).toBeNull()
  })
})
