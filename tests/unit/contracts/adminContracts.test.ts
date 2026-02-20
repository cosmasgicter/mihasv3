/**
 * Contract tests for API response shapes
 * Validates that sample responses conform to Zod schemas
 */
import { describe, it, expect } from 'vitest'
import {
  ApplicationListResponseSchema,
  AdminStatsResponseSchema,
  AdminDashboardResponseSchema,
  AuditLogResponseSchema,
  AppealsResponseSchema,
  CatalogProgramsResponseSchema,
  CatalogIntakesResponseSchema,
  AuthSessionResponseSchema,
  NotificationPreferencesResponseSchema,
  AdminUsersResponseSchema,
} from './schemas'

describe('API Contract Tests', () => {
  it('validates ApplicationListResponse shape', () => {
    const sample = {
      applications: [{ id: '1', application_number: 'APP-001', status: 'submitted', program: 'Nursing', payment_status: 'pending_review', created_at: '2026-01-01T00:00:00Z' }],
      totalCount: 1, page: 1, pageSize: 10,
    }
    expect(ApplicationListResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('rejects ApplicationListResponse missing applications', () => {
    expect(ApplicationListResponseSchema.safeParse({ totalCount: 0, page: 1, pageSize: 10 }).success).toBe(false)
  })

  it('validates AdminStatsResponse shape', () => {
    const sample = { totalApplications: 50, pendingApplications: 10, approvedApplications: 30, rejectedApplications: 10 }
    expect(AdminStatsResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AdminDashboardResponse shape', () => {
    const sample = {
      totalApplications: 100, pendingReview: 20, approved: 60, rejected: 20, totalUsers: 150,
      recentApplications: [{ id: '1', application_number: 'APP-001', status: 'submitted' }],
    }
    expect(AdminDashboardResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AuditLogResponse shape', () => {
    const sample = {
      entries: [{ id: '1', action: 'login', entity_type: 'user', entity_id: 'u1', created_at: '2026-01-01T00:00:00Z' }],
      page: 1, pageSize: 20, totalPages: 1, totalCount: 1,
    }
    expect(AuditLogResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AppealsResponse shape', () => {
    const sample = {
      appeals: [{ id: '1', application_id: 'a1', status: 'pending', appeal_type: 'grade_review', created_at: '2026-01-01T00:00:00Z' }],
      totalCount: 1, page: 1, pageSize: 10,
    }
    expect(AppealsResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates CatalogProgramsResponse shape', () => {
    const sample = { programs: [{ id: '1', name: 'Nursing', is_active: true }] }
    expect(CatalogProgramsResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates CatalogIntakesResponse shape', () => {
    const sample = { intakes: [{ id: '1', name: 'Jan 2026', is_active: true, application_deadline: '2025-12-31' }] }
    expect(CatalogIntakesResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AuthSessionResponse shape', () => {
    const sample = { user: { id: '1', email: 'test@example.com', role: 'student', firstName: 'Test', lastName: 'User' } }
    expect(AuthSessionResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AuthSessionResponse with null user', () => {
    expect(AuthSessionResponseSchema.safeParse({ user: null }).success).toBe(true)
  })

  it('validates NotificationPreferencesResponse shape', () => {
    const sample = { user_id: '1', email_enabled: true, push_enabled: false }
    expect(NotificationPreferencesResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AdminUsersResponse shape', () => {
    const sample = {
      users: [{ id: 'u1', user_id: 'u1', email: 'test@example.com', role: 'student', first_name: 'Test', last_name: 'User', created_at: '2026-01-01T00:00:00Z' }],
      totalCount: 1, page: 1, pageSize: 50, totalPages: 1,
    }
    expect(AdminUsersResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('validates AdminUsersResponse with empty users array', () => {
    const sample = {
      users: [],
      totalCount: 0, page: 1, pageSize: 50, totalPages: 0,
    }
    expect(AdminUsersResponseSchema.safeParse(sample).success).toBe(true)
  })

  it('rejects AdminUsersResponse missing users array', () => {
    expect(AdminUsersResponseSchema.safeParse({ totalCount: 0, page: 1, pageSize: 50, totalPages: 0 }).success).toBe(false)
  })
})
