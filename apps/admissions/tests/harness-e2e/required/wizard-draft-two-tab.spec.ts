/**
 * Required V2 harness — two tabs of ONE browser on one draft (admissions-v2
 * task 6.3: "refresh/offline/two-tab/device-switch E2E").
 *
 * Requirements: **R10.2** (one draft machine per wizard), **R10.3** (a stale
 * version is an explicit conflict, never a silent latest-timestamp pick),
 * **R10.4 / R10.10** (local pending data is keyed by user + draft and cleanup is
 * scoped to it), **R10.7** (conflict is visible and recoverable).
 * Findings: **STU-02**, **GATE-13.2-03**.
 *
 * `two-tenant-adversarial-matrix.spec.ts` F3 proves the *device* switch with two
 * independent browser contexts — nothing shared but the server. Two tabs of one
 * browser share more: the cookie jar and, above all, the local outbox record,
 * which is addressed by `(user, application)` and so is the SAME record in both
 * tabs. That is the case this journey adds:
 *
 *   1. both tabs open the draft; hydration and step navigation write nothing;
 *   2. tab A wins through Save now;
 *   3. tab B, still on the old version, gets an explicit 409 conflict — Save now
 *      is disabled and "Reload latest draft" is offered — and its reload shows
 *      the winner;
 *   4. tab A, refreshed afterwards, opens clean: tab B's stale edit in the shared
 *      outbox record neither overwrites the winner nor reopens a conflict;
 *   5. the server holds the winner at exactly one version step, as one draft.
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
    code: `T63${stamp}`,
    hostname: `t63-${stamp}.localhost`,
  });
  const intakeName = `${label} Intake ${stamp}`;
  const { intakeId } = await createIntake(admin, { name: intakeName, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `T63P${stamp}`,
  });
  await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
  await createFee(admin, offeringId, { amount: '153.00' });
  return {
    canonicalProgramId: canonical.id as string,
    intakeId,
    intakeName,
    programName: canonical.name as string,
  };
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
 * Keep this journey's deliberately ordered manual saves ahead of the 8-second
 * sweep (the same instrument F3 uses). Save now still runs the production path.
 */
async function postponeWizardAutosave(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window);
    window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) =>
      nativeSetInterval(handler, timeout === 8_000 ? 600_000 : timeout, ...args)) as typeof window.setInterval;
  });
}

/** Navigate a resumed draft from its derived resume step to Personal (F3's helper). */
async function openPersonalStep(page: Page): Promise<void> {
  const summary = page.getByTestId('wizard-progress-summary');
  const town = page.getByLabel(/town|city/i).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await expect(summary).toContainText(/Step [234] of 6/, { timeout: 60_000 });
    const currentStep = await summary.locator('p').first().textContent();
    if (currentStep?.includes('Step 2 of 6')) {
      const continueToPersonal = page.getByRole('button', { name: /continue to personal/i });
      await expect(continueToPersonal).toBeEnabled({ timeout: 60_000 });
      await continueToPersonal.click();
    } else if (!currentStep?.includes('Step 3 of 6')) {
      const personalStep = page.getByRole('button', { name: /Step 3: Personal/i });
      await expect(personalStep).toBeEnabled({ timeout: 60_000 });
      // A reload whose address bar names `?step=personal` paints the derived
      // resume step first and moves to Personal by itself 25-45 ms later (task
      // 6.3 M14, raw/m14-12); a click in that window lands on the now-current,
      // disabled step. Bounded, and the checks below decide (raw/m14-11).
      await personalStep.click({ timeout: 5_000 }).catch(() => undefined);
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

async function openDraft(page: Page, applicationId: string): Promise<void> {
  await page.goto(`/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicationId)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  await openPersonalStep(page);
}

function unwrap(json: unknown): Record<string, unknown> {
  const body = (json ?? {}) as { data?: unknown };
  return ((body.data ?? body) as Record<string, unknown>) ?? {};
}

test('two tabs in one browser: the stale tab conflicts and reloads the winner, and the winner tab reopens clean', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  const context = page.context();
  await postponeWizardAutosave(context);

  const offering = await configureOffering('Two Tab');
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
  const initialVersion = Number((await readDraft()).version);
  expect(Number.isInteger(initialVersion) && initialVersion > 0).toBeTruthy();

  // Tab B is the fixture page, so its asserted 409 is observed by the strict gate.
  // Tab A shares the browser — cookies AND the local outbox — and has its own
  // error collector below.
  const tabB = page;
  const tabA = await context.newPage();
  const tabAErrors: string[] = [];
  tabA.on('pageerror', (error) => tabAErrors.push(`pageerror: ${error.message}`));
  tabA.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) {
      tabAErrors.push(`${response.status()} ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  for (const tab of [tabA, tabB]) {
    tab.on('dialog', (dialog) => {
      void dialog.accept();
    });
  }

  await openDraft(tabB, applicationId);
  await openDraft(tabA, applicationId);
  await tabA.waitForLoadState('networkidle');
  await tabB.waitForLoadState('networkidle');
  expect(
    Number((await readDraft()).version),
    'hydration and step navigation in two tabs are reads, never writes',
  ).toBe(initialVersion);

  // Tab A wins through the real control.
  const winnerTown = `Two tab winner ${Date.now()}`;
  await tabA.getByLabel(/town|city/i).first().fill(winnerTown);
  const winnerResponse = tabA.waitForResponse(
    (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === draftPath,
  );
  await tabA.getByRole('button', { name: /save now/i }).click();
  const won = await winnerResponse;
  expect(won.status(), 'tab A should win through Save now').toBe(200);
  const winnerVersion = Number(unwrap(await won.json()).version);
  expect(winnerVersion, 'the winning command advances the draft exactly once').toBe(initialVersion + 1);

  // Tab B is still on the old version. Dirtying it is enough: its own debounced
  // autosave (the production path; only the 8 s sweep is postponed) sends the
  // stale command, and the answer must be an explicit conflict. The first run
  // of this file pressed Save now here; on the mobile project the debounce won
  // that race and the control was already — correctly — disabled by the
  // conflict, so the claim is asserted on the outcome, not on which path wrote.
  gate.allowRequest(draftPath);
  const staleRequests: string[] = [];
  tabB.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname === draftPath) {
      staleRequests.push(request.url());
    }
  });
  const staleResponse = tabB.waitForResponse(
    (response) => response.request().method() === 'PATCH' && new URL(response.url()).pathname === draftPath,
    { timeout: 30_000 },
  );
  await tabB.getByLabel(/town|city/i).first().fill(`Two tab stale ${Date.now()}`);
  const stale = await staleResponse;
  const staleBody = (await stale.json()) as { code?: string; current_version?: number };
  expect(stale.status(), 'the stale tab is refused').toBe(409);
  expect(staleBody.code).toBe('VERSION_CONFLICT');
  expect(Number(staleBody.current_version)).toBe(winnerVersion);

  const actionBarB = tabB.getByTestId('wizard-action-bar');
  await expect(actionBarB.getByRole('alert')).toContainText(/changed in another tab or device/i);
  await expect(actionBarB.getByRole('button', { name: /save now/i })).toBeDisabled();
  const reloadLatest = actionBarB.getByRole('button', { name: /reload latest draft/i });
  await expect(reloadLatest).toBeEnabled();
  await tabB.waitForTimeout(1_000);
  expect(staleRequests, 'VERSION_CONFLICT is terminal; it is not retried').toHaveLength(1);
  expect(String((await readDraft()).residence_town), 'the stale write never lands').toBe(winnerTown);

  // Tab B's reload shows the winner.
  const reloaded = tabB.waitForNavigation({ waitUntil: 'domcontentloaded' });
  await reloadLatest.click();
  await reloaded;
  await expect(tabB.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  await openPersonalStep(tabB);
  await expect(tabB.getByLabel(/town|city/i).first()).toHaveValue(winnerTown);
  await expect(tabB.getByRole('button', { name: /reload latest draft/i })).toHaveCount(0);

  // Tab A, refreshed afterwards, reads the SAME local outbox record tab B wrote
  // its stale edit into. It must open clean on the winner.
  await tabA.reload({ waitUntil: 'domcontentloaded' });
  await expect(tabA.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  await openPersonalStep(tabA);
  await expect(tabA.getByLabel(/town|city/i).first()).toHaveValue(winnerTown);
  await expect(tabA.getByRole('button', { name: /reload latest draft/i })).toHaveCount(0);
  await expect(tabA.getByRole('button', { name: /save now/i })).toBeEnabled();
  await tabA.waitForLoadState('networkidle');
  await tabB.waitForLoadState('networkidle');

  // The server: the winner, one version step, one draft.
  const final = await readDraft();
  expect(String(final.residence_town)).toBe(winnerTown);
  expect(Number(final.version), 'reloads and refreshes write nothing').toBe(winnerVersion);
  const list = await page.request.get('/api/v1/applications/drafts/?pageSize=100');
  expect(list.ok()).toBeTruthy();
  const listBody = unwrap(await list.json()) as { results?: Array<{ id?: unknown }> } | Array<{ id?: unknown }>;
  const rows = Array.isArray(listBody) ? listBody : (listBody.results ?? []);
  expect(
    rows.filter((row) => String(row.id) === applicationId),
    'two tabs never fork the draft',
  ).toHaveLength(1);

  expect(tabAErrors, 'the winner tab saw no failed API call and no page error').toEqual([]);
  await tabA.close();
});

/**
 * Refresh right after a NEW application is saved (R10.1, R10.8).
 *
 * Found by this task's browser run: the wizard attached a `mode=new` draft to
 * its server id, but the address bar kept `mode=new`, so a reload opened a blank
 * new application on step 1 while the student's saved draft sat on the server.
 * The address bar is now rewritten in place to resume that draft.
 */
test('a refresh right after a new application is saved reopens that application, not a blank one', async ({
  page,
  gate,
}) => {
  test.setTimeout(240_000);
  allowHarnessNoise(gate);
  const offering = await configureOffering('New Refresh');
  const { email } = await loginStudent(page);

  await page.goto('/student/application-wizard?mode=new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
  // Choose this journey's own offering by its names (scoped to the open list).
  const pick = async (comboboxName: RegExp, optionText: string) => {
    await page.getByRole('combobox', { name: comboboxName }).first().click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: optionText, exact: false }).first().click();
    await expect(listbox).toBeHidden();
  };
  await pick(/programme/i, offering.programName);
  await pick(/intake/i, offering.intakeName);
  await page.getByRole('button', { name: /continue to assigned school/i }).click();
  const toPersonal = page.getByRole('button', { name: /continue to personal/i });
  await expect(toPersonal).toBeEnabled({ timeout: 60_000 });
  await toPersonal.click();

  const town = `New refresh town ${Date.now()}`;
  await page.getByLabel(/full name/i).first().fill('New Refresh Student');
  await page.getByLabel(/nrc number/i).first().fill('123456/78/9');
  await page.getByLabel(/date of birth/i).first().fill('2004-05-04');
  await page.getByRole('combobox', { name: /sex/i }).first().click();
  await page.getByRole('listbox').getByRole('option', { name: 'Male' }).first().click();
  await page.getByLabel(/phone number/i).first().fill('+260971234567');
  const emailField = page.getByLabel(/email address/i).first();
  if (!(await emailField.inputValue())) await emailField.fill(email);
  await page.getByLabel(/town|city/i).first().fill(town);

  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/applications/drafts/',
  );
  await page.getByRole('button', { name: /continue to education/i }).click();
  const startResponse = await started;
  expect(startResponse.status(), 'Continue starts the application on the server').toBe(201);
  const applicationId = String(unwrap(await startResponse.json()).id);
  await expect(page.getByTestId('education-step')).toBeVisible({ timeout: 60_000 });

  // The address bar now names the saved draft, so a reload can find it.
  await expect
    .poll(() => new URL(page.url()).searchParams.get('draftId'), { timeout: 10_000 })
    .toBe(applicationId);
  expect(new URL(page.url()).searchParams.get('mode')).toBe('resume');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  await openPersonalStep(page);
  await expect(page.getByLabel(/town|city/i).first(), 'the reload reopened the saved application').toHaveValue(town);
  await expect(page.getByRole('button', { name: /reload latest draft/i })).toHaveCount(0);

  // Exactly one application exists for the student, and it holds the answer.
  const list = await page.request.get('/api/v1/applications/drafts/?pageSize=100');
  const listBody = unwrap(await list.json()) as { results?: Array<{ id?: unknown }> } | Array<{ id?: unknown }>;
  const rows = Array.isArray(listBody) ? listBody : (listBody.results ?? []);
  expect(rows.map((row) => String(row.id)), 'the refresh never starts a second application').toEqual([applicationId]);
  const record = await page.request.get(`/api/v1/applications/drafts/${applicationId}/`);
  expect(String(unwrap(await record.json()).residence_town)).toBe(town);
});
