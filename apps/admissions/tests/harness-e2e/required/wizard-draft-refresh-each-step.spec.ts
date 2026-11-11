/**
 * Required V2 harness — a refresh at each of the wizard's six steps
 * (admissions-v2 task 6.3, M14: R10.8 "refresh during each step").
 *
 * Requirements: **R10.1** (explicit intent; `Application.id` is the draft
 * identity), **R10.3** (hydration is a read — a reload writes nothing), **R10.4**
 * (a draft the server holds keeps no record on this device), **R10.8**.
 * Findings: **STU-02**, **STU-12**.
 *
 * The earlier draft journeys refresh on one step each: the characterisation
 * spec on Personal, the two-tab spec on Personal and on Education right after a
 * new application attaches, F2 on the resumed step. This journey refreshes on
 * EVERY step, twice over:
 *
 *   1. a resumed draft (`mode=resume&draftId=…`) with grades, documents and a
 *      deferred fee, so every step — Programme through Review — is one the
 *      student has legitimately reached. It opens on its derived resume step
 *      (Review: the fee is deferred) and is walked back one step at a time,
 *      refreshing on each of the six;
 *   2. a `mode=new` application, refreshed on Personal once autosave has
 *      attached it, then on the two steps before it.
 *
 * After every refresh: the same `Application.id` reopens (the address bar, the
 * answers on screen, one draft on the server — never a blank or a second
 * application); the student is on the step they refreshed on; the saved answers
 * for that step are shown; the reload sent no write to the application at all
 * and the server's version did not move; and nothing about the draft is left in
 * this browser's storage (task 6.3 M14: an attached draft with nothing pending
 * keeps no local record).
 *
 * Which step a refresh lands on, and why: the SAME step. The wizard writes the
 * step into the address bar (`?step=<key>`, `index.tsx`) on every move and
 * honours it on a first load when the step is reachable (task 11.2,
 * `resolveWizardDeepLinkStep`). The resume machine first places the student on
 * the authoritative derived step (`resolveDraftResumeStepId`: Review for a
 * deferred fee, otherwise the first step with outstanding work); the address
 * bar's step then overrides it — immediately for Programme and Assigned school,
 * and for the later steps once the server has resolved the assignment and fee
 * (the R10.3 gate). Each check waits for the page to settle and re-reads the
 * step, so a transient derived step is never mistaken for the landing.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  createDraftApplication,
  persistMinimumGrades,
  superAdminContext,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';
import { satisfyRequiredDocuments } from '../helpers/two-tenant';
import {
  allowHarnessNoise,
  configureWizardOffering,
  isApplicationWrite,
  listDraftIds,
  loginStudentInPage,
  readDraftRecord,
  storedDraftRecordKeys,
  unwrapEnvelope,
  waitForNetworkQuiet,
  wizardStepLine,
  type WizardOffering,
} from '../helpers/wizard-draft';

const STEP_KEYS = ['program', 'assignedSchool', 'personal', 'education', 'payment', 'submit'] as const;

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

interface DraftExpectations {
  offering: WizardOffering;
  fullName: string;
  town: string;
}

/** The answers each step shows, read from the screen. */
async function expectAnswersShown(page: Page, step: number, x: DraftExpectations): Promise<void> {
  switch (step) {
    case 1:
      await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('combobox', { name: /programme/i }).first()).toContainText(x.offering.programName, {
        timeout: 30_000,
      });
      await expect(page.getByRole('combobox', { name: /intake/i }).first()).toContainText(x.offering.intakeName, {
        timeout: 30_000,
      });
      return;
    case 2:
      await expect(page.getByTestId('assigned-school-step')).toContainText(x.offering.schoolName, { timeout: 30_000 });
      await expect(page.getByTestId('assigned-school-step')).toContainText(x.offering.intakeName);
      return;
    case 3:
      await expect(page.getByLabel(/full name/i).first()).toHaveValue(x.fullName, { timeout: 30_000 });
      await expect(page.getByLabel(/town|city/i).first()).toHaveValue(x.town);
      return;
    case 4:
      await expect(page.getByTestId('education-step')).toContainText('5/5 unique minimum', { timeout: 30_000 });
      return;
    case 5:
      await expect(page.getByTestId('payment-step')).toContainText(/payment deferred/i, { timeout: 30_000 });
      return;
    case 6:
      await expect(page.getByTestId('submit-step')).toContainText(x.fullName, { timeout: 30_000 });
      await expect(page.getByTestId('submit-step')).toContainText(/deferred for later payment/i);
      await expect(page.getByTestId('submit-step')).toContainText(/result slip attached/i);
      return;
    default:
      throw new Error(`no such step ${step}`);
  }
}

/** Refresh on `step` and prove the same application reopens there, unchanged, with nothing written. */
async function refreshAndVerify(
  page: Page,
  applicationId: string,
  step: number,
  x: DraftExpectations,
  journey: string,
): Promise<void> {
  // The page before the refresh: on the step, settled, answers shown.
  await expect(wizardStepLine(page)).toHaveText(`Step ${step} of 6`, { timeout: 60_000 });
  await waitForNetworkQuiet(page);
  await expectAnswersShown(page, step, x);
  expect(new URL(page.url()).searchParams.get('step'), 'the address bar names the step being refreshed').toBe(
    STEP_KEYS[step - 1],
  );
  const before = await readDraftRecord(page, applicationId);

  const writes: string[] = [];
  const onRequest = (request: Parameters<typeof isApplicationWrite>[0]) => {
    if (isApplicationWrite(request)) writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  };
  page.on('request', onRequest);
  const startedAt = Date.now();
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
    await expect(wizardStepLine(page)).toHaveText(`Step ${step} of 6`, { timeout: 60_000 });
    await waitForNetworkQuiet(page);
    // Still there once everything the reload started has finished.
    await expect(wizardStepLine(page)).toHaveText(`Step ${step} of 6`);
    await expectAnswersShown(page, step, x);
  } finally {
    page.off('request', onRequest);
  }

  const url = new URL(page.url());
  expect(url.searchParams.get('mode'), 'the reload resumes, it never starts new').toBe('resume');
  expect(url.searchParams.get('draftId'), 'the same application reopens').toBe(applicationId);
  expect(url.searchParams.get('step')).toBe(STEP_KEYS[step - 1]);
  expect(writes, 'hydration and the refresh send no write to the application').toEqual([]);
  const after = await readDraftRecord(page, applicationId);
  expect(Number(after.version), 'the server version does not move on a refresh').toBe(Number(before.version));
  expect(await listDraftIds(page), 'one application, never a second').toEqual([applicationId]);
  await expect(page.getByRole('button', { name: /reload latest draft/i })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /continue draft/i }), 'not the draft-choice screen').toHaveCount(0);
  await expect
    .poll(() => storedDraftRecordKeys(page), {
      timeout: 15_000,
      message: 'a draft the server holds keeps no record on this device',
    })
    .toEqual([]);
  test.info().annotations.push({
    type: `${journey}: refresh on step ${step} (${STEP_KEYS[step - 1]})`,
    description: `reopened ${applicationId} on step ${step} in ${Date.now() - startedAt} ms; version ${String(
      after.version,
    )} unchanged; writes ${writes.length}; local draft records 0`,
  });
}

/** One step back through the wizard's own back control. */
async function stepBack(page: Page, toStep: number): Promise<void> {
  const back = page.getByRole('button', { name: /^(previous|go back to )/i }).first();
  await expect(back).toBeEnabled({ timeout: 30_000 });
  await back.click();
  await expect(wizardStepLine(page)).toHaveText(`Step ${toStep} of 6`, { timeout: 30_000 });
}

test('a resumed draft: a refresh on each of the six steps reopens the same application on that step, writing nothing', async ({
  page,
  gate,
}) => {
  test.setTimeout(420_000);
  allowHarnessNoise(gate);

  const offering = await configureWizardOffering(await platformAdmin(), 'Refresh Each', 'T63R');
  const { email, csrf } = await loginStudentInPage(page);
  const fullName = `Refresh Student ${Date.now()}`;
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
    fullName,
  });
  // Every step must be one the student has legitimately reached: five grades,
  // the documents the platform requires, and a deferred fee.
  expect(await persistMinimumGrades(page.request, csrf, applicationId)).toBe(5);
  await uploadDocument(page.request, csrf, applicationId, 'result_slip');
  await uploadDocument(page.request, csrf, applicationId, 'extra_kyc');
  await satisfyRequiredDocuments(page.request, csrf, applicationId);
  const defer = await page.request.post('/api/v1/payments/defer/', {
    headers: { 'x-csrf-token': csrf },
    data: { application_id: applicationId },
  });
  expect(defer.ok(), `deferring the fee should succeed (got ${defer.status()})`).toBeTruthy();
  expect(String(unwrapEnvelope(await defer.json()).status)).toBe('deferred');
  const x: DraftExpectations = { offering, fullName, town: 'Lusaka' };

  await page.goto(`/student/application-wizard?mode=resume&draftId=${encodeURIComponent(applicationId)}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('wizard-action-bar')).toBeVisible({ timeout: 60_000 });
  // The derived resume step: Review, because the fee is deferred.
  await expect(wizardStepLine(page)).toHaveText('Step 6 of 6', { timeout: 60_000 });
  test.info().annotations.push({
    type: 'resumed draft: derived resume step',
    description: 'Step 6 (Review): resolveDraftResumeStepId sends a draft with a deferred fee to Review',
  });

  for (let step = 6; step >= 1; step -= 1) {
    await refreshAndVerify(page, applicationId, step, x, 'resumed draft');
    if (step > 1) await stepBack(page, step - 1);
  }

  const final = await readDraftRecord(page, applicationId);
  expect(String(final.full_name)).toBe(fullName);
  expect(String(final.residence_town)).toBe('Lusaka');
});

test('a new application, once attached: a refresh on Personal, Assigned school and Programme reopens it on that step, writing nothing', async ({
  page,
  gate,
}) => {
  test.setTimeout(300_000);
  allowHarnessNoise(gate);

  const offering = await configureWizardOffering(await platformAdmin(), 'Refresh New', 'T63N');
  const { email } = await loginStudentInPage(page);

  await page.goto('/student/application-wizard?mode=new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
  const pick = async (comboboxName: RegExp, optionText: string) => {
    await page.getByRole('combobox', { name: comboboxName }).first().click();
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible();
    await listbox.getByRole('option', { name: optionText, exact: false }).first().click();
    await expect(listbox).toBeHidden();
  };
  await pick(/programme/i, offering.programName);
  await pick(/intake/i, offering.intakeName);
  await page.getByRole('button', { name: /^next step$/i }).click();
  const toPersonal = page.getByRole('button', { name: /^next step$/i });
  await expect(toPersonal).toBeEnabled({ timeout: 60_000 });
  await toPersonal.click();
  await expect(wizardStepLine(page)).toHaveText('Step 3 of 6', { timeout: 60_000 });

  const fullName = `Refresh New Student ${Date.now()}`;
  const town = `Refresh new town ${Date.now()}`;
  await page.getByLabel(/full name/i).first().fill(fullName);
  await page.getByLabel(/nrc number/i).first().fill('123456/78/9');
  await page.getByLabel(/date of birth/i).first().fill('2004-05-04');
  await page.getByRole('combobox', { name: /sex/i }).first().click();
  await page.getByRole('listbox').getByRole('option', { name: 'Male' }).first().click();
  await page.getByLabel(/phone number/i).first().fill('+260971234567');
  const emailField = page.getByLabel(/email address/i).first();
  if (!(await emailField.inputValue())) await emailField.fill(email);

  // The last required answer makes the application creatable: autosave starts
  // it on the server — the student presses nothing.
  const started = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/applications/drafts/',
    { timeout: 60_000 },
  );
  await page.getByLabel(/town|city/i).first().fill(town);
  const startResponse = await started;
  expect(startResponse.status(), 'autosave starts the application on the server').toBe(201);
  const startedRow = unwrapEnvelope(await startResponse.json());
  const applicationId = String(startedRow.id);
  const startVersion = Number(startedRow.version);
  expect(Number.isInteger(startVersion) && startVersion > 0).toBeTruthy();
  await expect
    .poll(() => new URL(page.url()).searchParams.get('draftId'), { timeout: 15_000 })
    .toBe(applicationId);
  expect(new URL(page.url()).searchParams.get('mode')).toBe('resume');
  test.info().annotations.push({
    type: 'new application: attached by autosave',
    description: `POST /applications/drafts/ 201 → ${applicationId}; the address bar now resumes it`,
  });

  const x: DraftExpectations = { offering, fullName, town };
  await refreshAndVerify(page, applicationId, 3, x, 'new application');
  await stepBack(page, 2);
  await refreshAndVerify(page, applicationId, 2, x, 'new application');
  await stepBack(page, 1);
  await refreshAndVerify(page, applicationId, 1, x, 'new application');

  const final = await readDraftRecord(page, applicationId);
  expect(String(final.full_name)).toBe(fullName);
  expect(String(final.residence_town)).toBe(town);
  expect(
    Number(final.version),
    'the start command is the only write: refreshes and step moves wrote nothing',
  ).toBe(startVersion);
});
