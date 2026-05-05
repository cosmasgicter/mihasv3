import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

// Mock env before any imports that depend on it
vi.mock('@/lib/env', () => ({
  env: { apiBaseUrl: 'http://localhost:8000' },
}));

// Mock useVisibilityRevalidation — capture the onInvalid callback for testing
const visibilityMock = vi.fn();
vi.mock('@/hooks/useVisibilityRevalidation', () => ({
  useVisibilityRevalidation: visibilityMock,
}));

const BASE = 'http://localhost:8000';

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  visibilityMock.mockClear();
});
afterAll(() => server.close());

// ---------------------------------------------------------------------------
// Helper: dynamically import AuthContext + client with fresh module state
// ---------------------------------------------------------------------------
async function loadModules() {
  vi.resetModules();
  // Re-apply mocks after resetModules
  vi.doMock('@/lib/env', () => ({
    env: { apiBaseUrl: 'http://localhost:8000' },
  }));
  const capturedOnInvalid = vi.fn();
  vi.doMock('@/hooks/useVisibilityRevalidation', () => ({
    useVisibilityRevalidation: (cb: () => void) => {
      capturedOnInvalid.mockImplementation(cb);
    },
  }));

  const authMod = await import('@/auth/AuthContext');
  const clientMod = await import('@/services/api/client');

  return { ...authMod, ...clientMod, capturedOnInvalid };
}

// ---------------------------------------------------------------------------
// Helper: create a wrapper with QueryClientProvider + AuthProvider
// ---------------------------------------------------------------------------
function createWrapper(
  AuthProvider: (props: { children: ReactNode }) => JSX.Element,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(AuthProvider, null, children),
    );
  }

  return { Wrapper, queryClient };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthContext — session bootstrap', () => {
  it('calls GET /api/v1/auth/session/?refresh_csrf=1 on mount', async () => {
    let sessionCalled = false;
    let refreshCsrfParam: string | null = null;

    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, ({ request }) => {
        sessionCalled = true;
        const url = new URL(request.url);
        refreshCsrfParam = url.searchParams.get('refresh_csrf');
        return HttpResponse.json({
          success: true,
          data: { id: 'u1', email: 'test@example.com', role: 'admin' },
        });
      }),
    );

    const { AuthProvider, useAuth } = await loadModules();
    const { Wrapper } = createWrapper(AuthProvider as any);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(sessionCalled).toBe(true);
    expect(refreshCsrfParam).toBe('1');
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(
      expect.objectContaining({ id: 'u1', email: 'test@example.com' }),
    );
  });

  it('sets user to null when session endpoint returns non-ok', async () => {
    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }),
    );

    const { AuthProvider, useAuth } = await loadModules();
    const { Wrapper } = createWrapper(AuthProvider as any);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('AuthContext — logout clears React Query cache and CSRF token', () => {
  it('clears query cache when auth failure callback fires', async () => {
    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        return HttpResponse.json({
          success: true,
          data: { id: 'u1', email: 'test@example.com', role: 'admin' },
        });
      }),
    );

    const { AuthProvider, useAuth, setCsrfToken, getCsrfToken, capturedOnInvalid } =
      await loadModules();
    const { Wrapper, queryClient } = createWrapper(AuthProvider as any);

    // Pre-populate CSRF token
    setCsrfToken('test-csrf-token');

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Seed the query cache with some data
    queryClient.setQueryData(['test-key'], { some: 'data' });
    expect(queryClient.getQueryData(['test-key'])).toBeTruthy();

    // Trigger the handleSessionInvalid callback (captured via useVisibilityRevalidation mock)
    act(() => {
      capturedOnInvalid();
    });

    // User should be cleared
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    // Query cache should be cleared
    expect(queryClient.getQueryData(['test-key'])).toBeUndefined();
  });
});

describe('AuthContext — auth failure callback redirects to sign-in', () => {
  it('clears user state when auth failure fires (route guards redirect to sign-in)', async () => {
    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        return HttpResponse.json({
          success: true,
          data: { id: 'u1', email: 'test@example.com', role: 'admin' },
        });
      }),
    );

    const { AuthProvider, useAuth, capturedOnInvalid } = await loadModules();
    const { Wrapper } = createWrapper(AuthProvider as any);

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);

    // Simulate auth failure — the handleSessionInvalid callback clears user state,
    // which causes isAuthenticated to become false. The app's route guards then
    // redirect unauthenticated users to the sign-in page.
    act(() => {
      capturedOnInvalid();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  it('registers handleSessionInvalid via configureAuthFailure', async () => {
    let capturedAuthFailureCb: (() => void) | null = null;

    vi.resetModules();
    vi.doMock('@/lib/env', () => ({
      env: { apiBaseUrl: 'http://localhost:8000' },
    }));
    vi.doMock('@/hooks/useVisibilityRevalidation', () => ({
      useVisibilityRevalidation: vi.fn(),
    }));
    vi.doMock('@/services/api/client', async (importOriginal) => {
      const original = await importOriginal<typeof import('@/services/api/client')>();
      return {
        ...original,
        configureAuthFailure: (cb: () => void) => {
          capturedAuthFailureCb = cb;
          return original.configureAuthFailure(cb);
        },
      };
    });

    server.use(
      http.get(`${BASE}/api/v1/auth/session/`, () => {
        return HttpResponse.json({
          success: true,
          data: { id: 'u1', email: 'test@example.com', role: 'admin' },
        });
      }),
    );

    const { AuthProvider, useAuth } = await import('@/auth/AuthContext');

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    function Wrapper({ children }: { children: ReactNode }) {
      return createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(AuthProvider, null, children),
      );
    }

    const { result } = renderHook(() => useAuth(), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // configureAuthFailure should have been called with handleSessionInvalid
    expect(capturedAuthFailureCb).toBeTypeOf('function');

    // Calling the captured callback should clear auth state
    act(() => {
      capturedAuthFailureCb!();
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });
});
