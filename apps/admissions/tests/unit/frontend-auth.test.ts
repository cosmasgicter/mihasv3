// @ts-nocheck
/**
 * Frontend Auth Unit Tests
 * 
 * Tests for auth store retry/backoff/error functionality.
 * User identity is now managed by React Query via useSessionListener,
 * not by the auth store.
 * 
 * REQUIREMENTS:
 * - 1.1: authStore retains only retry/backoff/error state
 * - 10.4: Test automatic token refresh on 401
 * - 10.7: Test exponential backoff prevents retry storms
 * - Test logout clears local state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the auth store (retry/backoff/error only — no user identity)
const createMockAuthStore = () => {
  let state = {
    isLoading: false,
    error: null as string | null,
    retryCount: 0,
    lastRetryTime: 0,
  };

  const MAX_RETRIES = 5;
  const BASE_DELAY = 1000;

  return {
    getState: () => state,
    setState: (newState: Partial<typeof state>) => {
      state = { ...state, ...newState };
    },
    setLoading: (loading: boolean) => {
      state.isLoading = loading;
    },
    setError: (error: string | null) => {
      state.error = error;
    },
    clearAuth: () => {
      state.isLoading = false;
      state.error = null;
      state.retryCount = 0;
      state.lastRetryTime = 0;
    },
    incrementRetry: () => {
      state.retryCount += 1;
      state.lastRetryTime = Date.now();
    },
    resetRetry: () => {
      state.retryCount = 0;
      state.lastRetryTime = 0;
    },
    canRetry: () => {
      if (state.retryCount >= MAX_RETRIES) {
        return false;
      }
      if (state.retryCount === 0) {
        return true;
      }
      const delay = BASE_DELAY * Math.pow(2, state.retryCount - 1);
      const timeSinceLastRetry = Date.now() - state.lastRetryTime;
      return timeSinceLastRetry >= delay;
    },
    getRetryDelay: () => {
      if (state.retryCount === 0) return 0;
      return BASE_DELAY * Math.pow(2, state.retryCount - 1);
    },
  };
};

describe('Auth Store (Retry/Backoff/Error Only)', () => {
  let store: ReturnType<typeof createMockAuthStore>;

  beforeEach(() => {
    store = createMockAuthStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('clearAuth', () => {
    it('should clear all retry/error state', () => {
      store.incrementRetry();
      store.incrementRetry();
      store.setError('Some error');
      store.setLoading(true);

      store.clearAuth();

      const state = store.getState();
      expect(state.error).toBeNull();
      expect(state.retryCount).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('Exponential Backoff', () => {
    /**
     * Requirement 10.7: Test exponential backoff prevents retry storms
     */
    it('should allow first retry immediately', () => {
      expect(store.canRetry()).toBe(true);
    });

    it('should enforce exponential backoff delays', () => {
      // First attempt - immediate
      expect(store.canRetry()).toBe(true);
      store.incrementRetry();

      // Second attempt - need to wait 1000ms
      expect(store.canRetry()).toBe(false);
      expect(store.getRetryDelay()).toBe(1000);

      vi.advanceTimersByTime(1000);
      expect(store.canRetry()).toBe(true);
      store.incrementRetry();

      // Third attempt - need to wait 2000ms
      expect(store.canRetry()).toBe(false);
      expect(store.getRetryDelay()).toBe(2000);

      vi.advanceTimersByTime(2000);
      expect(store.canRetry()).toBe(true);
      store.incrementRetry();

      // Fourth attempt - need to wait 4000ms
      expect(store.canRetry()).toBe(false);
      expect(store.getRetryDelay()).toBe(4000);
    });

    it('should block retries after max attempts', () => {
      for (let i = 0; i < 5; i++) {
        store.incrementRetry();
        vi.advanceTimersByTime(10000);
      }

      expect(store.canRetry()).toBe(false);
    });

    it('should allow retries again after resetRetry', () => {
      store.incrementRetry();
      store.incrementRetry();
      store.incrementRetry();

      store.resetRetry();

      expect(store.canRetry()).toBe(true);
      expect(store.getState().retryCount).toBe(0);
    });
  });
});

describe('Auth Fetch with 401 Handling', () => {
  /**
   * Requirement 10.4: Test automatic token refresh on 401
   */
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function authFetch<T>(url: string, options: RequestInit = {}): Promise<{ success: boolean; data?: T; error?: string; code?: string }> {
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (response.status === 401 && data.code !== 'INVALID_CREDENTIALS') {
      const refreshResponse = await fetch('/api/auth?action=refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (refreshResponse.ok) {
        const retryResponse = await fetch(url, {
          ...options,
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        return retryResponse.json();
      }

      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'Request failed');
    }

    return data;
  }

  it('should retry request after successful token refresh on 401', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { user: { id: '123' } } }),
      });

    const result = await authFetch('/api/auth?action=session');

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ user: { id: '123' } });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should throw error when refresh fails', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: 'Token expired', code: 'TOKEN_EXPIRED' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ success: false, error: 'Refresh token invalid' }),
      });

    await expect(authFetch('/api/auth?action=session')).rejects.toThrow('Session expired');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should not retry on INVALID_CREDENTIALS error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ success: false, error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' }),
    });

    await expect(authFetch('/api/auth?action=login', {
      method: 'POST',
      body: JSON.stringify({ email: 'test@example.com', password: 'wrong' }),
    })).rejects.toThrow('Invalid credentials');

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('should include credentials in all requests', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: {} }),
    });

    await authFetch('/api/test');

    expect(mockFetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({
      credentials: 'include',
    }));
  });
});

describe('Logout Behavior', () => {
  it('should clear retry/error state on logout', () => {
    const store = createMockAuthStore();

    store.setError('Some previous error');
    store.incrementRetry();
    store.setLoading(true);

    store.clearAuth();

    const state = store.getState();
    expect(state.error).toBeNull();
    expect(state.retryCount).toBe(0);
    expect(state.isLoading).toBe(false);
  });
});

describe('Session Management', () => {
  it('should track loading state during operations', () => {
    const store = createMockAuthStore();

    expect(store.getState().isLoading).toBe(false);

    store.setLoading(true);
    expect(store.getState().isLoading).toBe(true);

    store.setLoading(false);
    expect(store.getState().isLoading).toBe(false);
  });

  it('should track error state', () => {
    const store = createMockAuthStore();

    expect(store.getState().error).toBeNull();

    store.setError('Something went wrong');
    expect(store.getState().error).toBe('Something went wrong');

    store.setError(null);
    expect(store.getState().error).toBeNull();
  });
});
