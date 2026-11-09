/**
 * The student journey gate (SJR task 4.2, design R9-b, clauses 2.31, 2.43-2.45, 3.11).
 *
 * One mobile (390x844) journey on the harness stack with the limiter ON, a private
 * bucket, 20-second signed URLs and a 1 Mbit/s uplink. It fails the run when Submit
 * sends nothing, a stored document cannot be reopened, an unsigned storage URL is
 * served, any page or popup sees a 429 or a 5xx, the console shows an error, or the
 * throttle was not actually applied.
 *
 * The staff decision and the acceptance letter are step 13 (SJR task 5.5), added to
 * this same spec: the steps are `test.step` blocks over shared state, in order.
 */
import { request as playwrightRequest } from '@playwright/test';
import { test, expect } from './gate-fixtures';
import { resetRateLimitCounters } from '../helpers/ops';
import { STORAGE_ORIGIN } from './strictStatusGuard';
import { asUpload, makePdf, makePng } from './fixtures';
import {
  chooseProgrammeAndIntake,
  STAFF_DECIDER_EMAIL,
  STAFF_PASSWORD,
  confirmSchoolAndFillPersonal,
  enterFiveGrades,
  gateEmail,
  GATE_ORIGIN,
  IDENTITY_INPUT,
  installUploadProgressProbe,
  observeUploads,
  openInPopup,
  openOrDownload,
  readUploadProgress,
  registerThroughUi,
  SLIP_INPUT,
  viewLink,
} from './journey-steps';

/** 1 Mbit/s in bytes per second, as CDP takes it. */
const UPLINK_BYTES_PER_SECOND = 125_000;
const IDENTITY_BYTES = 2_000_000;
/** The signed-URL lifetime this run configures (`S3_SIGNED_URL_TTL_SECONDS`), plus margin. */
const LINK_LIFETIME_MS = 20_000;
const EXPIRY_MARGIN_MS = 5_000;

test.beforeAll(async () => {
  await resetRateLimitCounters();
});

test('student registers, uploads, reopens a document after expiry, submits and downloads the slip', async ({
  page,
  context,
  gate,
  browser,
  watchContext,
}, testInfo) => {
  test.setTimeout(420_000);
  // The one harness limitation the gate tolerates, and nothing wider: the harness edge's
  // Content-Security-Policy blocks the real gateway's card-widget script, which a harness
  // without a real gateway cannot load. Every other console error or failed call fails.
  gate.allowRequest('https://pay.lenco.co/js/v1/inline.js');
  gate.allowConsole('https://pay.lenco.co/js/v1/inline.js');
  await installUploadProgressProbe(context);
  const uploads = observeUploads(page);

  await test.step('1. register through the UI with a local-format phone', async () => {
    await registerThroughUi(page, gateEmail('journey'));
  });

  await test.step('2. choose a programme and intake, confirm the assigned school, fill personal details', async () => {
    await chooseProgrammeAndIntake(page);
    await confirmSchoolAndFillPersonal(page);
  });

  await test.step('3. five grades survive a reload', async () => {
    await enterFiveGrades(page);
    await page.waitForLoadState('networkidle');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/5\/5 unique minimum/)).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('select')).toHaveCount(10);
  });

  const cdp = await context.newCDPSession(page);
  await test.step('4. throttle the uplink to 1 Mbit/s', async () => {
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150,
      downloadThroughput: -1,
      uploadThroughput: UPLINK_BYTES_PER_SECOND,
    });
  });

  await test.step('5. upload an identity PDF and a result slip PNG: one POST each, visible progress, real duration', async () => {
    await page.locator(IDENTITY_INPUT).setInputFiles(asUpload('identity.pdf', 'application/pdf', makePdf(IDENTITY_BYTES, 'Synthetic identity')));
    await expect(viewLink(page, 'NRC or passport')).toBeVisible({ timeout: 120_000 });
    const slip = await makePng(page, ['SYNTHETIC RESULT SLIP', 'Mathematics 3', 'English 3']);
    await page.locator(SLIP_INPUT).setInputFiles(asUpload('slip.png', 'image/png', slip));
    await expect(viewLink(page, 'Grade 12 result slip')).toBeVisible({ timeout: 120_000 });

    expect(uploads, 'exactly one upload POST per file').toHaveLength(2);
    expect(uploads.map((u) => u.status)).toEqual([201, 201]);
    const progress = await readUploadProgress(page);
    expect(
      progress.some((value) => value > 0 && value < 100),
      `a progressbar must show a value strictly between 0 and 100 (saw ${JSON.stringify(progress.slice(0, 12))})`,
    ).toBe(true);
    const identityMs = (uploads[0]!.finishedAt as number) - uploads[0]!.startedAt;
    const floorMs = ((0.8 * IDENTITY_BYTES) / UPLINK_BYTES_PER_SECOND) * 1000;
    expect(
      identityMs,
      `throttle not applied: the identity upload took ${identityMs} ms, under the ${floorMs} ms floor`,
    ).toBeGreaterThanOrEqual(floorMs);
  });

  await test.step('6. clear the throttle', async () => {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  });

  const documents = [
    { label: 'NRC or passport', type: /application\/pdf/, signature: '%PDF' },
    { label: 'Grade 12 result slip', type: /image\/png/, signature: '\u0089PNG' },
  ];
  const recorded: Array<{ label: string; url: string; at: number }> = [];

  await test.step('7. View opens each stored document from the storage host with the right bytes', async () => {
    for (const doc of documents) {
      const opened = await openInPopup(context, viewLink(page, doc.label), STORAGE_ORIGIN);
      expect(opened.status, `${doc.label}: the popup's main response`).toBe(200);
      expect(opened.contentType).toMatch(doc.type);
      expect(opened.url.startsWith(STORAGE_ORIGIN), 'served from the storage host').toBe(true);
      const query = new URL(opened.url).searchParams;
      expect(query.get('X-Amz-Signature'), 'the URL is signed').toBeTruthy();
      expect(query.get('X-Amz-Expires'), 'the lifetime is the 20 s this run configures').toBe('20');
      // The bytes: read while the URL is still valid, through a client of its own.
      const probe = await playwrightRequest.newContext();
      const bytes = (await (await probe.get(opened.url)).body()).subarray(0, 4).toString('latin1');
      await probe.dispose();
      expect(bytes).toBe(doc.signature);
      recorded.push({ label: doc.label, url: opened.url, at: opened.at });
      await opened.popup.close();
    }
  });

  await test.step('8. after the link expires it is refused, and View still works, also after a reload', async () => {
    const first = recorded[0]!;
    const remaining = first.at + LINK_LIFETIME_MS + EXPIRY_MARGIN_MS - Date.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
    const probe = await playwrightRequest.newContext();
    const expired = await probe.get(first.url);
    await probe.dispose();
    expect(expired.status(), 'the expired signed URL is refused (expiry is real, the bucket is private)').toBe(403);

    const again = await openInPopup(context, viewLink(page, first.label), STORAGE_ORIGIN);
    expect(again.status, 'View after expiry').toBe(200);
    expect(again.url, 'a fresh signature, not the expired one').not.toBe(first.url);
    await again.popup.close();

    await page.reload({ waitUntil: 'domcontentloaded' });
    const afterReload = await openInPopup(context, viewLink(page, first.label), STORAGE_ORIGIN);
    expect(afterReload.status, 'View after a reload').toBe(200);
    await afterReload.popup.close();
  });

  await test.step('9. defer payment: Next is enabled and nothing says a payment is in progress', async () => {
    await page.getByRole('button', { name: /Continue to Payment/ }).click();
    await page.locator('button:has-text("Pay Later")').click();
    await page.getByRole('button', { name: 'Yes, pay later' }).click();
    const toReview = page.getByRole('button', { name: /Continue to Review/ });
    await expect(toReview).toBeEnabled({ timeout: 60_000 });
    await expect(page.getByText(/Payment in progress/i)).toHaveCount(0);
    await toReview.click();
  });

  await test.step('10. confirm and Submit: one submit request, then the slip is on screen and downloads', async () => {
    const submits: number[] = [];
    page.on('response', (response) => {
      if (response.request().method() === 'POST' && /\/applications\/[^/]+\/submit\/$/.test(new URL(response.url()).pathname)) {
        submits.push(response.status());
      }
    });
    await page.getByText('I confirm that all information provided is accurate and complete.').click();
    await page.getByRole('button', { name: /^Submit Application/ }).click();
    await expect(page.getByRole('heading', { name: /Application Submitted/i })).toBeVisible({ timeout: 90_000 });
    expect(submits, 'exactly one submit request, and it succeeded').toEqual([200]);
    await expect(page.getByText('Deferred').first()).toBeVisible();

    const slipButton = page.getByRole('button', { name: /Download Slip/ });
    await expect(slipButton).toBeVisible();
    const download = await openOrDownload(context, page, slipButton, STORAGE_ORIGIN);
    expect(download.status, 'Download Slip').toBe(200);
    expect(download.contentType).toMatch(/application\/pdf/);
  });

  await test.step('11. a session whose access cookie is gone is restored, not sent to sign in', async () => {
    await context.clearCookies({ name: 'access_token' });
    await page.goto(`${GATE_ORIGIN}/student/status`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Application #MIHAS/).first()).toBeVisible({ timeout: 60_000 });
    expect(page.url(), 'not redirected to sign in').not.toMatch(/\/auth\//);
  });

  await test.step('12. the application page opens the slip as a PDF from storage', async () => {
    const slip = page.getByTestId('official-document-application_slip');
    await expect(slip).toBeVisible({ timeout: 60_000 });
    const prepare = slip.getByRole('button', { name: /Prepare/ });
    const open = slip.getByRole('link', { name: /^Open/ });
    // The slip may already be generating after submission: the control then
    // reads "Preparing…" and is disabled until it turns into "Open". Click
    // Prepare only when it is an enabled action; "Open" must appear either way.
    await expect(prepare.or(open).first()).toBeVisible({ timeout: 60_000 });
    if ((await prepare.isVisible()) && (await prepare.isEnabled())) {
      await prepare.click({ timeout: 5_000 }).catch(async (error) => {
        // Swapped for "Open" (or went busy) between the check and the click.
        if ((await prepare.isVisible()) && (await prepare.isEnabled())) throw error;
      });
    }
    await expect(open).toBeVisible({ timeout: 90_000 });
    const opened = await openInPopup(context, open, STORAGE_ORIGIN);
    expect(opened.status, 'slip popup').toBe(200);
    expect(opened.contentType).toMatch(/application\/pdf/);
    const probe = await playwrightRequest.newContext();
    const head = (await (await probe.get(opened.url)).body()).subarray(0, 4).toString('latin1');
    await probe.dispose();
    expect(head).toBe('%PDF');
    await opened.popup.close();
  });

  await test.step('13. a seeded staff account reviews and approves with the payment deferred; the student opens the acceptance letter from storage', async () => {
    // The application number is what a staff member searches by.
    const numberText = (await page.getByText(/Application #MIHAS[\w-]*/).first().textContent()) ?? '';
    const applicationNumber = /#(MIHAS[\w-]*)/.exec(numberText)?.[1];
    expect(applicationNumber, 'the student page shows its application number').toBeTruthy();

    const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    watchContext(staffContext);
    const staff = await staffContext.newPage();
    const staffConsoleErrors: string[] = [];
    staff.on('console', (message) => {
      if (message.type() === 'error') staffConsoleErrors.push(message.text());
    });
    try {
      await staff.goto(`${GATE_ORIGIN}/auth/signin`, { waitUntil: 'domcontentloaded' });
      await staff.getByLabel(/email/i).first().fill(STAFF_DECIDER_EMAIL);
      await staff.getByLabel('Password', { exact: true }).fill(STAFF_PASSWORD);
      await staff.getByRole('button', { name: /sign in/i }).click();
      await staff.waitForURL(/\/admin/, { timeout: 60_000 });

      // The roster filters by the `search` query parameter; the narrow layout keeps
      // the filter panel closed, so the staff member uses the link a person can share.
      await staff.goto(`${GATE_ORIGIN}/admin/applications?search=${encodeURIComponent(applicationNumber as string)}`, {
        waitUntil: 'domcontentloaded',
      });
      await staff.getByRole('button', { name: 'Open review' }).first().click({ timeout: 60_000 });

      // Submitted -> under review -> approved, with the payment still deferred.
      await staff.getByRole('button', { name: /^Review$/ }).click({ timeout: 60_000 });
      const approve = staff.getByRole('button', { name: /^Approve$/ });
      await expect(approve).toBeEnabled({ timeout: 60_000 });
      await approve.click();
      await staff.getByRole('button', { name: /^Approve$/ }).last().click();
      // The decision is recorded when Approve is no longer offered; the student's
      // page below is the proof that it reached the platform.
      await expect(staff.getByRole('button', { name: /^Approve$/ })).toHaveCount(0, { timeout: 60_000 });
      await staff.screenshot({ path: `${testInfo.outputDir}/staff-approved.png` });
    } finally {
      expect(staffConsoleErrors, 'no console errors on the staff pages').toEqual([]);
      await staffContext.close();
    }

    // The student sees the decision and opens the letter: a stored PDF.
    await page.goto(`${GATE_ORIGIN}/student/status`, { waitUntil: 'domcontentloaded' });
    const letter = page.getByTestId('official-document-acceptance_letter');
    await expect(letter).toBeVisible({ timeout: 60_000 });
    const prepare = letter.getByRole('button', { name: /Prepare/ });
    const open = letter.getByRole('link', { name: /^Open/ });
    await expect(prepare.or(open).first()).toBeVisible({ timeout: 60_000 });
    if ((await prepare.isVisible()) && (await prepare.isEnabled())) {
      await prepare.click({ timeout: 5_000 }).catch(async (error) => {
        if ((await prepare.isVisible()) && (await prepare.isEnabled())) throw error;
      });
    }
    await expect(open).toBeVisible({ timeout: 90_000 });
    const opened = await openInPopup(context, open, STORAGE_ORIGIN);
    expect(opened.status, 'letter popup').toBe(200);
    expect(opened.contentType).toMatch(/application\/pdf/);
    const probe = await playwrightRequest.newContext();
    const head = (await (await probe.get(opened.url)).body()).subarray(0, 4).toString('latin1');
    await probe.dispose();
    expect(head).toBe('%PDF');
    await opened.popup.close();
  });
});
