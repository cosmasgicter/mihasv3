/**
 * Submit at 1440x900 (SJR task 4.2, design R9-b; requirement R6.1, clause 2.31).
 *
 * The mobile journey proves Submit at 390x844. This proves the same click at desktop
 * width: a ready draft is prepared through the student's own API commands, then the
 * student confirms and presses Submit in the interface, and the request and the
 * submitted state are asserted.
 */
import { test, expect } from './gate-fixtures';
import { resetRateLimitCounters } from '../helpers/ops';
import { prepareDraft, registerAndSignInOnPage } from './gate-api';

test.beforeAll(async () => {
  await resetRateLimitCounters();
});

test('a ready draft is submitted from the desktop interface', async ({ page, gate }) => {
  gate.allowRequest('https://pay.lenco.co/js/v1/inline.js');
  gate.allowConsole('https://pay.lenco.co/js/v1/inline.js');
  const student = await registerAndSignInOnPage(page, 'desktop');
  const { applicationId } = await prepareDraft(student, { grades: true, documents: true, deferPayment: true });

  const submits: number[] = [];
  page.on('response', (response) => {
    if (response.request().method() === 'POST' && /\/applications\/[^/]+\/submit\/$/.test(new URL(response.url()).pathname)) {
      submits.push(response.status());
    }
  });

  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}&step=review`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('I confirm that all information provided is accurate and complete.').click();
  await page.getByRole('button', { name: /^Submit Application/ }).click();
  await expect(page.getByRole('heading', { name: /Application Submitted/i })).toBeVisible({ timeout: 90_000 });
  expect(submits, 'one submit request, and it succeeded').toEqual([200]);
  await expect(page.getByRole('button', { name: /Download Slip/ })).toBeVisible();
});
