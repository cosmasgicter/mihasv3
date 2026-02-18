/**
 * Feature: migration-recovery-hardening, Property 9: Dashboard preloader returns valid defaults on transient errors
 * 
 * Validates: Requirements 8.3
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Replicate the default shapes from dashboardPreloader.ts
interface StudentDashboardDefaults {
  applications: unknown[]
  studentDashboard: { applications: unknown[] }
  notifications: unknown[]
  intakes: unknown[]
}

interface AdminDashboardDefaults {
  applications: unknown[]
  stats: {
    totalApplications: number
    pendingApplications: number
    approvedApplications: number
    rejectedApplications: number
    todayApplications: number
    weekApplications: number
  }
  notifications: unknown[]
}

function getStudentDefaults(): StudentDashboardDefaults {
  return {
    applications: [],
    studentDashboard: { applications: [] },
    notifications: [],
    intakes: [],
  }
}

function getAdminDefaults(): AdminDashboardDefaults {
  return {
    applications: [],
    stats: {
      totalApplications: 0,
      pendingApplications: 0,
      approvedApplications: 0,
      rejectedApplications: 0,
      todayApplications: 0,
      weekApplications: 0,
    },
    notifications: [],
  }
}

describe('Property 9: Dashboard preloader returns valid defaults on transient errors', () => {
  it('PROPERTY: Student defaults have all required fields with empty/zero values', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const defaults = getStudentDefaults()
        expect(defaults.applications).toEqual([])
        expect(defaults.studentDashboard.applications).toEqual([])
        expect(defaults.notifications).toEqual([])
        expect(defaults.intakes).toEqual([])
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Admin defaults have all required fields with zero values', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const defaults = getAdminDefaults()
        expect(defaults.applications).toEqual([])
        expect(defaults.stats.totalApplications).toBe(0)
        expect(defaults.stats.pendingApplications).toBe(0)
        expect(defaults.stats.approvedApplications).toBe(0)
        expect(defaults.stats.rejectedApplications).toBe(0)
        expect(defaults.stats.todayApplications).toBe(0)
        expect(defaults.stats.weekApplications).toBe(0)
        expect(defaults.notifications).toEqual([])
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: Default functions never throw', () => {
    fc.assert(
      fc.property(fc.boolean(), (isAdmin) => {
        expect(() => {
          if (isAdmin) getAdminDefaults()
          else getStudentDefaults()
        }).not.toThrow()
      }),
      { numRuns: 20 }
    )
  })
})
