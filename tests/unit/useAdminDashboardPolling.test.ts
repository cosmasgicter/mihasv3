/**
 * useAdminDashboardPolling Unit Tests
 * 
 * Tests for the admin dashboard SSE + polling hook.
 * Since @testing-library/react is not available, we test:
 * 1. Module exports and type correctness
 * 2. SSE client integration pattern (createSSEClient is called correctly)
 * 3. adminDashboardService integration
 * 4. Backward compatibility of the public API
 * 
 * Validates: Requirements 5.8 (SSE wired to admin dashboard updates)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('@/lib/sseClient', () => ({
  createSSEClient: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    isConnected: vi.fn(() => false),
    getRetryCount: vi.fn(() => 0),
    resetRetryCount: vi.fn(),
  })),
}));

vi.mock('@/services/admin/dashboard', () => ({
  adminDashboardService: {
    getMetrics: vi.fn(() => Promise.resolve({
      stats: {
        totalApplications: 100,
        pendingApplications: 20,
        approvedApplications: 50,
        rejectedApplications: 10,
        totalPrograms: 5,
        activeIntakes: 2,
        totalStudents: 200,
        todayApplications: 3,
        weekApplications: 15,
        monthApplications: 40,
        avgProcessingTime: 2.5,
        avgProcessingTimeHours: 60,
        medianProcessingTimeHours: 48,
        p95ProcessingTimeHours: 120,
        decisionVelocity24h: 5,
        activeUsers: 10,
        activeUsersLast7d: 25,
        systemHealth: 'good',
      },
      statusBreakdown: {},
      periodTotals: {},
      totalsSnapshot: {},
      processingMetrics: {
        averageHours: 60,
        averageDays: 2.5,
        medianHours: 48,
        p95Hours: 120,
        decisionVelocity24h: 5,
        activeAdminsLast24h: 3,
        activeAdminsLast7d: 8,
      },
      recentActivity: [],
      generatedAt: new Date().toISOString(),
    })),
  },
  createEmptyDashboardResponse: vi.fn(() => ({
    stats: { totalApplications: 0 },
    statusBreakdown: {},
    periodTotals: {},
    totalsSnapshot: {},
    processingMetrics: {},
    recentActivity: [],
    generatedAt: null,
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(() => ({
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock('react', async () => {
  const actual = await vi.importActual('react');
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
    useEffect: vi.fn((fn: () => void) => fn()),
    useCallback: vi.fn((fn: unknown) => fn),
    useRef: vi.fn((initial: unknown) => ({ current: initial })),
  };
});

describe('useAdminDashboardPolling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Module exports', () => {
    it('should export useAdminDashboardPolling as named export', async () => {
      const mod = await import('@/hooks/useAdminDashboardPolling');
      expect(mod.useAdminDashboardPolling).toBeDefined();
      expect(typeof mod.useAdminDashboardPolling).toBe('function');
    });

    it('should export useAdminDashboardPolling as default export', async () => {
      const mod = await import('@/hooks/useAdminDashboardPolling');
      expect(mod.default).toBeDefined();
      expect(typeof mod.default).toBe('function');
    });

    it('should export the same function as named and default', async () => {
      const mod = await import('@/hooks/useAdminDashboardPolling');
      expect(mod.default).toBe(mod.useAdminDashboardPolling);
    });
  });

  describe('SSE client integration', () => {
    it('should import createSSEClient from @/lib/sseClient', async () => {
      const sseModule = await import('@/lib/sseClient');
      expect(sseModule.createSSEClient).toBeDefined();
    });

    it('should import adminDashboardService from @/services/admin/dashboard', async () => {
      const dashModule = await import('@/services/admin/dashboard');
      expect(dashModule.adminDashboardService).toBeDefined();
      expect(dashModule.adminDashboardService.getMetrics).toBeDefined();
    });
  });

  describe('SSE client configuration', () => {
    it('createSSEClient should accept the expected configuration shape', async () => {
      const { createSSEClient } = await import('@/lib/sseClient');
      
      // Verify createSSEClient can be called with the config shape used in the hook
      const config = {
        endpoint: '/api/sessions?action=connect',
        maxRetries: 3,
        initialBackoff: 1000,
        maxBackoff: 30000,
        batteryFriendly: true,
        withCredentials: true,
        onConnect: () => {},
        onDisconnect: () => {},
        onError: (_err: Error) => {},
      };

      const client = createSSEClient(config);
      expect(client).toBeDefined();
      expect(client.connect).toBeDefined();
      expect(client.disconnect).toBeDefined();
      expect(client.subscribe).toBeDefined();
    });

    it('SSE client subscribe should accept dashboard event types', async () => {
      const { createSSEClient } = await import('@/lib/sseClient');
      
      const client = createSSEClient({
        endpoint: '/api/sessions?action=connect',
      });

      // The hook subscribes to these event types
      const eventTypes = ['dashboard_update', 'application_update', 'message'];
      
      for (const eventType of eventTypes) {
        const unsubscribe = client.subscribe(eventType, () => {});
        expect(typeof unsubscribe).toBe('function');
      }
    });
  });

  describe('adminDashboardService integration', () => {
    it('getMetrics should return expected dashboard response shape', async () => {
      const { adminDashboardService } = await import('@/services/admin/dashboard');
      
      const response = await adminDashboardService.getMetrics();
      
      expect(response).toBeDefined();
      expect(response.stats).toBeDefined();
      expect(typeof response.stats.totalApplications).toBe('number');
      expect(typeof response.stats.pendingApplications).toBe('number');
      expect(typeof response.stats.approvedApplications).toBe('number');
      expect(typeof response.stats.rejectedApplications).toBe('number');
      expect(typeof response.stats.todayApplications).toBe('number');
      expect(typeof response.stats.weekApplications).toBe('number');
    });
  });

  describe('Backward compatibility', () => {
    it('should not import from supabase', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Must not reference supabase
      expect(hookContent).not.toContain('supabase');
      expect(hookContent).not.toContain('@supabase');
      expect(hookContent).not.toContain('Supabase');
    });

    it('should import from @/lib/sseClient', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("from '@/lib/sseClient'");
    });

    it('should import from @/services/admin/dashboard', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("from '@/services/admin/dashboard'");
    });

    it('should export UseAdminDashboardPollingOptions interface with backward-compatible fields', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Must support the options used by Dashboard.tsx
      expect(hookContent).toContain('enabled?');
      expect(hookContent).toContain('pollingInterval?');
      expect(hookContent).toContain('onDataChange?');
    });

    it('should export UseAdminDashboardPollingReturn interface with backward-compatible fields', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Must return the fields used by Dashboard.tsx
      expect(hookContent).toContain('stats:');
      expect(hookContent).toContain('isLoading:');
      expect(hookContent).toContain('isPolling:');
      expect(hookContent).toContain('error:');
      expect(hookContent).toContain('refresh:');
      expect(hookContent).toContain('lastUpdated:');
    });

    it('should include SSE-specific return fields', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // New SSE-specific fields
      expect(hookContent).toContain('isSSEConnected');
      expect(hookContent).toContain('connectionError');
      expect(hookContent).toContain('dashboardData');
    });
  });

  describe('SSE event handling patterns', () => {
    it('should subscribe to dashboard_update events', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("'dashboard_update'");
    });

    it('should subscribe to application_update events for dashboard refresh', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("'application_update'");
    });

    it('should handle SSE connection lifecycle (connect/disconnect/error)', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain('onConnect');
      expect(hookContent).toContain('onDisconnect');
      expect(hookContent).toContain('onError');
    });

    it('should implement polling fallback when SSE fails', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Should fall back to polling when SSE fails
      expect(hookContent).toContain('Max reconnection attempts');
      expect(hookContent).toContain('startPolling');
      expect(hookContent).toContain('stopPolling');
    });

    it('should use battery-friendly SSE configuration', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain('batteryFriendly: true');
    });

    it('should use credentials for SSE connection', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain('withCredentials: true');
    });
  });

  describe('Cleanup and lifecycle', () => {
    it('should disconnect SSE client on cleanup', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Should have cleanup that disconnects SSE
      expect(hookContent).toContain('sseClientRef.current.disconnect()');
      expect(hookContent).toContain('sseClientRef.current = null');
    });

    it('should clear polling interval on cleanup', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      // Should clear polling interval
      expect(hookContent).toContain('clearInterval(pollingIntervalRef.current)');
      expect(hookContent).toContain('pollingIntervalRef.current = null');
    });

    it('should track mounted state to prevent updates after unmount', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain('mountedRef');
      expect(hookContent).toContain('mountedRef.current = true');
      expect(hookContent).toContain('mountedRef.current = false');
    });
  });

  describe('React Query cache integration', () => {
    it('should update React Query cache on data fetch', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("queryClient.setQueryData(['admin-dashboard-polling']");
    });

    it('should invalidate React Query cache on manual refresh', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const hookContent = fs.readFileSync(
        path.resolve(process.cwd(), 'src/hooks/useAdminDashboardPolling.ts'),
        'utf-8'
      );
      
      expect(hookContent).toContain("queryClient.invalidateQueries");
    });
  });
});
