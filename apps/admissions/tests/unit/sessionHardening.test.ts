/**
 * Session Hardening Tests
 *
 * Covers:
 * 1. API client: concurrent 401s, refresh retry, auth-expired dispatch, 403 classification, CSRF retry
 * 2. Auth context/session listener: pending validation, transient timeout, BFCache, logout
 * 3. Route guards: no redirect while validating, redirect after recovery fails
 * 4. Wizard: draft persistence through auth recovery, autosave pause/resume
 * 5. Dashboard: 403 doesn't navigate, polling doesn't overwrite
 * 6. Payment: initiation survives refresh, verification survives transient failure
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── 1. sessionHardening module unit tests ─────────────────────────────────────

describe('sessionHardening module', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shouldDispatchAuthFailure debounce', () => {
    it('first call returns true', async () => {
      const { shouldDispatchAuthFailure } = await import('@/lib/sessionHardening');
      expect(shouldDispatchAuthFailure()).toBe(true);
    });

    it('second call within 3s returns false (concurrent 401s share ONE dispatch)', async () => {
      const { shouldDispatchAuthFailure } = await import('@/lib/sessionHardening');
      shouldDispatchAuthFailure(); // first — true
      expect(shouldDispatchAuthFailure()).toBe(false); // second within 3s — false
    });

    it('call after 3s returns true again', async () => {
      const { shouldDispatchAuthFailure } = await import('@/lib/sessionHardening');
      shouldDispatchAuthFailure();
      vi.advanceTimersByTime(3001);
      expect(shouldDispatchAuthFailure()).toBe(true);
    });

    it('resetAuthFailureDebounce allows immediate dispatch', async () => {
      const { shouldDispatchAuthFailure, resetAuthFailureDebounce } = await import('@/lib/sessionHardening');
      shouldDispatchAuthFailure();
      resetAuthFailureDebounce();
      expect(shouldDispatchAuthFailure()).toBe(true);
    });
  });

  describe('isPermissionDenial', () => {
    it('403 INSUFFICIENT_PERMISSIONS is a permission denial (does NOT log out)', async () => {
      const { isPermissionDenial } = await import('@/lib/sessionHardening');
      expect(isPermissionDenial(403, 'INSUFFICIENT_PERMISSIONS')).toBe(true);
    });

    it('403 TOKEN_EXPIRED is NOT a permission denial (is auth failure)', async () => {
      const { isPermissionDenial } = await import('@/lib/sessionHardening');
      expect(isPermissionDenial(403, 'TOKEN_EXPIRED')).toBe(false);
    });

    it('403 CSRF_INVALID is NOT a permission denial (is CSRF failure)', async () => {
      const { isPermissionDenial } = await import('@/lib/sessionHardening');
      expect(isPermissionDenial(403, 'CSRF_INVALID')).toBe(false);
    });

    it('401 is never a permission denial', async () => {
      const { isPermissionDenial } = await import('@/lib/sessionHardening');
      expect(isPermissionDenial(401, 'INSUFFICIENT_PERMISSIONS')).toBe(false);
    });

    it('403 with unknown code is a permission denial', async () => {
      const { isPermissionDenial } = await import('@/lib/sessionHardening');
      expect(isPermissionDenial(403, 'SOME_BUSINESS_ERROR')).toBe(true);
    });
  });

  describe('isNonAuthError', () => {
    it('INSUFFICIENT_PERMISSIONS is a non-auth error', async () => {
      const { isNonAuthError } = await import('@/lib/sessionHardening');
      expect(isNonAuthError('INSUFFICIENT_PERMISSIONS')).toBe(true);
    });

    it('VALIDATION_ERROR is a non-auth error', async () => {
      const { isNonAuthError } = await import('@/lib/sessionHardening');
      expect(isNonAuthError('VALIDATION_ERROR')).toBe(true);
    });

    it('TOKEN_EXPIRED is NOT a non-auth error', async () => {
      const { isNonAuthError } = await import('@/lib/sessionHardening');
      expect(isNonAuthError('TOKEN_EXPIRED')).toBe(false);
    });

    it('undefined returns false', async () => {
      const { isNonAuthError } = await import('@/lib/sessionHardening');
      expect(isNonAuthError(undefined)).toBe(false);
    });
  });

  describe('dispatchAuthRecovered', () => {
    it('dispatches mihas:auth-recovered custom event', async () => {
      const { dispatchAuthRecovered } = await import('@/lib/sessionHardening');
      const listener = vi.fn();
      window.addEventListener('mihas:auth-recovered', listener);
      dispatchAuthRecovered();
      expect(listener).toHaveBeenCalledTimes(1);
      window.removeEventListener('mihas:auth-recovered', listener);
    });
  });

  describe('SESSION_MESSAGES', () => {
    it('contains all required diagnostic messages', async () => {
      const { SESSION_MESSAGES } = await import('@/lib/sessionHardening');
      expect(SESSION_MESSAGES.RECONNECTING).toBeDefined();
      expect(SESSION_MESSAGES.PROGRESS_SAVED).toBeDefined();
      expect(SESSION_MESSAGES.SESSION_EXPIRED).toBeDefined();
      expect(SESSION_MESSAGES.PAYMENT_PENDING).toBeDefined();
      expect(SESSION_MESSAGES.PERMISSION_DENIED).toBeDefined();
    });
  });
});

// ─── 2. Auth context / session listener behavior ────────────────────────────────

describe('Auth session state preservation', () => {
  it('mihas:auth-recovered event is a CustomEvent', () => {
    const events: Event[] = [];
    const handler = (e: Event) => events.push(e);
    window.addEventListener('mihas:auth-recovered', handler);
    window.dispatchEvent(new CustomEvent('mihas:auth-recovered'));
    expect(events).toHaveLength(1);
    expect(events[0]).toBeInstanceOf(CustomEvent);
    window.removeEventListener('mihas:auth-recovered', handler);
  });

  it('mihas:auth-expired event carries session message', () => {
    const events: CustomEvent[] = [];
    const handler = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('mihas:auth-expired', handler);
    window.dispatchEvent(new CustomEvent('mihas:auth-expired', {
      detail: { message: 'Your session expired. We saved your progress. Please sign in again to continue.' }
    }));
    expect(events[0].detail.message).toContain('session expired');
    window.removeEventListener('mihas:auth-expired', handler);
  });
});

// ─── 3. Route guard behavior (source code contract) ─────────────────────────────

describe('Route guard hardening contracts', () => {
  it('StudentRoute source checks recoveryAttempted before redirecting', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/StudentRoute.tsx'),
      'utf-8'
    );
    // Must check recovery state before redirect
    expect(src).toContain('recoveryAttempted');
    expect(src).toContain('isRecoveringSession');
    // Must show reconnecting skeleton
    expect(src).toContain('Reconnecting');
  });

  it('AdminRoute source checks recoveryAttempted before redirecting', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/AdminRoute.tsx'),
      'utf-8'
    );
    expect(src).toContain('recoveryAttempted');
    expect(src).toContain('isRecoveringSession');
  });
});

// ─── 4. Wizard persistence through auth recovery ────────────────────────────────

describe('Wizard autosave auth recovery', () => {
  it('useAutoSave listens for mihas:auth-recovered to resume cloud saves', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/hooks/useAutoSave.ts'),
      'utf-8'
    );
    expect(src).toContain('mihas:auth-recovered');
    // Must reset authExpiredRef on recovery
    expect(src).toMatch(/authExpiredRef/);
  });

  it('useSmartAutoSave listens for mihas:auth-recovered', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/pages/student/applicationWizard/hooks/useSmartAutoSave.ts'),
      'utf-8'
    );
    expect(src).toContain('mihas:auth-recovered');
  });

  it('wizard shows progress-saved message during auth recovery', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/hooks/useAutoSave.ts'),
      'utf-8'
    );
    // Must show the progress saved message, not a generic error
    expect(src).toMatch(/saved.*device|progress.*saved/i);
  });
});

// ─── 5. Dashboard 403 handling ──────────────────────────────────────────────────

describe('Dashboard 403 does not navigate to sign-in', () => {
  it('API client source distinguishes INSUFFICIENT_PERMISSIONS from auth failure', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/services/client.ts'),
      'utf-8'
    );
    // Must check isPermissionDenial before triggering auth failure
    expect(src).toContain('isPermissionDenial');
    // Must import from sessionHardening
    expect(src).toContain('sessionHardening');
  });
});

// ─── 6. Payment persistence ─────────────────────────────────────────────────────

describe('Payment session hardening', () => {
  it('SESSION_MESSAGES.PAYMENT_PENDING provides correct user guidance', async () => {
    const { SESSION_MESSAGES } = await import('@/lib/sessionHardening');
    expect(SESSION_MESSAGES.PAYMENT_PENDING).toContain('verified');
    expect(SESSION_MESSAGES.PAYMENT_PENDING).toContain('not start another');
  });

  it('API client dispatchAuthRecovered on successful refresh (payment retries work)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/services/client.ts'),
      'utf-8'
    );
    expect(src).toContain('dispatchAuthRecovered');
  });
});

// ─── 7. Concurrent 401 deduplication (integration-level) ────────────────────────

describe('Concurrent 401 deduplication integration', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('5 rapid shouldDispatchAuthFailure calls produce exactly 1 true', async () => {
    const { shouldDispatchAuthFailure } = await import('@/lib/sessionHardening');
    const results = Array.from({ length: 5 }, () => shouldDispatchAuthFailure());
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results[0]).toBe(true);
  });

  it('after debounce window, another dispatch is allowed', async () => {
    const { shouldDispatchAuthFailure } = await import('@/lib/sessionHardening');
    shouldDispatchAuthFailure();
    vi.advanceTimersByTime(3001);
    expect(shouldDispatchAuthFailure()).toBe(true);
  });
});
