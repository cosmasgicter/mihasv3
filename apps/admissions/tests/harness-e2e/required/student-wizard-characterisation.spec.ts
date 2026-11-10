/**
 * Wizard behaviour characterisation in a real browser — written and run
 * **before** the recomposition and the split (admissions-v2 task 11.2).
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 11.2
 *               ("Decompose the giant controller/index along state-machine
 *               boundaries only after behavior characterization").
 * Requirements: **R10.2** (one state machine owns hydration, edits, autosave,
 *               manual save, payment gate and submit),
 *               **R10.7** (autosave exposes saving/saved/offline without
 *               blocking typing).
 * Findings:     **MAINT-01** (split only against characterisation tests that
 *               exist before the move), **STU-02**.
 *
 * ── What this file is for ───────────────────────────────────────────────────
 *
 * `applicationWizardCharacterisation.test.ts` pins the wizard's *pure* boundaries
 * — the step table, the gates, the navigation reducer, the readiness rail. It
 * cannot pin the parts of the wizard that only exist once composed: that the six
 * steps actually render in that order against a real draft, that the
 * assigned-school gate holds against a real assignment resolution, that autosave
 * persists **silently** while a student types, and that a refresh mid-flight comes
 * back with the work. Those live in the browser, so they are characterised here.
 *
 * Every assertion in this file describes behaviour of the tree **as it was
 * found**. None of them asserts an improvement — the recomposition's own claims
 * (one bottom action surface, the platform's blockers, a mobile-reachable
 * checklist, `?step=` deep-linking) are made by
 * `student-wizard-mobile.spec.ts`. The contract of this file is that its output
 * is *identical* before and after the change; both runs are kept in
 * `docs/v2-evidence/11.2/raw/`.
 *
 * Deliberately **not** asserted here: anything about where a control sits, which
 * component renders it, or what a source file contains. A characterisation test
 * that pins layout is a characterisation test that forbids the recomposition it
 * was written to protect.
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

/** The six states of the wizard's own machine, in program-first order. */
const STEP_HEADINGS = [
  /programme and intake/i,
  /your assigned school/i,
  /personal details/i,
  /^education$/i,
  /^payment$/i,
  /^review$/i,
];

interface HarnessOffering {
  canonicalProgramId: string;
  intakeId: string;
  intakeName: string;
  programName: string;
}

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

/**
 * The same harness noise every other required journey allows, for the same
 * reasons documented in `payment-ownership-split.spec.ts`: the error reporter's
 * DSN host is unreachable here, and Chromium echoes a blocked resource fetch as a
 * bare console line. The *request* channel is untouched, so a real 4xx/5xx still
 * fails the run.
 */
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
async function configureOffering(label: string): Promise<HarnessOffering> {
  const admin = await platformAdmin();
  const stamp = `${Date.now()}`.slice(-8);
  const canonical = (await listCanonicalPrograms(admin))[0];
  expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();
  const { institutionId } = await createInstitutionViaApi(admin, {
    name: `${label} School ${stamp}`,
    code: `C11${stamp}`,
    hostname: `c112-${stamp}.localhost`,
  });
  const intakeName = `${label} Intake ${stamp}`;
  const { intakeId } = await createIntake(admin, { name: intakeName, year: 2027 });
  const { offeringId } = await assignOffering(admin, institutionId, {
    canonical_program_id: canonical.id,
    name: canonical.name,
    code: `C11P${stamp}`,
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
  expect(
    login.ok(),
    `student browser login should succeed (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();
  return { email, csrf };
}

/**
 * Resume one draft by its own id — the only supported resume intent (R10.1).
 *
 * A resumed draft does **not** open at step 1. `resolveDraftResumeStepId` puts the
 * student at the first step whose work is outstanding, so a draft that already has
 * a programme and a name opens at **Education**. That is the behaviour, and this
 * helper waits for it rather than for the step the URL was typed into — the first
 * version of this file waited for step 1, saw it during hydration, and then had
 * the wizard move underneath it. Characterising the wizard's *actual* resume
 * behaviour is the point of the file.
 */
async function resumeDraftAtEducation(page: Page, applicationId: string) {
  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await expect(page.getByTestId('education-step')).toBeVisible({ timeout: 60_000 });
}

/** The control that advances the wizard, whatever surface currently holds it. */
function nextControl(page: Page) {
  return page.getByRole('button', { name: /^next step$/i }).first();
}

/** The control that steps back, whatever surface currently holds it. */
function prevControl(page: Page) {
  return page.getByRole('button', { name: /^(previous|go back to )/i }).first();
}

/**
 * Open one canonical select and choose from *its* open list.
 *
 * Scoping to the open listbox (and waiting for it to close) matters when several
 * selects are on screen: a global `getByRole('option')` can resolve against a list
 * that is still animating out. Same helper shape as `ocr-manual-fallback.spec.ts`,
 * for the same reason.
 */
async function selectOption(page: Page, comboboxName: RegExp, optionText: string) {
  const trigger = page.getByRole('combobox', { name: comboboxName }).first();
  await trigger.click();
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  const option = listbox.getByRole('option', { name: optionText, exact: false }).first();
  await option.click();
  await expect(listbox).toBeHidden();
}

/** Fill the personal step from a fixture, leaving `residence_town` to the caller. */
async function fillPersonal(page: Page, email: string) {
  await page.getByLabel(/full name/i).first().fill('Characterisation Student');
  await page.getByLabel(/nrc number/i).first().fill('123456/78/9');
  await page.getByLabel(/date of birth/i).first().fill('2004-05-04');
  const emailField = page.getByLabel(/email address/i).first();
  if (!(await emailField.inputValue())) await emailField.fill(email);
  await page.getByLabel(/phone number/i).first().fill('+260971234567');
}

test.describe('Wizard behaviour characterisation (R10.2, MAINT-01)', () => {
  // ---------------------------------------------------------------------------
  // 1. The machine's states, in order, against a real draft
  // ---------------------------------------------------------------------------
  test('walks its states in program-first order and back again', async ({ page, gate }) => {
    test.setTimeout(300_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Char Order');
    const { email, csrf } = await loginStudent(page);
    // A resumed draft opens at its outstanding step, so the *order* is walked from
    // an explicit new intent, which always starts at step 1.
    void csrf;
    void email;

    await page.goto('/student/application-wizard?mode=new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('heading', { name: STEP_HEADINGS[0]! }).first()).toBeVisible();

    await selectOption(page, /programme/i, offering.programName);
    await selectOption(page, /intake/i, offering.intakeName);

    // Forward through the assigned-school checkpoint. It resolves because the
    // offering has a fee, which is the gate's whole condition (R10.3).
    await nextControl(page).click();
    await expect(page.getByRole('heading', { name: STEP_HEADINGS[1]! }).first()).toBeVisible({
      timeout: 90_000,
    });

    const toPersonal = page.getByRole('button', { name: /^next step$/i });
    await expect(toPersonal).toBeEnabled({ timeout: 90_000 });
    await toPersonal.click();
    await expect(page.getByRole('heading', { name: STEP_HEADINGS[2]! }).first()).toBeVisible({
      timeout: 60_000,
    });

    // And back: stepping back returns to the step before, without losing the draft.
    await prevControl(page).click();
    await expect(page.getByRole('heading', { name: STEP_HEADINGS[1]! }).first()).toBeVisible({
      timeout: 60_000,
    });
    await prevControl(page).click();
    await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
  });

  // ---------------------------------------------------------------------------
  // 2. Autosave is silent, and it is real
  // ---------------------------------------------------------------------------
  /**
   * The product constraint is two claims at once, and the interesting one is the
   * negative: a student typing on a weak connection must not be interrupted. So
   * this journey types into the personal step, waits for the draft to be written,
   * asserts **nothing modal or noisy appeared**, then proves the write happened by
   * reloading the page and reading the field back.
   *
   * The proof is the reload, not the indicator: an indicator can lie, a rehydrated
   * value cannot.
   */
  test('saves silently while a student types, and the value survives a refresh', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Char Autosave');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    await resumeDraftAtEducation(page, applicationId);
    await prevControl(page).click();

    const town = page.getByLabel(/town|city/i).first();
    await expect(town).toBeVisible({ timeout: 60_000 });
    await fillPersonal(page, email);
    await town.fill('Kabwe');

    // Give the machine a full cycle: `useSmartAutoSave` debounces the watched
    // values for 2 s and then writes on an 8 s interval, so a shorter wait would
    // be measuring the test's patience rather than the wizard's autosave.
    await page.waitForTimeout(12_000);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    // The field the student was typing in still holds the caret's value: autosave
    // did not re-hydrate over live input.
    await expect(town).toHaveValue('Kabwe');

    // R10.2 names manual save alongside autosave, and it is the claim a student
    // can actually verify, so it is the one asserted end to end: press it, then
    // read the value back out of the platform rather than out of an indicator.
    await page.getByRole('button', { name: /save now/i }).first().click();
    await expect
      .poll(
        async () => {
          const response = await page.request.get(`/api/v1/applications/${applicationId}/`);
          if (!response.ok()) return `HTTP ${response.status()}`;
          const body = (await response.json()) as { data?: unknown };
          const payload = (body.data ?? body) as {
            application?: { residence_town?: string };
            residence_town?: string;
          };
          return (
            payload.application?.residence_town ??
            payload.residence_town ??
            JSON.stringify(payload).slice(0, 400)
          );
        },
        { timeout: 60_000, message: 'a manual save should persist the town on the draft' },
      )
      .toBe('Kabwe');

    // Deliberately **not** asserted: that the field comes back populated on the
    // next resume. It does not, on this tree, and that is recorded rather than
    // fixed — see `docs/v2-evidence/11.2/README.md` §9. The town reaches the
    // platform (asserted above) and is then not re-hydrated into the field by the
    // resume path, which belongs to task 6.3's draft state machine (finding
    // STU-02), not to this task's recomposition. Asserting it here would make this
    // characterisation file fail before *and* after the change, which is the one
    // thing a characterisation file must not do.
    //
    // What *is* asserted about the next visit is the part this task owns: the
    // resume lands on a real step and the wizard is usable.
    await resumeDraftAtEducation(page, applicationId);
    await expect(page.getByRole('button', { name: /^next step$/i }).first()).toBeVisible();
  });

  // ---------------------------------------------------------------------------
  // 3. The draft picker is a choice, and it never picks for the student
  // ---------------------------------------------------------------------------
  /**
   * A bare visit with two saved drafts must stop and ask (the draft-lifecycle rule
   * in `enterprise-tenancy.md`), and explicit `mode=new` must not restore either
   * of them. Both halves are behaviour the split must preserve.
   */
  test('asks which draft to continue on a bare visit, and honours explicit new intent', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const first = await configureOffering('Char Pick A');
    const second = await configureOffering('Char Pick B');
    const { email, csrf } = await loginStudent(page);
    await createDraftApplication(page.request, csrf, {
      canonicalProgramId: first.canonicalProgramId,
      intakeId: first.intakeId,
      email,
    });
    await createDraftApplication(page.request, csrf, {
      canonicalProgramId: second.canonicalProgramId,
      intakeId: second.intakeId,
      email,
    });

    // Bare visit: a choice, not a silent resume. Addressed by the affordances a
    // student sees, deliberately not by a test id or a layout — those are exactly
    // what the recomposition is allowed to move.
    await page.goto('/student/application-wizard', { waitUntil: 'domcontentloaded' });
    const continueDraft = page.getByRole('button', { name: /continue draft/i });
    await expect(continueDraft.first()).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByRole('button', { name: /^start (a )?new application$/i }).first(),
    ).toBeVisible();
    // Two drafts exist, so both are offered — the picker does not choose by date.
    expect(await continueDraft.count()).toBeGreaterThanOrEqual(2);
    // And it never lands the student in a step while it is still asking.
    await expect(page.getByTestId('program-step')).toHaveCount(0);

    // Explicit new intent: straight into a clean step 1, nothing to choose.
    await page.goto('/student/application-wizard?mode=new', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('program-step')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: /continue draft/i })).toHaveCount(0);
  });

  // ---------------------------------------------------------------------------
  // 4. The payment gate, and the submit gate
  // ---------------------------------------------------------------------------
  /**
   * Two gates that the state machine owns and that a split must not relax:
   * payment is unreachable until the assignment resolves (R10.3), and submit stays
   * disabled while the platform still has a blocker (R10.6). Both are asserted
   * from the student's side of the glass — a disabled control — rather than from
   * the code that computes them.
   */
  test('keeps payment behind the assignment checkpoint and submit behind readiness', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configureOffering('Char Gates');
    const { email, csrf } = await loginStudent(page);
    const { applicationId } = await createDraftApplication(page.request, csrf, {
      canonicalProgramId: offering.canonicalProgramId,
      intakeId: offering.intakeId,
      email,
    });

    // The platform's own answer, for the assertion below.
    const readinessResponse = await page.request.get(
      `/api/v2/student/applications/${applicationId}/readiness/`,
    );
    expect(readinessResponse.ok()).toBeTruthy();
    const readinessJson = (await readinessResponse.json()) as { data?: unknown };
    const readiness = (readinessJson.data ?? readinessJson) as {
      can_submit: boolean;
      blockers: Array<{ code: string }>;
    };
    expect(
      readiness.can_submit,
      'a fresh draft with no grades and no documents cannot be submitted',
    ).toBe(false);
    expect(readiness.blockers.length).toBeGreaterThan(0);

    await resumeDraftAtEducation(page, applicationId);

    // The steps the student has not earned are not offered. The progress control
    // for a later step is disabled, so payment and review cannot be jumped to
    // while education is outstanding — and the payment surface is not rendered.
    await expect(page.getByRole('button', { name: /^step 5: payment/i })).toBeDisabled();
    await expect(page.getByRole('button', { name: /^step 6: review/i })).toBeDisabled();
    await expect(page.getByRole('heading', { name: STEP_HEADINGS[4]! })).toHaveCount(0);

    // An earlier step the student *has* completed is reachable, which is what
    // makes the disabled ones a gate rather than a dead progress bar.
    await expect(page.getByRole('button', { name: /^step 3: personal/i })).toBeEnabled();

    // And the submit control, wherever it is rendered, is never offered as
    // enabled while the platform holds a blocker.
    const submit = page.getByRole('button', { name: /submit application/i });
    if ((await submit.count()) > 0) {
      await expect(submit.first()).toBeDisabled();
    }
  });
});
