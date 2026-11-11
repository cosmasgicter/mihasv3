/**
 * Strict harness gates (task 0.4, R1.4 / R18.4) — the honest replacement for the
 * old descriptive, env-gated staging E2E specs (finding GOV-04).
 *
 * Every test in the required project is auto-wrapped so the run FAILS LOUDLY on:
 *   1. test.skip / test.fixme          — a required test may never self-silence.
 *   2. unexpected console errors        — page console.error / warnings.
 *   3. unhandled page exceptions        — window.onerror / unhandled rejections.
 *   4. unasserted failed requests       — any requestfailed or HTTP >= 400 whose
 *                                         error path was not explicitly allowed.
 *   5. outside hosts                    — any request, navigation, popup or CSP
 *                                         refusal that names a host outside the
 *                                         stack (task 3.7, R1.11). Allowances do
 *                                         not apply to this gate.
 *
 * A failed call is only acceptable when the test declares it via
 * `gate.allowRequest(...)` (that declaration IS the "asserted error path" from
 * R18.4). The gatecheck-negative project deliberately trips each gate to prove
 * the gates actually fire.
 *
 * The "undrained required jobs" gate lives in the operational drain assertions
 * (see helpers/ops.ts + the required drain test), which read the harness
 * adapter's broker + payment observer.
 */
import { test as base, expect, type Page } from '@playwright/test';
import { OutsideHostLog } from './helpers/outside-hosts';

type Matcher = string | RegExp;

function matches(value: string, patterns: Matcher[]): boolean {
  return patterns.some((p) => (typeof p === 'string' ? value.includes(p) : p.test(value)));
}

/**
 * The browser withdrew the request, so the platform never answered it.
 *
 * This is a **cancellation**, not a refusal, and the platform causes it on purpose:
 * auto-save is mandatory on every student form (`PRODUCT.md`), so `useAutoSave`
 * fires one last `PATCH` from `beforeunload`/`visibilitychange` when the form is
 * dirty — a call that by construction cannot finish, because the document is
 * already going away — and React Query/`AbortController` cancel in-flight reads
 * when a component unmounts. Any journey that navigates away from a live surface
 * produces these, and no amount of waiting removes them: the navigation is what
 * starts them.
 *
 * Counting them as failed calls would make the gate measure Chromium's
 * cancellation semantics rather than the platform's behaviour, so they are
 * recorded separately (`gate.cancelledRequests`) and do not fail a run. Every
 * other transport failure — `ERR_NAME_NOT_RESOLVED`, `ERR_CONNECTION_REFUSED`,
 * `ERR_TIMED_OUT`, CSP blocks — and every HTTP >= 400 still does. The
 * gatecheck-negative failed-request probe uses an unresolvable host, so it still
 * fails as designed.
 */
const CANCELLED_BY_BROWSER = 'net::ERR_ABORTED';

export class HarnessGate {
  readonly consoleErrors: string[] = [];
  readonly pageErrors: string[] = [];
  readonly failedRequests: { url: string; status: number | string; detail?: string }[] = [];
  /**
   * Requests the browser cancelled (see `CANCELLED_BY_BROWSER`). Visible, and
   * assertable by a test that wants to make a claim about them, but never a
   * violation on their own.
   */
  readonly cancelledRequests: string[] = [];
  /**
   * Hosts outside the stack that the browser tried to reach (task 3.7). Recorded
   * from the browser context, so a popup is covered, whatever `allowRequest` or
   * `allowConsole` say. Hosts only, never full URLs.
   */
  readonly outsideHosts = new OutsideHostLog();

  private allowedConsole: Matcher[] = [];
  private allowedRequests: Matcher[] = [];
  /**
   * The two default allowances: the app's documented anonymous "asserted error path".
   * The session bootstrap / refresh calls legitimately return 401 for a logged-out
   * visitor and the ApiClient handles them. These are allowed by default.
   */
  private static readonly DEFAULT_ALLOWED: Matcher[] = [
    '/api/v1/auth/session',
    '/api/v1/auth/refresh',
  ];
  /**
   * Opt-in (SJR task 4.2, design R9-b). When true, the two default allowances apply
   * only to a 401, so a 429 or a 5xx on those URLs is a violation. The journey gate
   * turns it on; the broad matrix keeps the URL-only allowances (SJR 3.22).
   */
  constructor(private readonly statusAwareDefaults = false) {}

  /** Register an expected console error/warning substring or pattern. */
  allowConsole(pattern: Matcher): this {
    this.allowedConsole.push(pattern);
    return this;
  }

  /** Register an expected failed request (an asserted error path). */
  allowRequest(pattern: Matcher): this {
    this.allowedRequests.push(pattern);
    return this;
  }

  isRequestAllowed(url: string, status?: number | string): boolean {
    if (matches(url, this.allowedRequests)) return true;
    if (!matches(url, HarnessGate.DEFAULT_ALLOWED)) return false;
    return this.statusAwareDefaults ? status === 401 : true;
  }

  isConsoleAllowed(text: string): boolean {
    return matches(text, this.allowedConsole);
  }

  collectViolations(): string[] {
    const violations: string[] = [];
    for (const text of this.consoleErrors) {
      if (!this.isConsoleAllowed(text)) violations.push(`console.error: ${text}`);
    }
    for (const err of this.pageErrors) {
      violations.push(`pageerror: ${err}`);
    }
    for (const req of this.failedRequests) {
      if (!this.isRequestAllowed(req.url, req.status)) {
        violations.push(`failed request [${req.status}]: ${req.url}${req.detail ? ` (${req.detail})` : ''}`);
      }
    }
    // The fifth gate: no allowance applies.
    violations.push(...this.outsideHosts.violations());
    return violations;
  }
}

async function attach(page: Page, gate: HarnessGate): Promise<void> {
  const context = page.context();
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') gate.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => gate.pageErrors.push(err?.stack || String(err)));
  // The request listeners live on the browser CONTEXT, not the page, so a popup is
  // covered too (harness specs open popups). No Playwright route is registered: a
  // route turns interception on for every request and the HTTP cache off.
  context.on('request', (req) => gate.outsideHosts.note(req.url(), 'request'));
  context.on('requestfailed', (req) => {
    const errorText = req.failure()?.errorText;
    // A name-resolution failure counts: it is a request to an outside host that
    // the browser refused to resolve. Only ERR_ABORTED is a cancellation.
    gate.outsideHosts.note(req.url(), errorText ? `failed: ${errorText}` : 'failed');
    if (errorText === CANCELLED_BY_BROWSER) {
      gate.cancelledRequests.push(req.url());
      return;
    }
    gate.failedRequests.push({
      url: req.url(),
      status: 'requestfailed',
      detail: errorText,
    });
  });
  // A request the harness CSP refuses never reaches the network, and the browser
  // reports it as a securitypolicyviolation whose blockedURI is the target.
  await context.exposeFunction('__harnessCspViolation', (blockedUri: string) =>
    gate.outsideHosts.note(String(blockedUri), 'refused by CSP'),
  );
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const report = (window as unknown as { __harnessCspViolation?: (uri: string) => void })
        .__harnessCspViolation;
      if (typeof report === 'function') report(event.blockedURI);
    });
  });
  page.on('response', (resp) => {
    const status = resp.status();
    // 5xx and 4xx are both "failed calls"; 4xx that is a documented anonymous
    // error path is allow-listed (see HarnessGate defaults / allowRequest()).
    if (status >= 400) gate.failedRequests.push({ url: resp.url(), status });
  });
}
export const test = base.extend<{ gate: HarnessGate; statusAwareDefaults: boolean }>({
  // Off everywhere except the journey gate's Playwright config (`use: { statusAwareDefaults: true }`).
  statusAwareDefaults: [false, { option: true }],
  gate: [
    async ({ page, statusAwareDefaults }, use) => {
      const gate = new HarnessGate(statusAwareDefaults);
      await attach(page, gate);
      await use(gate);
      const violations = gate.collectViolations();
      if (violations.length > 0) {
        throw new Error(
          `Harness gate failed (${violations.length} violation(s)):\n  - ${violations.join('\n  - ')}`,
        );
      }
    },
    { auto: true },
  ],
});

// Forbid skipping in every harness project. A required test that calls
// test.skip / test.fixme is converted into a hard failure, so a suite can never
// look green while quietly skipping (GOV-04). The gatecheck project relies on
// this to prove the gate fires.
const forbid = (name: string) => {
  return (..._args: unknown[]): never => {
    throw new Error(
      `${name} is forbidden in the strict harness projects — a required test may not be skipped (GOV-04).`,
    );
  };
};
(test as any).skip = forbid('test.skip');
(test as any).fixme = forbid('test.fixme');

export { expect };
// Specs build their own page-scoped helpers on top of these fixtures, so the
// Playwright types they need come from here too — one import, one source.
export type { Page, Locator, APIRequestContext } from '@playwright/test';
