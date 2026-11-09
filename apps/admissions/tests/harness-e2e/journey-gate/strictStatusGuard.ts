/**
 * Strict status guard for the journey gate (SJR task 4.2, design R9-b, clause 2.45).
 *
 * `harness-fixtures.ts` listens on the test's main page only, and its default
 * allowances for `/api/v1/auth/session` and `/api/v1/auth/refresh` match on URL, so a
 * 429 or a 5xx on those two URLs would pass. A popup opened by a View control is a
 * different page again. This guard closes both gaps: it listens on the whole
 * **browser context** (Playwright emits context-level `response` events for every
 * page in the context, popups included) and records a violation for any response
 * with status 429 or >= 500 on any URL, whatever `gate.allowRequest` says.
 *
 * Violations name the method, status, origin and path only: never the query string,
 * because a signed storage URL carries its signature there.
 *
 * Deliberate probes (the expired-URL request in step 8) go through a standalone
 * `APIRequestContext`, whose responses are not page events, so they are unaffected.
 */
import type { BrowserContext } from '@playwright/test';

export interface StatusViolation {
  status: number;
  method: string;
  /** `origin + pathname`; never a query string. */
  where: string;
}

export class StrictStatusGuard {
  readonly violations: StatusViolation[] = [];
  /** Requests to the object-storage origin that carried no signature (clause 2.45). */
  readonly unsignedStorageRequests: string[] = [];

  describe(): string[] {
    return [
      ...this.violations.map((v) => `${v.method} ${v.status} ${v.where}`),
      ...this.unsignedStorageRequests.map((where) => `unsigned storage URL ${where}`),
    ];
  }
}

/** The object-storage origin the gate's signing endpoint points a browser at. */
export const STORAGE_ORIGIN = process.env.HARNESS_STORAGE_ORIGIN || 'http://localhost:59000';

/** True for the statuses the gate never tolerates, on any URL. */
export function isForbiddenStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

export function redactedLocation(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.origin}${url.pathname}`;
  } catch {
    return '(unparseable url)';
  }
}

/** Register the guard on a context. Call it on every context the gate creates. */
export function attachStrictStatusGuard(
  context: BrowserContext,
  guard: StrictStatusGuard = new StrictStatusGuard(),
): StrictStatusGuard {
  context.on('response', (response) => {
    const status = response.status();
    if (!isForbiddenStatus(status)) return;
    guard.violations.push({
      status,
      method: response.request().method(),
      where: redactedLocation(response.url()),
    });
  });
  // A browser that reaches storage without a signature is reading a public object: the
  // bucket is meant to be private in this run (`HARNESS_BUCKET_ANONYMOUS=none`).
  context.on('request', (request) => {
    const url = request.url();
    if (!url.startsWith(STORAGE_ORIGIN)) return;
    if (!new URL(url).searchParams.has('X-Amz-Signature')) {
      guard.unsignedStorageRequests.push(redactedLocation(url));
    }
  });
  return guard;
}
