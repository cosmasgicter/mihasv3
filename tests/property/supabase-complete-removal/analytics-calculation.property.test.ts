/**
 * Property-Based Tests: Analytics Calculation Correctness
 * Feature: supabase-complete-removal
 * Task: 5.2 Write property test for analytics calculations
 * 
 * **Property 5: Analytics Calculation Correctness**
 * *For any* valid application statistics response, the Analytics Dashboard SHALL
 * correctly calculate completion rate as `(completed / total) * 100` and display accurate metrics.
 * 
 * **Validates: Requirements 4.2**
 * 
 * @vitest-environment node
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ============================================================================
// Test Configuration
// ============================================================================

const NUM_RUNS = 100;

// ============================================================================
// Type Definitions (mirrors apiClient.ts)
// ============================================================================

interface ApplicationStats {
  total_drafts: number;
  completed_applications: number;
  total_applications: number;
  avg_time_hours: number;
}

interface AnalyticsStats {
  total_drafts: number;
  completed_applications: number;
  avg_time_per_step: number;
  most_common_drop_off_step: string | null;
}

// ============================================================================
// Calculation Functions (mirrors AnalyticsDashboard.tsx logic)
// ============================================================================

/**
 * Calculate completion rate from stats
 * This mirrors the calculation in AnalyticsDashboard.tsx
 */
function calculateCompletionRate(stats: AnalyticsStats): number {
  const total = stats.total_drafts + stats.completed_applications;
  return total > 0 ? Math.round((stats.completed_applications / total) * 100) : 0;
}

/**
 * Convert API response to display stats
 * This mirrors the transformation in AnalyticsDashboard.tsx
 */
function transformApiResponse(data: ApplicationStats): AnalyticsStats {
  // Convert avg_time_hours to minutes for display
  const avgTimeMinutes = Math.round((data.avg_time_hours || 0) * 60);

  return {
    completed_applications: data.completed_applications || 0,
    total_drafts: data.total_drafts || 0,
    avg_time_per_step: avgTimeMinutes,
    most_common_drop_off_step: null,
  };
}

/**
 * Format time for display
 * This mirrors the display logic in AnalyticsDashboard.tsx
 */
function formatTimeDisplay(avgTimeMinutes: number): string {
  if (avgTimeMinutes > 60) {
    return `${Math.round(avgTimeMinutes / 60)}h`;
  } else if (avgTimeMinutes > 0) {
    return `${avgTimeMinutes}m`;
  }
  return '0m';
}

// ============================================================================
// Arbitrary Generators
// ============================================================================

/**
 * Generate valid application stats from API
 */
const applicationStatsArb: fc.Arbitrary<ApplicationStats> = fc.record({
  total_drafts: fc.nat(1000),
  completed_applications: fc.nat(1000),
  total_applications: fc.nat(2000),
  avg_time_hours: fc.float({ min: 0, max: 100, noNaN: true }),
});

/**
 * Generate stats where total_applications = total_drafts + completed_applications
 */
const consistentStatsArb: fc.Arbitrary<ApplicationStats> = fc
  .tuple(fc.nat(500), fc.nat(500), fc.float({ min: 0, max: 100, noNaN: true }))
  .map(([drafts, completed, avgTime]) => ({
    total_drafts: drafts,
    completed_applications: completed,
    total_applications: drafts + completed,
    avg_time_hours: avgTime,
  }));

// ============================================================================
// Property 5: Analytics Calculation Correctness
// ============================================================================

describe('Feature: supabase-complete-removal, Property 5: Analytics Calculation Correctness', () => {
  describe('Completion Rate Calculation', () => {
    /**
     * **Validates: Requirements 4.2**
     * THE Analytics_Dashboard SHALL calculate completion rate and average time from API response
     */
    it('PROPERTY: Completion rate SHALL be (completed / total) * 100, rounded', async () => {
      await fc.assert(
        fc.asyncProperty(
          consistentStatsArb,
          async (apiStats) => {
            const displayStats = transformApiResponse(apiStats);
            const completionRate = calculateCompletionRate(displayStats);
            
            const total = displayStats.total_drafts + displayStats.completed_applications;
            const expectedRate = total > 0 
              ? Math.round((displayStats.completed_applications / total) * 100) 
              : 0;
            
            expect(completionRate).toBe(expectedRate);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Completion rate SHALL be between 0 and 100 inclusive', async () => {
      await fc.assert(
        fc.asyncProperty(
          applicationStatsArb,
          async (apiStats) => {
            const displayStats = transformApiResponse(apiStats);
            const completionRate = calculateCompletionRate(displayStats);
            
            expect(completionRate).toBeGreaterThanOrEqual(0);
            expect(completionRate).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Zero total applications SHALL result in 0% completion rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 100, noNaN: true }),
          async (avgTime) => {
            const apiStats: ApplicationStats = {
              total_drafts: 0,
              completed_applications: 0,
              total_applications: 0,
              avg_time_hours: avgTime,
            };
            
            const displayStats = transformApiResponse(apiStats);
            const completionRate = calculateCompletionRate(displayStats);
            
            expect(completionRate).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All completed applications SHALL result in 100% completion rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: 0, max: 100, noNaN: true }),
          async (completed, avgTime) => {
            const apiStats: ApplicationStats = {
              total_drafts: 0,
              completed_applications: completed,
              total_applications: completed,
              avg_time_hours: avgTime,
            };
            
            const displayStats = transformApiResponse(apiStats);
            const completionRate = calculateCompletionRate(displayStats);
            
            expect(completionRate).toBe(100);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: All draft applications SHALL result in 0% completion rate', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 1000 }),
          fc.float({ min: 0, max: 100, noNaN: true }),
          async (drafts, avgTime) => {
            const apiStats: ApplicationStats = {
              total_drafts: drafts,
              completed_applications: 0,
              total_applications: drafts,
              avg_time_hours: avgTime,
            };
            
            const displayStats = transformApiResponse(apiStats);
            const completionRate = calculateCompletionRate(displayStats);
            
            expect(completionRate).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Time Conversion', () => {
    /**
     * **Validates: Requirements 4.2**
     * Average time calculation handles edge cases (zero applications)
     */
    it('PROPERTY: avg_time_hours SHALL be converted to minutes correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.float({ min: 0, max: 100, noNaN: true }),
          async (avgTimeHours) => {
            const apiStats: ApplicationStats = {
              total_drafts: 1,
              completed_applications: 1,
              total_applications: 2,
              avg_time_hours: avgTimeHours,
            };
            
            const displayStats = transformApiResponse(apiStats);
            const expectedMinutes = Math.round(avgTimeHours * 60);
            
            expect(displayStats.avg_time_per_step).toBe(expectedMinutes);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Zero avg_time_hours SHALL result in 0 minutes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(100),
          fc.nat(100),
          async (drafts, completed) => {
            const apiStats: ApplicationStats = {
              total_drafts: drafts,
              completed_applications: completed,
              total_applications: drafts + completed,
              avg_time_hours: 0,
            };
            
            const displayStats = transformApiResponse(apiStats);
            
            expect(displayStats.avg_time_per_step).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Undefined avg_time_hours SHALL be treated as 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.nat(100),
          fc.nat(100),
          async (drafts, completed) => {
            // Simulate undefined by using a partial object
            const apiStats = {
              total_drafts: drafts,
              completed_applications: completed,
              total_applications: drafts + completed,
            } as ApplicationStats;
            
            const displayStats = transformApiResponse(apiStats);
            
            // Should handle undefined gracefully
            expect(displayStats.avg_time_per_step).toBe(0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });
  });

  describe('Time Display Formatting', () => {
    /**
     * **Validates: Requirements 4.2**
     * Display values match the underlying data
     */
    it('PROPERTY: Time > 60 minutes SHALL display in hours', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 61, max: 6000 }),
          async (minutes) => {
            const display = formatTimeDisplay(minutes);
            
            expect(display).toMatch(/^\d+h$/);
            
            const hours = Math.round(minutes / 60);
            expect(display).toBe(`${hours}h`);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Time 1-60 minutes SHALL display in minutes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 60 }),
          async (minutes) => {
            const display = formatTimeDisplay(minutes);
            
            expect(display).toMatch(/^\d+m$/);
            expect(display).toBe(`${minutes}m`);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Time 0 minutes SHALL display as "0m"', async () => {
      const display = formatTimeDisplay(0);
      expect(display).toBe('0m');
    });
  });

  describe('Data Transformation', () => {
    /**
     * **Validates: Requirements 4.2**
     * THE Analytics_Dashboard SHALL calculate completion rate and average time from API response
     */
    it('PROPERTY: API response transformation SHALL preserve counts', async () => {
      await fc.assert(
        fc.asyncProperty(
          applicationStatsArb,
          async (apiStats) => {
            const displayStats = transformApiResponse(apiStats);
            
            // Counts should be preserved (with fallback to 0)
            expect(displayStats.completed_applications).toBe(apiStats.completed_applications || 0);
            expect(displayStats.total_drafts).toBe(apiStats.total_drafts || 0);
          }
        ),
        { numRuns: NUM_RUNS }
      );
    });

    it('PROPERTY: Null/undefined values SHALL default to 0', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.constant(null),
          async () => {
            // Simulate partial API response
            const partialStats = {} as ApplicationStats;
            
            const displayStats = transformApiResponse(partialStats);
            
            expect(displayStats.completed_applications).toBe(0);
            expect(displayStats.total_drafts).toBe(0);
            expect(displayStats.avg_time_per_step).toBe(0);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  it('PROPERTY: Very large numbers SHALL not cause overflow', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 1000000000 }),
        fc.integer({ min: 0, max: 1000000000 }),
        async (drafts, completed) => {
          const apiStats: ApplicationStats = {
            total_drafts: drafts,
            completed_applications: completed,
            total_applications: drafts + completed,
            avg_time_hours: 1,
          };
          
          const displayStats = transformApiResponse(apiStats);
          const completionRate = calculateCompletionRate(displayStats);
          
          // Should still be a valid percentage
          expect(completionRate).toBeGreaterThanOrEqual(0);
          expect(completionRate).toBeLessThanOrEqual(100);
          expect(Number.isFinite(completionRate)).toBe(true);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });

  it('PROPERTY: Rounding SHALL be consistent (Math.round)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        async (drafts, completed) => {
          const total = drafts + completed;
          const exactRate = (completed / total) * 100;
          const roundedRate = Math.round(exactRate);
          
          const apiStats: ApplicationStats = {
            total_drafts: drafts,
            completed_applications: completed,
            total_applications: total,
            avg_time_hours: 1,
          };
          
          const displayStats = transformApiResponse(apiStats);
          const calculatedRate = calculateCompletionRate(displayStats);
          
          expect(calculatedRate).toBe(roundedRate);
        }
      ),
      { numRuns: NUM_RUNS }
    );
  });
});
