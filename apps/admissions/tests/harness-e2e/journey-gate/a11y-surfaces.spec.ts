/**
 * Accessibility of the surfaces this spec added (SJR task 4.2, design R9-b; clause 3.11).
 *
 * At 390x844, axe (the same tags `axe-viewport-sweep.spec.ts` uses) runs over the
 * application page's documents list and over the opener's two on-screen states: an
 * invalid link and a document that does not exist. Any critical or serious violation,
 * or any horizontal scrolling, fails the run.
 */
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './gate-fixtures';
import { resetRateLimitCounters } from '../helpers/ops';
import { prepareDraft, registerAndSignInOnPage } from './gate-api';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test.beforeAll(async () => {
  await resetRateLimitCounters();
});

async function expectAccessible(page: Page, label: string): Promise<void> {
  // The HTML preloader fades out over 350 ms; scanning it mid-fade measures the transition,
  // not the page, so wait until it is gone.
  await expect(page.locator('#preloader')).toHaveCount(0, { timeout: 30_000 });
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'critical' || v.impact === 'serious')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(' ')}`);
  expect(blocking, `${label}: critical or serious accessibility violations`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `${label}: horizontal scrolling`).toBeLessThanOrEqual(0);
}

test('the documents list and the opener states are accessible at 390x844', async ({ page, gate }) => {
  gate.allowRequest('https://pay.lenco.co/js/v1/inline.js');
  gate.allowConsole('https://pay.lenco.co/js/v1/inline.js');
  // The opener's not-found state is reached by asking for a document that does not exist:
  // the 404 on its signing call, and the browser's one console line about it, are the
  // asserted error path of this spec and nothing else.
  gate.allowRequest(/\/api\/v1\/documents\/[0-9a-f-]{36}\/signed-url\/$/);
  gate.allowConsole('Failed to load resource: the server responded with a status of 404 (Not Found)');
  const student = await registerAndSignInOnPage(page, 'a11y');
  const { applicationId } = await prepareDraft(student, { grades: true, documents: true, deferPayment: true });
  const submit = await student.ctx.post(`/api/v1/applications/${applicationId}/submit/`, {
    headers: { 'x-csrf-token': student.csrf, 'idempotency-key': `gate-a11y-${applicationId}` },
    data: { confirm_submission: true },
  });
  expect(submit.ok(), `submit should succeed (got ${submit.status()})`).toBe(true);

  await page.goto(`/student/status`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Supporting documents')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: /^View/ }).first()).toBeVisible();
  await expectAccessible(page, 'documents list');

  await page.goto(`/student/documents/open?doc=not-a-uuid`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
  await expectAccessible(page, 'opener: invalid link');

  await page.goto(`/student/documents/open?doc=${randomUUID()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 60_000 });
  await expectAccessible(page, 'opener: not found');
});
