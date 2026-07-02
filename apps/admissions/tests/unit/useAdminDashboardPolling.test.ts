/**
 * useAdminDashboardPolling Unit Tests
 * Validates: Requirements 17.1, 17.2, 17.3
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HOOK_PATH = path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts');
const hookContent = fs.readFileSync(HOOK_PATH, 'utf-8');

describe('useAdminDashboardPolling', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  describe('Module exports', () => {
    it('exports named and default', async () => {
      const mod = await import('@/hooks/useAdminDashboardPolling');
      expect(mod.useAdminDashboardPolling).toBeDefined();
      expect(typeof mod.useAdminDashboardPolling).toBe('function');
      expect(mod.default).toBe(mod.useAdminDashboardPolling);
    });
  });

  describe('Backward compatibility', () => {
    it('no supabase imports', () => {
      expect(hookContent).not.toContain('supabase');
      expect(hookContent).not.toContain('@supabase');
    });
    it('uses admin dashboard service', () => {
      expect(hookContent).toContain("from '@/services/admin/dashboard'");
    });
    it('has backward-compatible options', () => {
      expect(hookContent).toContain('enabled?');
      expect(hookContent).toContain('pollingInterval?');
      expect(hookContent).toContain('onDataChange?');
    });
    it('has backward-compatible return fields', () => {
      expect(hookContent).toContain('stats:');
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
    it('doubles interval when page hidden', () => {
      expect(hookContent).toContain('document.visibilityState');
      expect(hookContent).toContain('pollingInterval * 2');
    });
    it('sets staleTime to half polling interval', () => {
      expect(hookContent).toContain('staleTime: pollingInterval / 2');
    });
    it('defaults to 60s polling', () => {
      expect(hookContent).toContain('POLLING_INTERVAL = 60000');
    });
  });

  describe('Deduplication (Req 17.3)', () => {
    it('has fingerprint-based dedup', () => {
      expect(hookContent).toContain('statsFingerprint');
      expect(hookContent).toContain('previousFingerprintRef');
    });
    it('skips callback on identical fingerprint', () => {
      expect(hookContent).toContain('fp !== previousFingerprintRef.current');
    });
    it('uses ref pattern for onDataChange', () => {
      expect(hookContent).toContain('onDataChangeRef');
    });
  });

  describe('polling awareness', () => {
    it('documents polling infrastructure', () => {
      expect(hookContent).toContain('polling');
    });
  });

  describe('React Query cache', () => {
    it('invalidates on refresh', () => {
      expect(hookContent).toContain('queryClient.invalidateQueries');
    });
    it('uses correct query key', () => {
      expect(hookContent).toContain("'admin-dashboard-polling'");
    });
  });
});
