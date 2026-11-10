/**
 * Required V2 harness — an edit made offline survives the page going away
 * (admissions-v2 task 6.3: "refresh/offline/two-tab/device-switch E2E").
 *
 * Requirements: **R10.4** (local pending data is keyed by user + draft, encrypted,
 * and cleared on logout / sync / delete / submit), **R10.7** (offline is visible
 * and typing is never blocked), **R10.8** (refresh during a step, offline edit and
 * reconnect). Findings: **STU-02**.
 *
 * The mobile journey proves the student is told they are offline and that typing
 * works. This one proves what that message promises — "saved on this device" — by
 * taking the page away while the edit exists only there. It is what the browser
 * run measured failing 5 times out of 5 (docs/v2-evidence/6.3/raw/m13-04-*):
 *
 *   1. the student opens their draft, loses the network, and types;
 *   2. the tab is closed before any save could reach the server;
 *   3. back online, the student reopens the draft in a new tab;
 *   4. the edit is shown, and the draft machine sends it — once, on the version the
 *      edit was made on — so the server holds it at exactly one version step.
 *
 * It is run twice: at normal speed, and with the encryption-key derivation slowed
 * by 1.5 s (a low-end phone), because the outbox is readable only once that key
 * exists and the run measured the wizard reading it before then.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createInstitutionViaApi,
  createIntake,
  linkIntake,
  listCanonicalPrograms,
  registerAndLoginStudent,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';
import type { BrowserContext } from '@playwright/test';

let sharedAdmin: Promise<AuthedContext> | null = null;
function platformAdmin(): Promise<AuthedContext> {
  sharedAdmin ??= superAdminContext();
  return sharedAdmin;
}

test.afterAll(async () => {
  if (sharedAdmin) {
    const admin = await sharedAdmin;
    await admin.ctx.dispose();
    sharedAdmin = null;
  }
});

/** The harness noise every required wizard journey allows (see the characterisation spec). */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

/** A tenant offering one canonical program on its own intake, with a fee. */
async function configureOffering(label: string) {
  const admin = await platformAdmin();
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${label} School ${stamp}`,
    code: `T63O${stamp}`,
    hostname: `t63o-${stamp}.localhost`,
  });
  const { intakeId } = await createIntake(admin, { name: `${label} Intake ${stamp}`, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `T63OP${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });
  return { canonicalProgramId: canonical.id as string, intakeId };
}

async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  await ctx.dispose();
  const login = await page.request.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `student browser login should succeed (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { email, csrf };
}

/**
 * Slow the encryption-key derivation the way a low-end phone does. Timing only:
 * the derived key, and everything the app does with it, are unchanged.
 */
async function slowKeyDerivation(context: BrowserContext, delayMs: number): Promise<void> {
  await context.addInitScript((ms: number) => {
    const subtle = crypto.subtle;
    const derive = subtle.deriveKey.bind(subtle);
    (subtle as unknown as { deriveKey: SubtleCrypto['deriveKey'] }).deriveKey = (async (
      ...args: Parameters<SubtleCrypto['deriveKey']>
    ) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return derive(...args);
    }) as SubtleCrypto['deriveKey'];
  }, delayMs);
}

/** Navigate a resumed draft from its derived resume step to Personal (F3's helper). */
async function openPersonalStep(page: Page): Promise<void> {
  const summary = page.getByTestId('wizard-progress-summary');
  const town = page.getByLabel(/town|city/i).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(summary).toContainText(/Step [234] of 6/, { timeout: 60_000 });
    const currentStep = await summary.locator('p').first().textContent();
    if (currentStep?.includes('Step 2 of 6')) {
      const continueToPersonal = page.getByRole('button', { name: /^next step$/i });
      await expect(continueToPersonal).toBeEnabled({ timeout: 60_000 });
      await continueToPersonal.click();
    } else if (!currentStep?.includes('Step 3 of 6')) {
      const personalStep = page.getByRole('button', { name: /Step 3: Personal/i });
      await expect(personalStep).toBeEnabled({ timeout: 60_000 });
      await personalStep.click();
    }
    try {
      await expect(town).toBeVisible({ timeout: 10_000 });
      await expect(summary).toContainText('Step 3 of 6');
      return;
    } catch {
      // A cached resume step may have painted before the authoritative one.
    }
  }
  await expect(town).toBeVisible({ timeout: 60_000 });
}

/**
 * Wait until the page has stopped fetching, so the network cut is a cut and not a
 * torn chunk download (the reason is in student-wizard-mobile.spec.ts).
 */
async function waitForNetworkQuiet(page: Page, quietMs = 2_500, timeoutMs = 60_000): Promise<void> {
  let inFlight = 0;
  let lastActivity = Date.now();
  const onRequest = () => {
    inFlight += 1;
    lastActivity = Date.now();
  };
  const onSettled = () => {
    inFlight = Math.max(0, inFlight - 1);
    lastActivity = Date.now();
  };
  page.on('request', onRequest);
  page.on('requestfinished', onSettled);
  page.on('requestfailed', onSettled);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (inFlight === 0 && Date.now() - lastActivity >= quietMs) return;
      await page.waitForTimeout(100);
    }
    throw new Error(`the page was still fetching after ${timeoutMs}ms, so the network cut would not be deterministic`);
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onSettled);
    page.off('requestfailed', onSettled);
  }
}

/** The encrypted outbox record for one draft, as stored (or null). */
function storedOutboxRecord(page: Page, applicationId: string): Promise<string | null> {
  return page.evaluate((id) => {
    const key = Object.keys(localStorage).find(
      (candidate) => candidate.startsWith('beanola_secure_applicationWizardDraft:') && candidate.endsWith(`:${id}`),
    );
    return key ? localStorage.getItem(key) : null;
  }, applicationId);
}

function unwrap(json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as { data?: unknown };
  return ((body.data ?? body) as Record<string, unknown>) ?? {};
}

for (const [label, deriveDelayMs] of [
  ['normal speed', 0],
  ['slow key derivation (+1.5 s, a low-end phone)', 1_500],
] as const) {
  test(`an edit typed offline survives closing the tab and is sent once when the draft is reopened — ${label}`, async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);
    const context = page.context();
    if (deriveDelayMs > 0) await slowKeyDerivation(context, deriveDelayMs);

    const offering = await configureOffering('Offline Outbox');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });
    const draftPath = `/api/v1/applications/drafts/${applicationId}/`;
    const readDraft = async () => {
      const response = await page.request.get(draftPath);
      expect(response.ok(), `the canonical draft should be readable (got ${response.status()})`).toBeTruthy();
      return unwrap(await response.json());
    };
    const initial = await readDraft();
    const initialVersion = Number(initial.version);
    expect(Number.isInteger(initialVersion) && initialVersion > 0).toBeTruthy();

    // 1. The first tab opens the draft, loses the network, and the student types.
    //    It is a second page of the same browser, so its deliberate offline
    //    failures are its own; the gate watches the tab the student comes back to.
    const offlineTab = await context.newPage();
    const offlineTabErrors: string[] = [];
    offlineTab.on('pageerror', (error) => offlineTabErrors.push(`pageerror: ${error.message}`));
    const offlineTabWrites: string[] = [];
    offlineTab.on('request', (request) => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname === draftPath) {
        offlineTabWrites.push(request.url());
      }
    });
    await offlineTab.goto(`/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicationId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(offlineTab.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    await openPersonalStep(offlineTab);
    await waitForNetworkQuiet(offlineTab);
    const recordBeforeEdit = await storedOutboxRecord(offlineTab, applicationId);

    await context.setOffline(true);
    await offlineTab.evaluate(() => window.dispatchEvent(new Event('offline')));
    const offlineTown = `Offline outbox ${Date.now()}`;
    await offlineTab.getByLabel(/town|city/i).first().fill(offlineTown);
    const offlineBadge = offlineTab.getByTestId('wizard-offline-badge');
    await expect(offlineBadge).toBeVisible({ timeout: 30_000 });
    await expect(offlineBadge).toContainText(/saved on this device/i);
    // What the badge promises: the edit is in this device's encrypted outbox.
    await expect
      .poll(async () => (await storedOutboxRecord(offlineTab, applicationId)) !== recordBeforeEdit, {
        timeout: 15_000,
        message: 'the offline edit is written to the encrypted outbox record',
      })
      .toBe(true);
    const stored = await storedOutboxRecord(offlineTab, applicationId);
    expect(stored, 'the outbox record exists').not.toBeNull();
    expect(() => JSON.parse(String(stored)), 'the outbox record is stored encrypted, not as JSON').toThrow();

    // 2. The tab goes away before anything could reach the server.
    await offlineTab.close();
    expect(offlineTabWrites, 'nothing is sent while offline').toEqual([]);
    expect(offlineTabErrors, 'the offline tab raised no page error').toEqual([]);
    expect(String((await readDraft()).residence_town), 'the server never saw the offline edit').not.toBe(offlineTown);

    // 3. Back online, the student reopens the draft.
    await context.setOffline(false);
    const recoveryWrites: Array<{ status: number; expected: unknown }> = [];
    page.on('response', (response) => {
      if (response.request().method() === 'PATCH' && new URL(response.url()).pathname === draftPath) {
        let expected: unknown = null;
        try {
          expected = (JSON.parse(response.request().postData() ?? '{}') as { expected_version?: unknown })
            .expected_version;
        } catch {
          expected = null;
        }
        recoveryWrites.push({ status: response.status(), expected });
      }
    });
    await page.goto(`/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicationId)}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    await openPersonalStep(page);

    // 4. The edit is shown, sent once on the version it was made on, and held by the server.
    await expect(page.getByLabel(/town|city/i).first(), 'the reopened draft shows the offline edit').toHaveValue(
      offlineTown,
      { timeout: 30_000 },
    );
    await expect
      .poll(async () => String((await readDraft()).residence_town), {
        timeout: 30_000,
        message: 'the recovered edit reaches the server',
      })
      .toBe(offlineTown);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000);
    expect(recoveryWrites, 'the recovered edit is one write, on the version it was made on').toEqual([
      { status: 200, expected: initialVersion },
    ]);
    const final = await readDraft();
    expect(Number(final.version), 'one version step, no second write').toBe(initialVersion + 1);
    await expect(page.getByRole('button', { name: /reload latest draft/i })).toHaveCount(0);
    await expect(page.getByTestId('wizard-offline-badge')).toHaveCount(0);

    // One draft, not two.
    const list = await page.request.get('/api/v1/applications/drafts/?pageSize=100');
    expect(list.ok()).toBeTruthy();
    const listBody = unwrap(await list.json()) as { results?: Array<{ id?: unknown }> } | Array<{ id?: unknown }>;
    const rows = Array.isArray(listBody) ? listBody : (listBody.results ?? []);
    expect(rows.map((row) => String(row.id)), 'recovery never starts a second application').toEqual([applicationId]);
  });
}
