/**
 * A near-limit upload on a slow uplink (SJR task 4.2, design R9-b; requirement R2.1,
 * findings A-03 and the client's one-retry duplicate).
 *
 * A generated 9.5 MB PDF (the limit is 10 MB) goes up at 1 Mbit/s, which takes about
 * 80 seconds. The upload must not time out, must not be sent twice, and must end in a
 * stored document the student can open.
 */
import { test, expect } from './gate-fixtures';
import { resetRateLimitCounters } from '../helpers/ops';
import { prepareDraft, registerAndSignInOnPage } from './gate-api';
import { asUpload, makePdf } from './fixtures';
import { IDENTITY_INPUT, observeUploads, viewLink } from './journey-steps';

const UPLINK_BYTES_PER_SECOND = 125_000;
const BYTES = 9_500_000;

test.beforeAll(async () => {
  await resetRateLimitCounters();
});

test('a 9.5 MB PDF uploads once over a 1 Mbit/s uplink and can be opened', async ({ page, context, gate }) => {
  test.setTimeout(300_000);
  gate.allowRequest('https://pay.lenco.co/js/v1/inline.js');
  gate.allowConsole('https://pay.lenco.co/js/v1/inline.js');
  const student = await registerAndSignInOnPage(page, 'nearlimit');
  const { applicationId } = await prepareDraft(student, { grades: true });

  const uploads = observeUploads(page);
  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}&step=education`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.locator(IDENTITY_INPUT)).toBeAttached({ timeout: 60_000 });

  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: -1,
    uploadThroughput: UPLINK_BYTES_PER_SECOND,
  });

  await page.locator(IDENTITY_INPUT).setInputFiles(asUpload('identity.pdf', 'application/pdf', makePdf(BYTES, 'Synthetic identity')));
  await expect(viewLink(page, 'NRC or passport')).toBeVisible({ timeout: 240_000 });

  expect(uploads, 'one upload POST: no timeout, no duplicate retry').toHaveLength(1);
  expect(uploads[0]!.status).toBe(201);
  const ms = (uploads[0]!.finishedAt as number) - uploads[0]!.startedAt;
  expect(ms, 'throttle not applied').toBeGreaterThanOrEqual(((0.8 * BYTES) / UPLINK_BYTES_PER_SECOND) * 1000);
});
