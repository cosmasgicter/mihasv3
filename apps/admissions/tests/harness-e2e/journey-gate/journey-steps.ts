/**
 * The student's UI steps, shared by the journey-gate specs (SJR task 4.2).
 *
 * Each helper drives the real interface the way the by-hand recipes in the SJR
 * evidence do. None of them reads or writes the database or calls an API a student's
 * browser would not.
 */
import { expect, type BrowserContext, type Locator, type Page, type Response } from '@playwright/test';
import { tenantOrigin } from '../helpers/api';

/** The seeded school host the gate registers on (an example tenant, not the platform). */
export const GATE_TENANT_HOST = 'mihas.localhost';
export const GATE_ORIGIN = tenantOrigin(GATE_TENANT_HOST);
/** A phone in the local format the registration form must accept (R8-b). */
export const GATE_PHONE_LOCAL = '0971234567';
export const GATE_PASSWORD = 'HarnessStudent123';
/** The seeded staff account that can decide (SJR R7-a): `review`, nothing else. */
export const STAFF_DECIDER_EMAIL = `decider@${GATE_TENANT_HOST}`;
/** The harness's committed, non-secret seed password (`harness/harness.env`). */
export const STAFF_PASSWORD = process.env.HARNESS_TENANT_ADMIN_PASSWORD || 'HarnessTenant123!';

export const IDENTITY_INPUT = 'input[type=file][aria-label="Upload NRC or passport"]';
export const SLIP_INPUT = 'input[type=file][aria-label="Upload Grade 12 result slip"]';
export const UPLOAD_PATH = '/api/v1/documents/upload/';

export function gateEmail(tag: string): string {
  return `gate.${tag}.${Date.now()}${Math.floor(Math.random() * 1e4)}@example.com`;
}

/** Step 1: register through the form, with a local-format phone number. */
export async function registerThroughUi(page: Page, email: string): Promise<void> {
  await page.goto(`${GATE_ORIGIN}/auth/signup`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=first_name]', 'Gate');
  await page.fill('input[name=last_name]', 'Student');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=phone]', GATE_PHONE_LOCAL);
  await page.fill('input[name=password]', GATE_PASSWORD);
  await page.fill('input[name=confirmPassword]', GATE_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL(/\/student\/dashboard/, { timeout: 60_000 });
}

/** Step 2a: choose the seeded programme and this school's intake; the wizard lands on Step 2. */
export async function chooseProgrammeAndIntake(page: Page): Promise<void> {
  await page.goto(`${GATE_ORIGIN}/student/application-wizard?mode=new`, { waitUntil: 'domcontentloaded' });
  await page.locator('button:has-text("Select programme")').click();
  await page.getByRole('option').first().click();
  await page.locator('button:has-text("Select intake")').click();
  await page.getByRole('option', { name: /MIHAS January 2027/ }).click();
  await page.getByRole('button', { name: /^Next step$/ }).click();
}

/** Step 2b: the assigned school is confirmed, then personal details are filled in. */
export async function confirmSchoolAndFillPersonal(page: Page): Promise<void> {
  await expect(page.getByText('Mikango Institute of Health & Allied Sciences').first()).toBeVisible({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: /^Next step$/ }).click();
  const fill = async (name: string, value: string) => {
    const input = page.locator(`input[name=${name}]`);
    await expect(input).toBeVisible({ timeout: 60_000 });
    if (!(await input.inputValue())) await input.fill(value);
  };
  await fill('full_name', 'Gate Student');
  await fill('nrc_number', '123456/78/1');
  await fill('date_of_birth', '2004-05-04');
  await fill('phone', '+260971234567');
  await fill('country', 'Zambia');
  await fill('residence_town', 'Lusaka');
  await page.locator('button:has-text("Select sex")').click();
  await page.getByRole('option', { name: 'Male', exact: true }).first().click();
  await page.getByRole('button', { name: /^Next step$/ }).click();
  await expect(page.locator('input[type=file]').first()).toBeAttached({ timeout: 60_000 });
}

/** Step 3: five distinct subjects with a grade each. Returns the draft id from the URL. */
export async function enterFiveGrades(page: Page): Promise<string> {
  for (let i = 1; i <= 5; i += 1) {
    if (i === 1) await page.locator('button:has-text("Add First Subject")').click();
    else await page.locator('button[aria-label="Add another subject"]').last().click();
    const subject = page.locator('select').nth(2 * (i - 1));
    const grade = page.locator('select').nth(2 * (i - 1) + 1);
    await expect(grade).toBeVisible();
    const values = await subject
      .locator('option')
      .evaluateAll((options) =>
        options
          .filter((o) => !(o as HTMLOptionElement).disabled && (o as HTMLOptionElement).value && !(o as HTMLOptionElement).value.startsWith('__'))
          .map((o) => (o as HTMLOptionElement).value),
      );
    await subject.selectOption(values[i]!);
    await grade.selectOption({ index: 3 });
  }
  await expect(page.getByText(/5\/5 unique minimum/)).toBeVisible();
  const draftId = new URL(page.url()).searchParams.get('draftId');
  expect(draftId, 'the wizard URL should carry the draft id').toBeTruthy();
  return draftId as string;
}

export interface UploadObservation {
  method: string;
  status: number | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Record every upload POST (request start, response end) made by the page. */
export function observeUploads(page: Page): UploadObservation[] {
  const seen: UploadObservation[] = [];
  const open = new Map<unknown, UploadObservation>();
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !new URL(request.url()).pathname.endsWith(UPLOAD_PATH)) return;
    const record: UploadObservation = { method: 'POST', status: null, startedAt: Date.now(), finishedAt: null };
    open.set(request, record);
    seen.push(record);
  });
  page.on('response', (response) => {
    const record = open.get(response.request());
    if (!record) return;
    record.status = response.status();
    record.finishedAt = Date.now();
  });
  return seen;
}

/** Sample every upload progress bar's value for the whole page lifetime (registered before navigation). */
export async function installUploadProgressProbe(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __uploadProgress: number[] };
    w.__uploadProgress = [];
    const sample = () => {
      document.querySelectorAll('[role="progressbar"]').forEach((el) => {
        const label = el.getAttribute('aria-label') || '';
        const now = el.getAttribute('aria-valuenow');
        if (label.startsWith('Upload progress') && now !== null) w.__uploadProgress.push(Number(now));
      });
    };
    new MutationObserver(sample).observe(document, { subtree: true, childList: true, attributes: true });
  });
}

export function readUploadProgress(page: Page): Promise<number[]> {
  return page.evaluate(() => (window as unknown as { __uploadProgress?: number[] }).__uploadProgress ?? []);
}

/** The View link for a document row, by the label its requirement card carries. */
export function viewLink(page: Page, requirementLabel: string): Locator {
  return page.getByRole('link', { name: new RegExp(`^View\\s+${requirementLabel}`, 'i') });
}

export interface OpenedDocument {
  /** The signed storage URL the popup landed on (contains a signature: never log it). */
  url: string;
  status: number;
  contentType: string;
  /** Wall-clock time the popup's storage response arrived. */
  at: number;
  popup: Page;
}

/**
 * Click an opener link, wait for the popup, and return its main response from the
 * storage host. The popup first loads the SPA's `/student/documents/open`, which asks
 * the platform for a fresh URL and replaces itself with it.
 */
export async function openInPopup(
  context: BrowserContext,
  trigger: Locator,
  storageOrigin: string,
): Promise<OpenedDocument> {
  const arrived = new Promise<Response>((resolve) => {
    const onResponse = (response: Response) => {
      if (response.url().startsWith(storageOrigin) && response.request().isNavigationRequest()) {
        context.off('response', onResponse);
        resolve(response);
      }
    };
    context.on('response', onResponse);
  });
  const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 30_000 }), trigger.click()]);
  const response = await Promise.race([
    arrived,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('the popup never reached the storage host')), 45_000),
    ),
  ]);
  return {
    url: response.url(),
    status: response.status(),
    contentType: (response.headers()['content-type'] || '').toLowerCase(),
    at: Date.now(),
    popup,
  };
}

/**
 * A control that hands the browser a document: it may open a tab on the storage URL or
 * start a download of it. Returns what the storage host answered either way.
 */
export async function openOrDownload(
  context: BrowserContext,
  page: Page,
  trigger: Locator,
  storageOrigin: string,
): Promise<{ url: string; status: number; contentType: string }> {
  const answered = new Promise<Response>((resolve) => {
    const onResponse = (response: Response) => {
      if (response.url().startsWith(storageOrigin)) {
        context.off('response', onResponse);
        resolve(response);
      }
    };
    context.on('response', onResponse);
  });
  await trigger.click();
  const response = await Promise.race([
    answered,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('no response from the storage host after the control was used')), 90_000),
    ),
  ]);
  void page;
  return {
    url: response.url(),
    status: response.status(),
    contentType: (response.headers()['content-type'] || '').toLowerCase(),
  };
}
