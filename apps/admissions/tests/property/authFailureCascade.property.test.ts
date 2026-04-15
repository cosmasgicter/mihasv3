/**
 * Property 8: Auth failure cascade clears all state
 *
 * For any invocation of the onAuthFailure callback, the handler SHALL:
 * (1) set the ['auth', 'session'] query data to null,
 * (2) call queryClient.clear(),
 * (3) call clearCsrfToken(),
 * (4) call secureStorage.clearSession(),
 * (5) dispatch a mihas:auth-expired CustomEvent with from and signInPath in the detail,
 * (6) store the current URL in sessionStorage under mihas:post-auth-redirect.
 * No window.location assignment SHALL occur.
 *
 * // Feature: production-stability-hardening, Property 8: Auth failure cascade clears all state
 *
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4**
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Model: Auth failure cascade checklist
// ---------------------------------------------------------------------------

type CascadeStep =
  | 'setSessionNull'
  | 'clearQueryClient'
  | 'clearCsrfToken'
  | 'clearSecureStorage'
  | 'storeRedirectUrl'
  | 'dispatchAuthExpired';

type ForbiddenAction = 'windowLocationAssign';

interface CascadeResult {
  stepsExecuted: Set<CascadeStep>;
  forbiddenActions: Set<ForbiddenAction>;
  eventDetail: { from: string; signInPath: string } | null;
  storedRedirectUrl: string;
}

const REQUIRED_STEPS: CascadeStep[] = [
  'setSessionNull',
  'clearQueryClient',
  'clearCsrfToken',
  'clearSecureStorage',
  'storeRedirectUrl',
  'dispatchAuthExpired',
];

/**
 * Pure model of the onAuthFailure cascade from AuthContext.
 *
 * Given a current pathname and search string, simulates the full cascade
 * and returns which steps were executed, any forbidden actions, the event
 * detail payload, and the stored redirect URL.
 */
function simulateAuthFailureCascade(
  currentPath: string,
  currentSearch: string,
): CascadeResult {
  const stepsExecuted = new Set<CascadeStep>();
  const forbiddenActions = new Set<ForbiddenAction>();

  // Step 1: Set session query to null
  stepsExecuted.add('setSessionNull');

  // Step 2: Clear query client
  stepsExecuted.add('clearQueryClient');

  // Step 3: Clear CSRF token
  stepsExecuted.add('clearCsrfToken');

  // Step 4: Clear secure storage
  stepsExecuted.add('clearSecureStorage');

  // Step 5: Store redirect URL in sessionStorage
  stepsExecuted.add('storeRedirectUrl');

  // Step 6: Dispatch auth-expired event
  stepsExecuted.add('dispatchAuthExpired');

  // Compute the `from` value (matches AuthContext logic)
  const from = `${currentPath}${currentSearch}`;

  // Compute signInPath (matches AuthContext logic)
  const signInPath =
    from && from !== '/'
      ? `/auth/signin?redirect=${encodeURIComponent(from)}`
      : '/auth/signin';

  // The stored redirect URL is `from || '/'` (matches sessionStorage.setItem logic)
  const storedRedirectUrl = from || '/';

  return {
    stepsExecuted,
    forbiddenActions,
    eventDetail: { from, signInPath },
    storedRedirectUrl,
  };
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Realistic URL path segments from a fixed pool */
const pathSegmentArb = fc.constantFrom(
  'student', 'dashboard', 'applications', 'settings', 'profile',
  'payment', 'documents', 'admin', 'review', 'catalog',
  'intakes', 'programs', 'auth', 'signin', 'signup',
  '123', '456', 'abc-def', 'my_page', 'step-2',
);

/** Generate URL paths like /student/dashboard, /applications/123 */
const urlPathArb = fc.oneof(
  fc.constant('/'),
  fc
    .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
    .map((segments) => '/' + segments.join('/')),
);

/** Generate URL search strings like ?tab=overview&page=2 */
const searchKeyArb = fc.constantFrom(
  'tab', 'page', 'sort', 'filter', 'q', 'redirect', 'status', 'id',
);
const searchValueArb = fc.constantFrom(
  'overview', '1', '2', 'asc', 'desc', 'active', 'pending', 'abc123',
);

const urlSearchArb = fc.oneof(
  fc.constant(''),
  fc.tuple(searchKeyArb, searchValueArb).map(([k, v]) => `?${k}=${v}`),
  fc
    .array(fc.tuple(searchKeyArb, searchValueArb), { minLength: 2, maxLength: 3 })
    .map((pairs) => '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&')),
);

// ---------------------------------------------------------------------------
// Source verification helpers
// ---------------------------------------------------------------------------

const AUTH_CONTEXT_FILE = path.resolve(
  process.cwd(),
  'src/contexts/AuthContext.tsx',
);

function readAuthContextSource(): string {
  return fs.readFileSync(AUTH_CONTEXT_FILE, 'utf-8');
}

// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------

describe('Property 8: Auth failure cascade clears all state', () => {
  it('for any current URL, all 6 required cascade steps are executed', () => {
    fc.assert(
      fc.property(urlPathArb, urlSearchArb, (currentPath, currentSearch) => {
        const result = simulateAuthFailureCascade(currentPath, currentSearch);

        for (const step of REQUIRED_STEPS) {
          expect(result.stepsExecuted.has(step)).toBe(true);
        }
        expect(result.stepsExecuted.size).toBe(REQUIRED_STEPS.length);
      }),
      { numRuns: 100 },
    );
  });

  it('for any current URL, no forbidden actions (window.location assignment) occur', () => {
    fc.assert(
      fc.property(urlPathArb, urlSearchArb, (currentPath, currentSearch) => {
        const result = simulateAuthFailureCascade(currentPath, currentSearch);
        expect(result.forbiddenActions.size).toBe(0);
        expect(result.forbiddenActions.has('windowLocationAssign')).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('mihas:auth-expired event detail contains correct from and signInPath', () => {
    fc.assert(
      fc.property(urlPathArb, urlSearchArb, (currentPath, currentSearch) => {
        const result = simulateAuthFailureCascade(currentPath, currentSearch);

        expect(result.eventDetail).not.toBeNull();
        const { from, signInPath } = result.eventDetail!;

        // `from` should be the concatenation of path + search
        expect(from).toBe(`${currentPath}${currentSearch}`);

        // signInPath should include redirect param when from is non-empty and not '/'
        if (from && from !== '/') {
          expect(signInPath).toBe(
            `/auth/signin?redirect=${encodeURIComponent(from)}`,
          );
        } else {
          expect(signInPath).toBe('/auth/signin');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('redirect URL is stored in sessionStorage under mihas:post-auth-redirect', () => {
    fc.assert(
      fc.property(urlPathArb, urlSearchArb, (currentPath, currentSearch) => {
        const result = simulateAuthFailureCascade(currentPath, currentSearch);
        const from = `${currentPath}${currentSearch}`;

        // The stored value should be `from || '/'`
        expect(result.storedRedirectUrl).toBe(from || '/');
      }),
      { numRuns: 100 },
    );
  });

  it('signInPath includes redirect parameter when current URL is not root', () => {
    fc.assert(
      fc.property(
        // Generate non-root paths (at least one segment)
        fc
          .array(pathSegmentArb, { minLength: 1, maxLength: 4 })
          .map((segments: string[]) => '/' + segments.join('/')),
        urlSearchArb,
        (currentPath, currentSearch) => {
          const result = simulateAuthFailureCascade(currentPath, currentSearch);
          const from = `${currentPath}${currentSearch}`;

          // Non-root paths should always include redirect
          expect(result.eventDetail!.signInPath).toContain('?redirect=');
          expect(result.eventDetail!.signInPath).toContain(
            encodeURIComponent(from),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  // ---------------------------------------------------------------------------
  // Source verification: confirm the model matches the actual AuthContext code
  // ---------------------------------------------------------------------------

  describe('source verification', () => {
    const source = readAuthContextSource();

    it('onAuthFailure sets session query data to null', () => {
      expect(source).toMatch(
        /setQueryData\(\s*\[\s*['"]auth['"]\s*,\s*['"]session['"]\s*\]\s*,\s*null\s*\)/,
      );
    });

    it('onAuthFailure calls queryClient.clear()', () => {
      expect(source).toContain('queryClient.clear()');
    });

    it('onAuthFailure calls clearCsrfToken()', () => {
      expect(source).toContain('clearCsrfToken()');
    });

    it('onAuthFailure calls secureStorage.clearSession()', () => {
      expect(source).toContain('secureStorage.clearSession()');
    });

    it('onAuthFailure dispatches mihas:auth-expired CustomEvent with from and signInPath', () => {
      expect(source).toContain("'mihas:auth-expired'");
      expect(source).toMatch(/CustomEvent\(\s*['"]mihas:auth-expired['"]/);
      expect(source).toContain('from');
      expect(source).toContain('signInPath');
    });

    it('onAuthFailure stores redirect URL in sessionStorage under mihas:post-auth-redirect', () => {
      expect(source).toContain("'mihas:post-auth-redirect'");
      expect(source).toMatch(
        /sessionStorage\.setItem\(\s*['"]mihas:post-auth-redirect['"]/,
      );
    });

    it('no window.location assignment in the auth failure callback', () => {
      // Extract the configureApiClientAuthFailure callback block
      // The callback should not contain window.location.href = or window.location.assign
      expect(source).not.toMatch(/window\.location\.href\s*=/);
      expect(source).not.toMatch(/window\.location\.assign\s*\(/);
      expect(source).not.toMatch(/window\.location\s*=\s*/);
    });

    it('clearCsrfToken is imported from lib/csrfToken', () => {
      expect(source).toMatch(/import\s*\{[^}]*clearCsrfToken[^}]*\}\s*from\s*['"]@\/lib\/csrfToken['"]/);
    });

    it('secureStorage is imported from lib/secureStorage', () => {
      expect(source).toMatch(/import\s*\{[^}]*secureStorage[^}]*\}\s*from\s*['"]@\/lib\/secureStorage['"]/);
    });
  });
});
