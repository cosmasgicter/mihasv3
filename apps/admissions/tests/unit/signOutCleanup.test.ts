/**
 * Unit tests for signOut cleanup in useSessionListener
 *
 * Verifies that signOut:
 * 1. Calls clearCsrfToken()
 * 2. Calls queryClient.clear()
 * 3. POSTs to /auth?action=logout via apiClient
 * 4. Calls secureStorage.clearSession()
 *
 * _Requirements: 4.2, 5.5, 10.3_
 */
// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Track mock calls ────────────────────────────────────────────────────

const clearCsrfTokenSpy = vi.fn();
const clearSessionSpy = vi.fn().mockResolvedValue(undefined);
const apiRequestSpy = vi.fn().mockResolvedValue(undefined);
const broadcastLogoutSpy = vi.fn();

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock('@/lib/csrfToken', () => ({
  clearCsrfToken: (...args: any[]) => clearCsrfTokenSpy(...args),
  getCsrfToken: vi.fn(() => 'mock-csrf'),
  setCsrfToken: vi.fn(),
}));

vi.mock('@/lib/secureStorage', () => ({
  secureStorage: {
    clearSession: (...args: any[]) => clearSessionSpy(...args),
  },
}));

vi.mock('@/services/client', () => ({
  apiClient: {
    request: (...args: any[]) => apiRequestSpy(...args),
  },
}));

vi.mock('@/lib/authBroadcast', () => ({
  broadcastLogout: (...args: any[]) => broadcastLogoutSpy(...args),
  broadcastLogin: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isAdminRole: vi.fn((role?: string) =>
    ['admin', 'super_admin', 'admissions_officer', 'registrar', 'finance_officer', 'academic_head'].includes(role ?? ''),
  ),
}));

vi.mock('@/lib/userDisplayName', () => ({
  getDisplayName: vi.fn(() => 'Test User'),
}));

vi.mock('@/hooks/queries/useQueryConfig', () => ({
  CACHE_CONFIG: {
    auth: { staleTime: 600000, gcTime: 1800000 },
  },
}));

// Mock React Query
const clearSpy = vi.fn();
const setQueryDataSpy = vi.fn();
const removeQueriesSpy = vi.fn();
const cancelQueriesSpy = vi.fn().mockResolvedValue(undefined);
const mockQueryClient = {
  clear: clearSpy,
  setQueryData: setQueryDataSpy,
  removeQueries: removeQueriesSpy,
  cancelQueries: cancelQueriesSpy,
};

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({
    data: { user: { id: '1', role: 'student' } },
    isLoading: false,
  })),
  useQueryClient: vi.fn(() => mockQueryClient),
}));

vi.mock('@/services/auth', () => ({
  authService: {
    logout: vi.fn().mockResolvedValue(undefined),
    session: vi.fn().mockResolvedValue({ user: { id: '1', role: 'student' } }),
  },
}));

vi.mock('@/lib/sessionHardening', () => ({
  resetAuthFailureDebounce: vi.fn(),
  SESSION_MESSAGES: {},
  isPermissionDenial: vi.fn(() => false),
  isNonAuthError: vi.fn(() => false),
  shouldDispatchAuthFailure: vi.fn(() => true),
}));

vi.mock('@/hooks/auth/authQueries', () => ({
  SESSION_QUERY_KEY: ['auth', 'session'],
  PROFILE_STALE_TIME_MS: 300000,
  profileQueryKey: (userId?: string | null) => ['user-profile', userId],
  buildProfileFromUser: vi.fn(() => null),
  fetchCurrentProfile: vi.fn().mockResolvedValue(null),
  fetchSessionData: vi.fn().mockResolvedValue({ user: { id: '1', role: 'student' } }),
}));

vi.mock('@/lib/authSession', () => ({
  extractAuthUser: vi.fn((data: any) => data?.user ?? null),
}));

// Mock React
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    // useCallback just returns the function directly in test context
    useCallback: (fn: any, _deps: any[]) => fn,
  };
});

// ── Tests ───────────────────────────────────────────────────────────────

describe('signOut cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Stub window.dispatchEvent for the authSignedOut event
    if (typeof globalThis.window === 'undefined') {
      (globalThis as any).window = { dispatchEvent: vi.fn() };
    } else {
      vi.spyOn(window, 'dispatchEvent').mockImplementation(() => true);
    }
    (globalThis as any).sessionStorage = {
      removeItem: vi.fn(),
      setItem: vi.fn(),
      getItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    (globalThis as any).localStorage = {
      removeItem: vi.fn(),
      setItem: vi.fn(),
      getItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    };
    (globalThis as any).CustomEvent = class CustomEvent {
      type: string;
      detail: unknown;

      constructor(type: string, init?: { detail?: unknown }) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('signOut calls clearCsrfToken', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(clearCsrfTokenSpy).toHaveBeenCalledTimes(1);
  });

  it('signOut calls queryClient.clear()', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('signOut nulls auth and profile query data before clearing', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(setQueryDataSpy).toHaveBeenCalledWith(['auth', 'session'], null);
    expect(setQueryDataSpy).toHaveBeenCalledWith(['user-profile', '1'], null);
    expect(setQueryDataSpy).toHaveBeenCalledWith(['user-profile', undefined], null);
  });

  it('signOut POSTs to /auth/logout/ via authService', async () => {
    const { authService } = await import('@/services/auth');
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(authService.logout).toHaveBeenCalledTimes(1);
  });

  it('signOut calls secureStorage.clearSession()', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(clearSessionSpy).toHaveBeenCalledTimes(1);
  });

  it('signOut broadcasts logout to other tabs', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(broadcastLogoutSpy).toHaveBeenCalledTimes(1);
  });

  it('signOut removes redirect guard keys from localStorage and sessionStorage', async () => {
    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    await signOut();

    expect(localStorage.removeItem).toHaveBeenCalledWith('mihas:post-auth-redirect');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('mihas:post-auth-redirect');
    expect(localStorage.removeItem).toHaveBeenCalledWith('mihas:wizard-auth-redirect-guard');
    expect(sessionStorage.removeItem).toHaveBeenCalledWith('mihas:wizard-auth-redirect-guard');
  });

  it('signOut completes even if logout POST fails', async () => {
    const { authService } = await import('@/services/auth');
    (authService.logout as any).mockRejectedValueOnce(new Error('Network error'));

    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    // Should not throw
    await expect(signOut()).resolves.toBeUndefined();

    // clearSession should still be called after failed POST
    expect(clearSessionSpy).toHaveBeenCalledTimes(1);
  });

  it('signOut completes even if secureStorage.clearSession fails', async () => {
    clearSessionSpy.mockRejectedValueOnce(new Error('Storage error'));

    const { useSessionListener } = await import('@/hooks/auth/useSessionListener');
    const { signOut } = useSessionListener();

    // Should not throw
    await expect(signOut()).resolves.toBeUndefined();

    // CSRF should have been cleared before the storage error
    expect(clearCsrfTokenSpy).toHaveBeenCalledTimes(1);
  });
});
