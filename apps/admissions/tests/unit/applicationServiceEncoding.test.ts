/**
 * Tests that application service endpoints encode IDs (Phase 3 fix).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock apiClient before importing the service
const mockRequest = vi.fn().mockResolvedValue({})
vi.mock('@/services/client', () => ({
  apiClient: { request: mockRequest },
  AuthenticationError: class extends Error {},
}))

// Must import after mock
const { applicationService } = await import('@/services/applications')

const UNSAFE_ID = 'abc/../def?x=1'
const ENCODED = encodeURIComponent(UNSAFE_ID)

describe('application service URL encoding', () => {
  beforeEach(() => {
    mockRequest.mockClear()
    mockRequest.mockResolvedValue({})
  })

  it('withdraw encodes application ID', async () => {
    await applicationService.withdraw(UNSAFE_ID, 'test reason for withdrawal').catch(() => {})
    expect(mockRequest).toHaveBeenCalled()
    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toContain(ENCODED)
    expect(url).not.toContain(UNSAFE_ID)
  })

  it('getWaitlistPosition encodes application ID', async () => {
    await applicationService.getWaitlistPosition(UNSAFE_ID).catch(() => {})
    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toContain(ENCODED)
  })

  it('getConditions encodes application ID', async () => {
    await applicationService.getConditions(UNSAFE_ID).catch(() => {})
    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toContain(ENCODED)
  })

  it('submitAmendment encodes application ID', async () => {
    await applicationService.submitAmendment(UNSAFE_ID, {
      field_name: 'phone',
      new_value: '123',
      reason: 'test',
    }).catch(() => {})
    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toContain(ENCODED)
  })

  it('assignReviewer encodes application ID', async () => {
    await applicationService.assignReviewer(UNSAFE_ID, 'reviewer-1').catch(() => {})
    const url = mockRequest.mock.calls[0][0] as string
    expect(url).toContain(ENCODED)
  })
})
