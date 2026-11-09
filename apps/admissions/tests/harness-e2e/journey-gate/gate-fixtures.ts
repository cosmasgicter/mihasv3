/**
 * Fixtures for the journey gate (SJR task 4.2, design R9-b).
 *
 * Builds on the harness fixtures (console errors, page errors, failed requests, no
 * skips), whose status-aware mode the gate's Playwright config turns on, and adds:
 *
 *   - `strict`   : the context-level 429 / >= 500 / unsigned-storage guard, on the
 *                  test's context (and so on every popup it opens);
 *   - `headroom` : per-scope request counts, written to `rate-limit-headroom.json`.
 *
 * Both are automatic, and fail the test at teardown when they saw a violation.
 */
import { test as base, expect } from '../harness-fixtures';
import type { BrowserContext } from '@playwright/test';
import { attachStrictStatusGuard, StrictStatusGuard } from './strictStatusGuard';
import { RateLimitHeadroom } from './rateLimitHeadroom';

export interface GateFixtures {
  strict: StrictStatusGuard;
  headroom: RateLimitHeadroom;
  /** Put another browser context (the staff actor's, a second client) under the same guards. */
  watchContext: (context: BrowserContext) => void;
}

export const test = base.extend<GateFixtures>({
  strict: [
    async ({ context }, provide) => {
      const guard = attachStrictStatusGuard(context);
      await provide(guard);
      expect(guard.describe(), 'no 429, no 5xx and no unsigned storage URL on any page or popup').toEqual([]);
    },
    { auto: true },
  ],
  headroom: [
    async ({ context }, provide, testInfo) => {
      const headroom = new RateLimitHeadroom(testInfo.titlePath.slice(1).join(' > ') || testInfo.title);
      headroom.watch(context);
      try {
        await provide(headroom);
      } finally {
        headroom.write();
      }
    },
    { auto: true },
  ],
  watchContext: async ({ strict, headroom }, provide) => {
    await provide((context) => {
      attachStrictStatusGuard(context, strict);
      headroom.watch(context);
    });
  },
});

export { expect };
export type { Page, Locator, APIRequestContext } from '@playwright/test';
