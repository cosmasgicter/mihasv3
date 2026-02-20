/**
 * Zod response schemas for API contract tests
 * These schemas define the expected shape of API responses
 */
import { z } from 'zod'

export const ApplicationListResponseSchema = z.object({
  applications: z.array(z.object({
    id: z.string(),
    application_number: z.string(),
    status: z.string(),
    program: z.string().nullable(),
    payment_status: z.string().nullable(),
    created_at: z.string(),
  })),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const AdminStatsResponseSchema = z.object({
  totalApplications: z.number(),
  pendingApplications: z.number().optional(),
  approvedApplications: z.number().optional(),
  rejectedApplications: z.number().optional(),
  statusBreakdown: z.record(z.string(), z.number()).optional(),
  programBreakdown: z.record(z.string(), z.number()).optional(),
  generatedAt: z.string().optional(),
})

export const AdminDashboardResponseSchema = z.object({
  totalApplications: z.number(),
  pendingReview: z.number(),
  approved: z.number(),
  rejected: z.number(),
  totalUsers: z.number(),
  recentApplications: z.array(z.object({
    id: z.string(),
    application_number: z.string(),
    status: z.string(),
  })),
})

export const AuditLogResponseSchema = z.object({
  entries: z.array(z.object({
    id: z.string(),
    action: z.string(),
    entity_type: z.string(),
    entity_id: z.string(),
    created_at: z.string(),
  })),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
  totalCount: z.number(),
})

export const AppealsResponseSchema = z.object({
  appeals: z.array(z.object({
    id: z.string(),
    application_id: z.string(),
    status: z.string(),
    appeal_type: z.string(),
    created_at: z.string(),
  })),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
})

export const CatalogProgramsResponseSchema = z.object({
  programs: z.array(z.object({
    id: z.string(),
    name: z.string(),
    is_active: z.boolean(),
  })),
})

export const CatalogIntakesResponseSchema = z.object({
  intakes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    is_active: z.boolean(),
    application_deadline: z.string(),
  })),
})

export const AuthSessionResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }).nullable(),
})

export const NotificationPreferencesResponseSchema = z.object({
  user_id: z.string(),
  email_enabled: z.boolean(),
  push_enabled: z.boolean(),
})

export const AdminUsersResponseSchema = z.object({
  users: z.array(z.object({
    id: z.string(),
    user_id: z.string(),
    email: z.string(),
    role: z.string(),
  }).passthrough()),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
})
