import { beforeEach, describe, expect, it, vi } from 'vitest'

import { normalizeProgramFeeResponse } from '@/pages/admin/ProgramFees'
import { adminAuditService } from '@/services/admin/audit'
import { apiClient } from '@/services/client'

vi.mock('@/services/client', async () => {
  const actual = await vi.importActual<typeof import('@/services/client')>('@/services/client')
  return {
    ...actual,
    apiClient: {
      request: vi.fn(),
    },
  }
})

describe('admin end-to-end wiring regression coverage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.request).mockReset()
  })

  it('keeps configured program fees when the backend returns a paginated results shape', () => {
    const fees = normalizeProgramFeeResponse({
      results: [
        {
          id: 'fee-1',
          program_id: 'program-1',
          fee_type: 'application',
          residency_category: 'local',
          amount: '153.00',
          currency: 'ZMW',
          is_active: true,
          created_at: '2026-04-18T00:00:00Z',
          updated_at: '2026-04-18T00:00:00Z',
        },
      ],
    })

    expect(fees).toHaveLength(1)
    expect(fees[0]).toMatchObject({ id: 'fee-1', amount: '153.00' })
  })

  it('maps audit trail StandardPagination results and current backend filters', async () => {
    vi.mocked(apiClient.request).mockResolvedValueOnce({
      page: 1,
      pageSize: 50,
      totalCount: 1,
      results: [
        {
          id: 'audit-1',
          actor_id: 'actor-1',
          action: 'user_update',
          entity_type: 'profiles',
          entity_id: 'profile-1',
          changes: { role: { old: 'student', new: 'admin' } },
          ip_address: 'hashed-ip',
          user_agent: 'hashed-agent',
          created_at: '2026-04-18T00:00:00Z',
        },
      ],
    })

    const response = await adminAuditService.list({
      action: 'user_update',
      userId: 'actor-1',
      targetTable: 'profiles',
      from: '2026-04-01T00:00:00Z',
      to: '2026-04-18T23:59:59Z',
    })

    expect(apiClient.request).toHaveBeenCalledWith(
      '/admin/audit-logs/?page=1&pageSize=50&action=user_update&actor_id=actor-1&entity_type=profiles&date_from=2026-04-01T00%3A00%3A00Z&date_to=2026-04-18T23%3A59%3A59Z'
    )
    expect(response.entries).toHaveLength(1)
    expect(response.entries[0]).toMatchObject({
      id: 'audit-1',
      action: 'user_update',
      entityType: 'profiles',
      ipAddress: 'hashed-ip',
      userAgent: 'hashed-agent',
    })
    expect(response.summary.uniqueActors).toBe(1)
    expect(response.summary.entityBreakdown).toContainEqual({ label: 'profiles', count: 1 })
  })
})
