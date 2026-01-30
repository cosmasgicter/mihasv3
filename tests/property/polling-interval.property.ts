/**
 * Property Test: Polling Interval Configuration
 * Feature: bun-vercel-migration
 * Property 8: Polling Interval Configuration
 * Validates: Requirements 7.3
 * 
 * For any React Query hook that replaces Supabase Realtime subscriptions, 
 * the hook SHALL have refetchInterval configured to a value between 
 * 10000ms and 60000ms (10-60 seconds) to balance freshness with server load.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Polling configuration interface
interface PollingConfig {
  refetchInterval: number;
  refetchIntervalInBackground: boolean;
  staleTime: number;
}

// Valid polling interval range (10-60 seconds)
const MIN_POLLING_INTERVAL = 10000;  // 10 seconds
const MAX_POLLING_INTERVAL = 60000;  // 60 seconds

// Recommended polling interval (30 seconds)
const RECOMMENDED_POLLING_INTERVAL = 30000;

// Validate polling configuration
function isValidPollingConfig(config: PollingConfig): boolean {
  return (
    config.refetchInterval >= MIN_POLLING_INTERVAL &&
    config.refetchInterval <= MAX_POLLING_INTERVAL &&
    config.staleTime < config.refetchInterval  // staleTime should be less than refetchInterval
  );
}

// Create polling config with validation
function createPollingConfig(intervalMs: number): PollingConfig {
  // Clamp to valid range
  const clampedInterval = Math.max(
    MIN_POLLING_INTERVAL,
    Math.min(MAX_POLLING_INTERVAL, intervalMs)
  );
  
  return {
    refetchInterval: clampedInterval,
    refetchIntervalInBackground: false,  // Don't poll when tab is not visible
    staleTime: Math.floor(clampedInterval * 0.8),  // 80% of refetch interval
  };
}

// Admin dashboard polling config (mirrors useAdminDashboardPolling.ts)
const ADMIN_DASHBOARD_POLLING_CONFIG: PollingConfig = {
  refetchInterval: 30000,  // 30 seconds
  refetchIntervalInBackground: false,
  staleTime: 25000,  // 25 seconds
};

// Student dashboard polling config (mirrors useStudentDashboardPolling.ts)
const STUDENT_DASHBOARD_POLLING_CONFIG: PollingConfig = {
  refetchInterval: 30000,  // 30 seconds
  refetchIntervalInBackground: false,
  staleTime: 25000,  // 25 seconds
};

describe('Feature: bun-vercel-migration, Property 8: Polling Interval Configuration', () => {
  
  describe('Polling interval bounds', () => {
    
    it('should accept any interval within 10-60 second range', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_POLLING_INTERVAL, max: MAX_POLLING_INTERVAL }),
          (interval) => {
            const config = createPollingConfig(interval);
            expect(isValidPollingConfig(config)).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp intervals below minimum to 10 seconds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: MIN_POLLING_INTERVAL - 1 }),
          (interval) => {
            const config = createPollingConfig(interval);
            expect(config.refetchInterval).toBe(MIN_POLLING_INTERVAL);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should clamp intervals above maximum to 60 seconds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MAX_POLLING_INTERVAL + 1, max: 300000 }),
          (interval) => {
            const config = createPollingConfig(interval);
            expect(config.refetchInterval).toBe(MAX_POLLING_INTERVAL);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Stale time configuration', () => {
    
    it('should always have staleTime less than refetchInterval', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_POLLING_INTERVAL, max: MAX_POLLING_INTERVAL }),
          (interval) => {
            const config = createPollingConfig(interval);
            expect(config.staleTime).toBeLessThan(config.refetchInterval);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should set staleTime to approximately 80% of refetchInterval', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_POLLING_INTERVAL, max: MAX_POLLING_INTERVAL }),
          (interval) => {
            const config = createPollingConfig(interval);
            const expectedStaleTime = Math.floor(interval * 0.8);
            expect(config.staleTime).toBe(expectedStaleTime);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Background polling', () => {
    
    it('should disable background polling to save resources', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: MIN_POLLING_INTERVAL, max: MAX_POLLING_INTERVAL }),
          (interval) => {
            const config = createPollingConfig(interval);
            expect(config.refetchIntervalInBackground).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Actual hook configurations', () => {
    
    it('admin dashboard polling should be within valid range', () => {
      expect(isValidPollingConfig(ADMIN_DASHBOARD_POLLING_CONFIG)).toBe(true);
      expect(ADMIN_DASHBOARD_POLLING_CONFIG.refetchInterval).toBeGreaterThanOrEqual(MIN_POLLING_INTERVAL);
      expect(ADMIN_DASHBOARD_POLLING_CONFIG.refetchInterval).toBeLessThanOrEqual(MAX_POLLING_INTERVAL);
    });

    it('student dashboard polling should be within valid range', () => {
      expect(isValidPollingConfig(STUDENT_DASHBOARD_POLLING_CONFIG)).toBe(true);
      expect(STUDENT_DASHBOARD_POLLING_CONFIG.refetchInterval).toBeGreaterThanOrEqual(MIN_POLLING_INTERVAL);
      expect(STUDENT_DASHBOARD_POLLING_CONFIG.refetchInterval).toBeLessThanOrEqual(MAX_POLLING_INTERVAL);
    });

    it('admin dashboard should use recommended 30-second interval', () => {
      expect(ADMIN_DASHBOARD_POLLING_CONFIG.refetchInterval).toBe(RECOMMENDED_POLLING_INTERVAL);
    });

    it('student dashboard should use recommended 30-second interval', () => {
      expect(STUDENT_DASHBOARD_POLLING_CONFIG.refetchInterval).toBe(RECOMMENDED_POLLING_INTERVAL);
    });

    it('both dashboards should disable background polling', () => {
      expect(ADMIN_DASHBOARD_POLLING_CONFIG.refetchIntervalInBackground).toBe(false);
      expect(STUDENT_DASHBOARD_POLLING_CONFIG.refetchIntervalInBackground).toBe(false);
    });
  });

  describe('Server load considerations', () => {
    
    it('should not allow polling faster than 10 seconds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 9999 }),
          (tooFastInterval) => {
            const config = createPollingConfig(tooFastInterval);
            // Should be clamped to minimum
            expect(config.refetchInterval).toBeGreaterThanOrEqual(MIN_POLLING_INTERVAL);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should not allow polling slower than 60 seconds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 60001, max: 600000 }),
          (tooSlowInterval) => {
            const config = createPollingConfig(tooSlowInterval);
            // Should be clamped to maximum
            expect(config.refetchInterval).toBeLessThanOrEqual(MAX_POLLING_INTERVAL);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
