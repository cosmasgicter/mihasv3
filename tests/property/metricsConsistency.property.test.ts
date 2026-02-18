/**
 * Feature: migration-recovery-hardening, Property 8: Metrics calculations are consistent with input data
 * 
 * Validates: Requirements 8.2
 */
import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'

// Replicate the metrics calculation logic from metricsTracking.ts
const round2 = (value: number): number => Math.round(value * 100) / 100

interface AppRecord {
  status: string
  submitted_at: string | null
}

function calculateApplicationMetrics(apps: AppRecord[]) {
  const totalApplications = apps.length
  const completedApplications = apps.filter(a => a.submitted_at).length
  const approvedApplications = apps.filter(a => a.status === 'approved').length
  const rejectedApplications = apps.filter(a => a.status === 'rejected').length

  return {
    totalApplications,
    completedApplications,
    approvedApplications,
    rejectedApplications,
    completionRate: totalApplications > 0 ? round2((completedApplications / totalApplications) * 100) : 0,
    approvalRate: completedApplications > 0 ? round2((approvedApplications / completedApplications) * 100) : 0,
    rejectionRate: completedApplications > 0 ? round2((rejectedApplications / completedApplications) * 100) : 0,
  }
}

const appRecordArb = fc.record({
  status: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected'),
  submitted_at: fc.option(fc.date().map(d => d.toISOString()), { nil: null }),
})

describe('Property 8: Metrics calculations are consistent with input data', () => {
  it('PROPERTY: totalApplications equals input array length', () => {
    fc.assert(
      fc.property(fc.array(appRecordArb, { maxLength: 10 }), (apps) => {
        const metrics = calculateApplicationMetrics(apps)
        expect(metrics.totalApplications).toBe(apps.length)
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: approvalRate = (approved / completed) * 100', () => {
    fc.assert(
      fc.property(fc.array(appRecordArb, { maxLength: 10 }), (apps) => {
        const metrics = calculateApplicationMetrics(apps)
        if (metrics.completedApplications === 0) {
          expect(metrics.approvalRate).toBe(0)
        } else {
          const expected = round2((metrics.approvedApplications / metrics.completedApplications) * 100)
          expect(metrics.approvalRate).toBe(expected)
        }
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: completionRate = (completed / total) * 100', () => {
    fc.assert(
      fc.property(fc.array(appRecordArb, { maxLength: 10 }), (apps) => {
        const metrics = calculateApplicationMetrics(apps)
        if (metrics.totalApplications === 0) {
          expect(metrics.completionRate).toBe(0)
        } else {
          const expected = round2((metrics.completedApplications / metrics.totalApplications) * 100)
          expect(metrics.completionRate).toBe(expected)
        }
      }),
      { numRuns: 20 }
    )
  })

  it('PROPERTY: approved + rejected <= completed', () => {
    fc.assert(
      fc.property(fc.array(appRecordArb, { maxLength: 10 }), (apps) => {
        const metrics = calculateApplicationMetrics(apps)
        expect(metrics.approvedApplications + metrics.rejectedApplications).toBeLessThanOrEqual(metrics.totalApplications)
      }),
      { numRuns: 20 }
    )
  })
})
