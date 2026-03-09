// @ts-nocheck
/**
 * Auth State Unification Unit Tests
 *
 * Verifies that authStore no longer exposes user identity fields (user,
 * isAuthenticated, setUser) and retains only retry/backoff/error state.
 * Also verifies route guards derive auth state from useAuth()/AuthContext,
 * not from useAuthStore() directly.
 *
 * Requirements: 1.1, 1.2, 1.3
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { useAuthStore } from '@/stores/authStore';

// ── 1. authStore state shape ────────────────────────────────────────────────

describe('authStore state shape (Req 1.1, 1.2, 1.3)', () => {
  it('should NOT contain a "user" property in state', () => {
    const state = useAuthStore.getState();
    expect(state).not.toHaveProperty('user');
  });

  it('should NOT contain an "isAuthenticated" property in state', () => {
    const state = useAuthStore.getState();
    expect(state).not.toHaveProperty('isAuthenticated');
  });

  it('should NOT contain a "setUser" action in state', () => {
    const state = useAuthStore.getState();
    expect(state).not.toHaveProperty('setUser');
  });

  it('should contain expected retry/backoff fields', () => {
    const state = useAuthStore.getState();
    expect(state).toHaveProperty('isLoading');
    expect(state).toHaveProperty('error');
    expect(state).toHaveProperty('retryCount');
    expect(state).toHaveProperty('lastRetryTime');
  });

  it('should contain expected retry/backoff actions', () => {
    const state = useAuthStore.getState();
    expect(typeof state.setLoading).toBe('function');
    expect(typeof state.setError).toBe('function');
    expect(typeof state.clearAuth).toBe('function');
    expect(typeof state.incrementRetry).toBe('function');
    expect(typeof state.resetRetry).toBe('function');
    expect(typeof state.canRetry).toBe('function');
    expect(typeof state.getRetryDelay).toBe('function');
  });
});

// ── 2. Route guards use useAuth / useAuthCheck, not useAuthStore ────────────

describe('Route guards derive auth from AuthContext (Req 1.4, 1.5)', () => {
  const routeFiles = [
    { name: 'ProtectedRoute', file: 'src/components/ProtectedRoute.tsx' },
    { name: 'StudentRoute', file: 'src/components/StudentRoute.tsx' },
    { name: 'AdminRoute', file: 'src/components/AdminRoute.tsx' },
  ];

  for (const { name, file } of routeFiles) {
    const source = fs.readFileSync(path.resolve(process.cwd(), file), 'utf-8');

    it(`${name} should NOT import useAuthStore`, () => {
      expect(source).not.toMatch(/useAuthStore/);
    });

    it(`${name} should use useAuth or useAuthCheck from AuthContext / useSessionListener`, () => {
      const usesAuthHook =
        source.includes('useAuth') || source.includes('useAuthCheck');
      expect(usesAuthHook).toBe(true);
    });
  }
});
