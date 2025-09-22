import type { ReactNode } from 'react'

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { applicationsData } from '../applications'

// Mock the services
vi.mock('@/services/applications', () => ({
  applicationService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    getById: vi.fn(),
    syncGrades: vi.fn(),
    updateStatus: vi.fn()
  }
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          count: 10
        })),
        gte: vi.fn(() => ({
          count: 5
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => ({
            data: []
          }))
        })),
        count: 10
      }))
    }))
  }
}))

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  })
  
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('applicationsData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should provide useList hook', () => {
    const wrapper = createWrapper()
    
    const { result } = renderHook(
      () => applicationsData.useList({ page: 0, pageSize: 10 }),
      { wrapper }
    )

    expect(result.current).toBeDefined()
    expect(typeof result.current.data).toBe('undefined') // Initially undefined
    expect(typeof result.current.isLoading).toBe('boolean')
  })

  it('should provide useStats hook', () => {
    const wrapper = createWrapper()
    
    const { result } = renderHook(
      () => applicationsData.useStats(),
      { wrapper }
    )

    expect(result.current).toBeDefined()
    expect(typeof result.current.isLoading).toBe('boolean')
  })

  it('should provide mutation hooks', () => {
    const wrapper = createWrapper()
    
    const { result: createResult } = renderHook(
      () => applicationsData.useCreate(),
      { wrapper }
    )
    
    const { result: updateResult } = renderHook(
      () => applicationsData.useUpdate(),
      { wrapper }
    )

    expect(createResult.current.mutate).toBeDefined()
    expect(updateResult.current.mutate).toBeDefined()
  })
})