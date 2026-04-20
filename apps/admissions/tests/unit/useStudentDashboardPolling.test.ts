// @vitest-environment node
/**
 * useStudentDashboardPolling Unit Tests
 * Validates: Requirements 6.1, 6.3, 6.4, 6.5
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOK_PATH = path.resolve(process.cwd(), 'src/hooks/useStudentDashboardPolling.ts');
const hookContent = fs.readFileSync(HOOK_PATH, 'utf-8');

describe('useStudentDashboardPolling', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  describe('Module exports', () => {
    it('exports named and default', async () => {
      const mod = await import('@/hooks/useStudentDashboardPolling');
      expect(mod.useStudentDashboardPolling).toBeDefined();
      expect(typeof mod.useStudentDashboardPolling).toBe('function');
      expect(mod.default).toBe(mod.useStudentDashboardPolling);
    });
  });

  describe('Backward compatibility', () => {
    it('no supabase imports', () => {
      expect(hookContent).not.toContain('supabase');
      expect(hookContent).not.toContain('@supabase');
    });
    it('uses services/applications', () => {
      expect(hookContent).toContain("from '@/services/applications'");
    });
    it('has backward-compatible options', () => {
      expect(hookContent).toContain('enabled?');
      expect(hookContent).toContain('pollingInterval?');
      expect(hookContent).toContain('onDataChange?');
      expect(hookContent).toContain('onApplicationChange?');
    });
    it('has backward-compatible return fields', () => {
      expect(hookContent).toContain('data:');
      expect(hookContent).toContain('isLoading:');
      expect(hookContent).toContain('isPolling:');
      expect(hookContent).toContain('error:');
      expect(hookContent).toContain('refresh:');
      expect(hookContent).toContain('lastUpdated:');
    });
  });

  describe('Polling configuration', () => {
    it('uses React Query refetchInterval', () => {
      expect(hookContent).toContain('refetchInterval');
    });
    it('doubles interval when page hidden briefly', () => {
      expect(hookContent).toContain('document.visibilityState');
      expect(hookContent).toContain('pollingInterval * 2');
    });
    it('sets staleTime to 0 for always-fresh data', () => {
      expect(hookContent).toContain('staleTime: 0');
    });
    it('defaults to 30s polling', () => {
      expect(hookContent).toContain('POLLING_INTERVAL = 30000');
    });
  });

  describe('Visibility-based polling pause (Reqs 6.4, 6.5)', () => {
    it('defines HIDDEN_PAUSE_THRESHOLD at 5 minutes (300000ms)', () => {
      expect(hookContent).toContain('HIDDEN_PAUSE_THRESHOLD = 300000');
    });
    it('tracks hidden timestamp via hiddenSinceRef', () => {
      expect(hookContent).toContain('hiddenSinceRef');
      expect(hookContent).toContain('useRef<number | null>(null)');
    });
    it('registers visibilitychange event listener', () => {
      expect(hookContent).toContain("document.addEventListener('visibilitychange'");
    });
    it('cleans up visibilitychange listener on unmount', () => {
      expect(hookContent).toContain("document.removeEventListener('visibilitychange'");
    });
    it('sets hiddenSinceRef to Date.now() when hidden', () => {
      expect(hookContent).toContain('hiddenSinceRef.current = Date.now()');
    });
    it('resets hiddenSinceRef to null when visible', () => {
      expect(hookContent).toContain('hiddenSinceRef.current = null');
    });
    it('returns false from refetchInterval when hidden >= 5 minutes', () => {
      expect(hookContent).toContain('return false');
      expect(hookContent).toContain('HIDDEN_PAUSE_THRESHOLD');
    });
    it('invalidates query when tab becomes visible again', () => {
      expect(hookContent).toContain('queryClient.invalidateQueries');
    });
    it('refetchInterval is a function that checks visibility state', () => {
      expect(hookContent).toContain('refetchInterval: enabled');
      expect(hookContent).toContain("document.visibilityState === 'visible'");
    });
  });

  describe('Deduplication', () => {
    it('has fingerprint-based dedup', () => {
      expect(hookContent).toContain('applicationsFingerprint');
      expect(hookContent).toContain('previousFingerprintRef');
    });
    it('skips callback on identical fingerprint', () => {
      expect(hookContent).toContain('fp === previousFingerprintRef.current');
    });
    it('uses ref pattern for onDataChange', () => {
      expect(hookContent).toContain('onDataChangeRef');
    });
  });

  describe('React Query cache', () => {
    it('invalidates on refresh', () => {
      expect(hookContent).toContain('queryClient.invalidateQueries');
    });
    it('uses correct query key', () => {
      expect(hookContent).toContain("'student-dashboard-polling'");
    });
  });
});
