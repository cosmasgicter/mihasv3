/**
 * Required V2 harness — the student payment ownership split, in a browser.
 *
 * Spec:         `.kiro/specs/admissions-v2-canonical-rebuild/` task 8.3
 *               (Required_Evidence: "golden and every recovery browser journey").
 * Requirements: **R12.3** — "THE wizard SHALL own pre-submission payment or
 *               allowed deferral; the student payment page SHALL own
 *               post-submission deferred, failed, expired, and pending recovery
 *               plus payment history."
 *               R12.4 (the states are distinguished by one backend state machine),
 *               R12.6 (server amounts, provider state, recovery action, and **no
 *               indefinite disabled controls**), R13.1/R13.2.
 * Findings:     STU-08 (no invented fee), **STU-09** (action-required is not
 *               provider-processing), **STU-24** (no hardcoded support copy).
 *
 * One journey per post-submission state, plus the golden path — because R12.3 is
 * a claim about *which surface owns what*, and a claim about ownership is only
 * proven by visiting both surfaces in every state:
 *
 * | Journey                              | Owner under test | Proves |
 * |--------------------------------------|------------------|--------|
 * | golden: pay in the wizard            | wizard           | pre-submission pay is the wizard's, and the page then shows it paid with history and no pay affordance |
 * | deferred → pay                       | payment page     | a deferral is named as a choice and is payable after submission |
 * | failed → retry                       | payment page     | a failure states nothing was charged and offers a retry that works |
 * | expired → new attempt                | payment page     | a reconciliation-expired attempt offers a fresh one |
 * | pending/action_required → resume     | payment page     | the student is told to approve the prompt, and gets a re-check — not a dead button |
 * | pending/provider_processing → wait   | payment page     | a provider-side wait offers **no** retry (that is how a student gets charged twice) |
 *
 * Nothing here is mocked. The harness runs the real Django payment path against
 * the deterministic Lenco-compatible adapter (`harness/adapters`), which decides
 * every outcome from the request itself:
 *
 *   phone ...0000000  -> the provider fails the collection      (failed)
 *   phone ...9999     -> accepted, then two pending polls       (action_required)
 *   phone ...5555     -> the collection POST answers 503        (provider_processing)
 *   any other number  -> immediate success                      (paid)
 *
 * Getting to a submitted application is journey **setup** (canonical create +
 * the platform's own review command), not part of the claim; the claim always
 * starts at the surface the requirement names.
 *
 * Runs with the strict gates active (harness-fixtures.ts): zero skips, no console
 * errors, no unhandled exceptions, no unasserted failed requests.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createFee,
  createIntake,
  createInstitutionViaApi,
  forceSubmitApplication,
  listCanonicalPrograms,
  linkIntake,
  readPaymentRows,
  persistMinimumGrades,
  registerAndLoginStudent,
  superAdminContext,
  uploadDocument,
  type AuthedContext,
} from '../helpers/api';
import { closeAbandonedAdapterCollection, runReconciliationExpirySweep } from '../helpers/ops';

/** Adapter levers, named so a journey reads as intent rather than a magic number. */
const PHONE = {
  /** Immediate success — the golden and recovery-completion number. */
  paysImmediately: '0971234567',
  /** The provider fails the collection outright: money never moves. */
  providerFails: '0970000000',
  /** Accepted by the provider, so the customer prompt is out: `action_required`. */
  promptIssued: '0971239999',
  /** The collection POST 503s, so the request's fate is unknown: `provider_processing`. */
  providerSilent: '0971235555',
};

interface HarnessOffering {
  canonicalProgramId: string;
  intakeId: string;
  programName: string;
}

// ---------------------------------------------------------------------------
// Identities: one platform admin, but one student PER JOURNEY
// ---------------------------------------------------------------------------
// Two rate limits sit in front of these journeys, and they need opposite answers.
//
// `RateLimitMiddleware` budgets by **client IP** (`/auth/login/` 10/5m,
// `/auth/register/` 5/5m). Every request in this harness — every student, the
// platform admin, and the browser — arrives from one compose-network address, so
// that budget cannot mean here what it means in production, where each applicant
// has their own address. `config.settings.harness` therefore sets
// `RATELIMIT_ENABLE = False`, exactly as `config.settings.test` does, and says so
// in a comment that explains it is the topology being relaxed, not the platform.
//
// `PaymentUserScopedRateThrottle` budgets **per user** (`payment_mobile_money`
// 6/min) and stays ON, because a per-user budget means the same thing in a harness
// as in production. That is why each journey registers **its own** student: a
// single shared identity made seven journeys spend one student's collection
// budget, and the sixth was answered 429 — a refusal that tests how the spec
// shares an account, not R12.3. One student per journey is also the more faithful
// simulation: no real applicant opens eight collections in a minute.
//
// The platform admin is still shared, because it does no throttled payment work
// (it configures offerings and issues the submit command).

/** One platform-admin session for the whole file. */
let sharedAdmin: Promise<AuthedContext> | null = null;

function platformAdmin(): Promise<AuthedContext> {
  sharedAdmin ??= superAdminContext();
  return sharedAdmin;
}

/**
 * Register a fresh student for one journey, so that journey owns its own
 * per-user payment budget.
 */
async function harnessStudent(): Promise<{ email: string; password: string }> {
  const { ctx, email, password } = await registerAndLoginStudent();
  // The API-context session is not reused: the journey logs this identity in
  // through its own browser context. Only the registration happens here.
  await ctx.dispose();
  return { email, password };
}

test.afterAll(async () => {
  if (sharedAdmin) {
    const admin = await sharedAdmin;
    await admin.ctx.dispose();
    sharedAdmin = null;
  }
});

/**
 * Configure a tenant that offers one canonical program on a brand-new intake,
 * with a configured application fee.
 *
 * A dedicated intake is what makes assignment resolution deterministic: exactly
 * one offering is linked to it, so the canonical create resolves without
 * assuming any seeded id (R4.7). The fee has to exist, because task 8.1 made the
 * quote fail closed rather than invent one (STU-08).
 */
async function configurePaidOffering(label: string): Promise<HarnessOffering> {
  const admin = await platformAdmin();
  {
    const stamp = `${Date.now()}`.slice(-8);
    const canonical = (await listCanonicalPrograms(admin))[0];
    expect(canonical?.id, 'the harness should seed at least one canonical program').toBeTruthy();

    const { institutionId } = await createInstitutionViaApi(admin, {
      name: `${label} School ${stamp}`,
      code: `P83${stamp}`,
      hostname: `p83-${stamp}.localhost`,
    });
    const { intakeId } = await createIntake(admin, {
      name: `${label} Intake ${stamp}`,
      year: 2027,
    });
    const { offeringId } = await assignOffering(admin, institutionId, {
      canonical_program_id: canonical.id,
      name: canonical.name,
      code: `P83P${stamp}`,
    });
    await linkIntake(admin, { program_id: offeringId, intake_id: intakeId, max_capacity: 25 });
    await createFee(admin, offeringId, { amount: '153.00' });

    return {
      canonicalProgramId: canonical.id as string,
      intakeId,
      programName: canonical.name as string,
    };
  }
}

/**
 * Register this journey's student and log the browser context in as them.
 *
 * One registration and one login per journey: a Playwright browser context is
 * per-test and the harness deliberately carries **no** storageState, so every run
 * is fresh (task 0.4).
 */
async function loginStudent(page: Page): Promise<{ email: string; csrf: string }> {
  const { email, password } = await harnessStudent();
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
 * Journey setup: a student with one **submitted** application, so the payment
 * page owns its state.
 */
async function submittedApplication(
  page: Page,
  offering: HarnessOffering,
  phone: string,
): Promise<{ applicationId: string; email: string; csrf: string }> {
  const { email, csrf } = await loginStudent(page);
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
    phone: `+260${phone.slice(1)}`,
  });
  await forceSubmitApplication(await platformAdmin(), applicationId);
  return { applicationId, email, csrf };
}

/** The payment page card for one application, once the page has settled. */
function card(page: Page, applicationId: string) {
  return page.locator(`[data-testid="payment-application"][data-application-id="${applicationId}"]`);
}

/**
 * Leave the document only while nothing is in flight, so a navigation cannot
 * cancel a call the app started.
 *
 * Needed for exactly one hand-off: leaving the **wizard** for the payment page.
 * The wizard is a live surface by design — auto-save runs on an 8-second tick and
 * the education step's extraction assistance polls `/documents/{id}/info/` every
 * 3 seconds while a read is outstanding. A `page.goto` that lands on top of either
 * makes Chromium report `net::ERR_ABORTED`, which the strict gate counts as a
 * failed request — correctly, in that it cannot know the difference, and wrongly in
 * that the platform neither refused nor failed: this journey withdrew the question.
 *
 * So the journey waits for a window it can prove is quiet — no request in flight and
 * none started for `quietMs` — instead of loosening the gate. The default is
 * deliberately **shorter than the 3-second poll interval and far shorter than the
 * 8-second save tick**: passing it means the next scheduled call is at least a
 * second away, which is all the slack a navigation needs. Waiting *longer* than the
 * poll interval could never succeed, because a bounded 90-second assistance poll is
 * supposed to keep polling.
 */
async function waitForClientQuiet(
  page: Page,
  { quietMs = 1_200, timeoutMs = 60_000 }: { quietMs?: number; timeoutMs?: number } = {},
) {
  let inFlight = 0;
  let lastActivityAt = Date.now();
  const recent: string[] = [];
  const isApiCall = (url: string) => url.includes('/api/v1/');
  const onRequest = (req: { url: () => string }) => {
    if (!isApiCall(req.url())) return;
    inFlight += 1;
    lastActivityAt = Date.now();
    recent.push(req.url().replace(/^https?:\/\/[^/]+/, ''));
    if (recent.length > 12) recent.shift();
  };
  const onSettled = (req: { url: () => string }) => {
    if (!isApiCall(req.url())) return;
    inFlight = Math.max(0, inFlight - 1);
    lastActivityAt = Date.now();
  };

  page.on('request', onRequest);
  page.on('requestfinished', onSettled);
  page.on('requestfailed', onSettled);
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (inFlight === 0 && Date.now() - lastActivityAt >= quietMs) return;
      await page.waitForTimeout(250);
    }
    // Name what kept talking: a journey that times out here is looking at a
    // surface that never stops calling, which is worth reading, not guessing.
    throw new Error(
      `the SPA should stop calling the API before the document is navigated away; ` +
        `last calls: ${recent.join(', ') || '(none)'}`,
    );
  } finally {
    page.off('request', onRequest);
    page.off('requestfinished', onSettled);
    page.off('requestfailed', onSettled);
  }
}

/**
 * Leave the wizard the way a student safely does: save, then go.
 *
 * Auto-save is mandatory on every student form, and `useAutoSave` deliberately
 * fires one last save from `beforeunload`/`visibilitychange` when the form is
 * dirty. That save can never complete — the document is already going away — so
 * leaving a dirty wizard *always* produces `net::ERR_ABORTED` on the `PATCH
 * /applications/{id}/` and on the draft reads its invalidation triggers. It costs a
 * student nothing (localStorage is written before the network, and the platform
 * re-saves on the next visit), but it is indistinguishable to the strict gate from
 * a call the platform dropped.
 *
 * Pressing the wizard's own **Save Now** removes the cause rather than the symptom:
 * a saved form is not dirty, so the unload handler has nothing to send. The click
 * is also the honest simulation — a student who has just paid saves before moving
 * on, and the wizard puts that control on screen for exactly this moment.
 */
async function saveAndSettleWizard(page: Page) {
  const saveNow = page.getByRole('button', { name: 'Save Now' });
  await expect(saveNow).toBeVisible({ timeout: 30_000 });
  // Disabled only while a save is in flight, so waiting for enabled is waiting
  // for "no save running" — before the click and again after it.
  await expect(saveNow).toBeEnabled({ timeout: 30_000 });
  await saveNow.click();
  await expect(saveNow).toBeEnabled({ timeout: 30_000 });
  await waitForClientQuiet(page);
}

/** Open `/student/payment` and wait for the given application's card. */
async function openPaymentPage(page: Page, applicationId: string) {
  await page.goto('/student/payment', { waitUntil: 'domcontentloaded' });
  const target = card(page, applicationId);
  await expect(target).toBeVisible({ timeout: 30_000 });
  return target;
}

/** Pay from the payment page's inline form and wait for the ledger to settle. */
async function payFromPaymentPage(page: Page, applicationId: string, phone: string) {
  const target = card(page, applicationId);
  await target.getByTestId('payment-pay-action').click();
  const form = target.getByTestId('payment-inline-form');
  await expect(form).toBeVisible({ timeout: 30_000 });
  // The form only renders behind a live, unexpired server quote (task 8.1).
  const payButton = form.getByTestId('pay-momo-button');
  await expect(payButton).toBeEnabled({ timeout: 30_000 });
  await form.locator('#momo-phone').fill(phone);
  await payButton.click();
}

/**
 * Drive the platform's reconciliation entry point until the payment settles.
 *
 * Used only as journey **cleanup** for the two waiting journeys, whose whole
 * point is that the student does nothing. `POST /payments/{id}/verify/` is the
 * same call `poll_pending_payments_task` makes, so this leaves the harness in the
 * state a real 10-minute sweep would, and the drain gate stays honest.
 */
async function reconcileUntilSettled(
  page: Page,
  applicationId: string,
  paymentId: string,
  csrf: string,
) {
  await expect
    .poll(
      async () => {
        // `/verify/` is state-changing, so it needs the CSRF token like every
        // other write in this file. Its refusal is asserted rather than swallowed:
        // a silent `return 'pending'` here turned a 403 into a 60-second timeout
        // whose message blamed reconciliation for never settling.
        const verify = await page.request.post(`/api/v1/payments/${paymentId}/verify/`, {
          headers: { 'x-csrf-token': csrf },
        });
        expect(
          verify.ok(),
          `reconciliation verify should be accepted (got ${verify.status()}: ${await verify.text()})`,
        ).toBeTruthy();
        const rows = await readPaymentRows(page.request, applicationId);
        return rows.find((row) => row.id === paymentId)?.status ?? 'pending';
      },
      {
        timeout: 60_000,
        // The deterministic adapter needs a few polls to work through
        // `pending_polls`; a tight interval only spends provider calls.
        intervals: [1_000, 2_000, 3_000, 5_000],
        message: 'the reconciliation sweep should settle the collection',
      },
    )
    .not.toBe('pending');
}

/**
 * The pre-submission wizard payment step, reached with a draft that is ready to pay.
 *
 * The payment step is the wizard's **fifth**, and it sits behind the evidence
 * gates tasks 7.1 / 7.2 own: `resolveDraftResumeStepId` only resumes there once the
 * draft has a programme, a name, the configured minimum of unique persisted grades,
 * and both uploads. That gate is correct and this journey does not argue with it —
 * it satisfies it through the same student endpoints the wizard uses, then resumes.
 *
 * This is journey **setup**. The claim under test starts once the payment step is
 * on screen; how a student legitimately gets there is proven by the education and
 * document journeys, not re-proven here.
 */
async function openWizardPaymentStep(page: Page, offering: HarnessOffering) {
  const { email, csrf } = await loginStudent(page);
  const { applicationId } = await createDraftApplication(page.request, csrf, {
    canonicalProgramId: offering.canonicalProgramId,
    intakeId: offering.intakeId,
    email,
    phone: `+260${PHONE.paysImmediately.slice(1)}`,
  });
  await persistMinimumGrades(page.request, csrf, applicationId);
  await uploadDocument(page.request, csrf, applicationId, 'result_slip');
  await uploadDocument(page.request, csrf, applicationId, 'extra_kyc');
  await page.goto(`/student/application-wizard?mode=resume&draftId=${applicationId}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForLoadState('networkidle');
  return { applicationId, email };
}

/**
 * The error paths a payment journey legitimately walks, declared per R18.4.
 *
 * The gate treats any non-2xx as a failure unless the test *asserts* it, which is
 * the right default. These four are asserted, with the reason each one is a
 * contract rather than a defect:
 *
 * 1. `glitchtip` — the deliberately unreachable error-reporter sentinel. The
 *    harness has no outbound network; a clean run makes no report anyway.
 * 2. `harness-invalid.localhost` — the SPA's own invalid-host probe.
 * 3. `GET /payments/quote/` **404** — this is the endpoint's *designed* answer
 *    for "no live quote is held" (`QUOTE_NOT_FOUND`, `fee_quote_views.py`). The
 *    payment page reads a held price back before minting a new one
 *    (`useFeeQuote({ preferExisting: true })`) precisely so a refresh mid-recovery
 *    shows the same amount; a well-formed 404 envelope with a stable code is that
 *    read succeeding at telling us nothing is held. Nothing is broken and nothing
 *    is retried.
 * 4. `pay.lenco.co` — the card widget script, blocked by the harness CSP. This is
 *    the harness's **isolation guarantee working**: the stack must never reach the
 *    real Lenco gateway, so the browser must not fetch a script from it. The
 *    journeys all use mobile money, which is the primary method and runs entirely
 *    against the deterministic local adapter. Allowing the host in the harness CSP
 *    would trade that isolation for nothing.
 */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('harness-invalid.localhost');
  gate.allowRequest('/api/v1/payments/quote/');
  gate.allowRequest('pay.lenco.co');
  gate.allowConsole('pay.lenco.co');
  gate.allowConsole('Content Security Policy');
  // Chromium reports a blocked/failed resource fetch as a bare
  // "Failed to load resource: ..." console line with **no URL in the message**,
  // so the console matcher cannot key on the host the way the request matcher
  // can. Allowing the generic line costs nothing: the *request* channel is
  // untouched and still fails the run on any URL that is not named above, so a
  // real 4xx/5xx cannot hide behind it — only its duplicate console echo is
  // silenced.
  gate.allowConsole('Failed to load resource');
}

test.describe('Student payment ownership split (R12.3)', () => {
  // ---------------------------------------------------------------------------
  // 1. Golden — the wizard owns pre-submission payment
  // ---------------------------------------------------------------------------
  test('golden: the wizard takes the payment, then the page owns the paid record', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Golden Pay');
    const { applicationId } = await openWizardPaymentStep(page, offering);

    // --- the wizard's half: a server-authored price, paid here ---------------
    // The wizard renders the fee quote's own numbers. There is no client
    // arithmetic and no fallback amount to fall back to (STU-08 / R12.1).
    const step = page.getByTestId('payment-step');
    await expect(step).toBeVisible({ timeout: 60_000 });
    const total = step.getByTestId('fee-quote-total');
    await expect(total).toBeVisible({ timeout: 60_000 });
    const quotedTotal = ((await total.textContent()) || '').trim();
    expect(quotedTotal, 'the wizard should show the server-quoted total').toMatch(/\d/);
    // The price is held, and the step says until when — not "loading forever".
    await expect(step.getByTestId('fee-quote-expiry')).toBeVisible();
    // Deferral is offered here, and only here.
    await expect(step.getByTestId('pay-later-button')).toBeVisible();
    // The wizard is not a history surface: that belongs to the payment page.
    await expect(page.getByTestId('payment-history-toggle')).toHaveCount(0);
    await expect(page.getByTestId('payment-application')).toHaveCount(0);

    const payButton = step.getByTestId('pay-momo-button');
    await expect(payButton).toBeEnabled({ timeout: 30_000 });
    await step.locator('#momo-phone').fill(PHONE.paysImmediately);
    await payButton.click();

    // The deterministic adapter settles this number immediately, so the ledger
    // is authoritative within the poll window.
    await expect
      .poll(
        async () => (await readPaymentRows(page.request, applicationId))[0]?.status ?? 'none',
        { timeout: 90_000, message: 'the wizard payment should settle successfully' },
      )
      .toBe('successful');

    // --- the page's half: the same payment, as a record ---------------------
    // The settled payment updates the wizard's form, so the student saves before
    // leaving — which is both what the wizard's own control is for and what keeps
    // the unload-time save from being cancelled mid-flight (see
    // `saveAndSettleWizard`).
    //
    // The save comes **before** the submit command, and the order is not
    // incidental: a submitted application no longer accepts a student draft write,
    // so saving afterwards is answered 403 — correctly. The student's own sequence
    // is pay, save, submit; this journey substitutes the platform's submit command
    // for the wizard's submit button (see `submittedApplication`), and keeps the
    // order.
    await page.waitForLoadState('networkidle');
    await saveAndSettleWizard(page);
    await forceSubmitApplication(await platformAdmin(), applicationId);

    const target = await openPaymentPage(page, applicationId);
    await expect(target).toHaveAttribute('data-payment-ui-state', /confirmed|already_paid/);
    await expect(target.getByTestId('payment-state-badge')).toContainText('Paid');
    // A settled fee offers a receipt, and offers nothing to pay.
    // SJR task 3.20 (R5-f) retired "Download receipt": the control is "Prepare receipt"
    // until the receipt exists and an "Open receipt" link after. Either one is the
    // receipt being offered, which is the claim here.
    await expect(
      target
        .getByRole('button', { name: /prepare receipt/i })
        .or(target.getByRole('link', { name: /open receipt/i })),
    ).toBeVisible();
    await expect(target.getByTestId('payment-pay-action')).toHaveCount(0);

    // The amount the page shows is the **ledger row's own** amount, rendered
    // verbatim from `GET /payments/`.
    //
    // It is deliberately not the wizard's "Total charged", and the difference is
    // the point rather than a defect. The quote carries three server-authored
    // numbers (`base_amount`, `provider_fee`, `total_amount`); the wizard's
    // headline is the total, because that is what the handset will ask the student
    // to approve once the provider adds its customer-borne fee. The platform's own
    // ledger — and the receipt generated from it — records the **settlement**
    // amount, which is the application fee the school is owed. The wizard shows
    // both as separate line items, so the number the page repeats is one the
    // student has already seen labelled "Application fee".
    //
    // Asserting equality with the total would demand the page either display a
    // number the ledger does not hold or add `amount + fee` in the browser, which
    // is exactly the arithmetic STU-08 removed. So the claim tested here is the
    // one that matters: the page prints a server field, not a computed one.
    const [settled] = await readPaymentRows(page.request, applicationId);
    expect(settled?.status, 'the settled row should be the one the page reads').toBe('successful');
    const ledgerAmount = ((await target.getByTestId('payment-amount').textContent()) || '').trim();
    expect(ledgerAmount).toContain(String(settled.amount));
    expect(quotedTotal, 'the quoted total includes the provider fee the ledger does not').not.toBe(
      ledgerAmount,
    );

    // History is the page's, and the successful attempt is in it.
    await target.getByTestId('payment-history-toggle').click();
    const history = target.getByTestId('payment-history');
    await expect(history).toBeVisible();
    await expect(history.locator('[data-payment-row-status="successful"]')).toHaveCount(1);
  });

  // ---------------------------------------------------------------------------
  // 2. deferred → pay
  // ---------------------------------------------------------------------------
  test('deferred: the page names the choice and takes the payment after submission', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Deferred Pay');
    const { applicationId, csrf } = await submittedApplication(
      page,
      offering,
      PHONE.paysImmediately,
    );

    // The student deferred in the wizard (the wizard's own command), then
    // submitted. From here on the state is the payment page's.
    const defer = await page.request.post('/api/v1/payments/defer/', {
      headers: { 'x-csrf-token': csrf },
      data: { application_id: applicationId },
    });
    expect(defer.ok(), `defer should succeed (got ${defer.status()})`).toBeTruthy();

    const target = await openPaymentPage(page, applicationId);
    // A deferral is a decision the student made, so the page says so instead of
    // reporting an unpaid fee they may have forgotten.
    await expect(target.getByTestId('payment-state-badge')).toContainText('Paying later');
    await expect(target.getByTestId('payment-state-detail')).toContainText(/pay this fee later/i);
    // And it is payable, right here.
    await expect(target.getByTestId('payment-pay-action')).toContainText('Pay now');

    await payFromPaymentPage(page, applicationId, PHONE.paysImmediately);
    await expect
      .poll(
        async () => {
          const rows = await readPaymentRows(page.request, applicationId);
          return rows.some((row) => row.status === 'successful');
        },
        { timeout: 90_000, message: 'the deferred fee should settle when paid from the page' },
      )
      .toBe(true);

    // A deferral and the payment that resolves it are ONE ledger row, not two.
    //
    // `uq_payments_one_active_per_application` allows a single active row, and
    // `PaymentService.initiate` reuses it — so paying a deferred fee *activates*
    // that row (`deferred → pending → successful`) rather than opening a second
    // one. That is what keeps the student from being charged twice for one fee,
    // and it is why history shows one settled attempt here instead of a deferral
    // plus a payment. The deferral survives as an audited transition on that row,
    // not as a second entry the student has to interpret.
    await openPaymentPage(page, applicationId);
    await card(page, applicationId).getByTestId('payment-history-toggle').click();
    const history = card(page, applicationId).getByTestId('payment-history');
    await expect(history.locator('[data-payment-row-status="successful"]')).toHaveCount(1);
    await expect(history.locator('li')).toHaveCount(1);
    // The activated row is the same one the deferral created — no orphan
    // deferral is left behind claiming the fee is still unpaid.
    const rows = await readPaymentRows(page.request, applicationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('successful');
  });

  // ---------------------------------------------------------------------------
  // 3. failed → retry
  // ---------------------------------------------------------------------------
  test('failed: the page states nothing was charged and the retry succeeds', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Failed Retry');
    const { applicationId } = await submittedApplication(page, offering, PHONE.providerFails);

    // Attempt one, from the page, on the number the provider refuses.
    await openPaymentPage(page, applicationId);
    await payFromPaymentPage(page, applicationId, PHONE.providerFails);
    await expect
      .poll(
        async () => (await readPaymentRows(page.request, applicationId))[0]?.status ?? 'none',
        { timeout: 90_000, message: 'the provider should refuse this collection' },
      )
      .toBe('failed');

    // Re-enter the page as a returning student: the state is read from the
    // server, not from anything this tab remembered.
    const target = await openPaymentPage(page, applicationId);
    await expect(target).toHaveAttribute('data-payment-ui-state', 'retry_with_different_number');
    const detail = target.getByTestId('payment-state-detail');
    // A failure has to say that no money moved, or a student will not retry.
    await expect(detail).toContainText(/not been charged/i);
    // A failure is announced, not just coloured.
    await expect(detail).toHaveAttribute('role', 'alert');
    await expect(target.getByTestId('payment-pay-action')).toContainText('Try again');

    // Attempt two, with a number that works.
    await payFromPaymentPage(page, applicationId, PHONE.paysImmediately);
    await expect
      .poll(
        async () => {
          const rows = await readPaymentRows(page.request, applicationId);
          return rows.some((row) => row.status === 'successful');
        },
        { timeout: 90_000, message: 'the retry should settle' },
      )
      .toBe(true);

    // Both attempts survive in the record.
    await openPaymentPage(page, applicationId);
    await card(page, applicationId).getByTestId('payment-history-toggle').click();
    const history = card(page, applicationId).getByTestId('payment-history');
    await expect(history.locator('[data-payment-row-status="failed"]')).toHaveCount(1);
    await expect(history.locator('[data-payment-row-status="successful"]')).toHaveCount(1);
  });

  // ---------------------------------------------------------------------------
  // 4. pending / action_required → resume
  // ---------------------------------------------------------------------------
  test('pending, action_required: the page tells the student to approve, and offers a re-check', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Prompt Issued');
    const { applicationId, csrf } = await submittedApplication(page, offering, PHONE.promptIssued);

    await openPaymentPage(page, applicationId);
    await payFromPaymentPage(page, applicationId, PHONE.promptIssued);

    // The provider accepted the collection, so the handset prompt is out and the
    // payment row is pending. `phase` is the server's answer to "who are we
    // waiting for?" — the browser does not derive it.
    let paymentId = '';
    await expect
      .poll(
        async () => {
          const row = (await readPaymentRows(page.request, applicationId))[0];
          paymentId = row?.id ?? '';
          return `${row?.status}/${row?.phase}`;
        },
        { timeout: 90_000, message: 'the accepted collection should read pending/action_required' },
      )
      .toBe('pending/action_required');

    // Leave and come back — the situation is recovered from the server, which is
    // the whole point of the payment page owning pending recovery.
    await page.goto('/student/dashboard', { waitUntil: 'domcontentloaded' });
    const target = await openPaymentPage(page, applicationId);

    await expect(target).toHaveAttribute('data-payment-phase', 'action_required');
    await expect(target).toHaveAttribute('data-payment-ui-state', 'action_required');
    await expect(target.getByTestId('payment-state-badge')).toContainText('Approve on your phone');
    // The instruction is actionable, because the student genuinely can act.
    await expect(target.getByTestId('payment-state-detail')).toContainText(/PIN/i);
    // A re-check, not a dead disabled button (R12.6). Before task 8.3 this
    // situation rendered the method picker with its pay button disabled and no
    // stated path to enabled.
    const recheck = target.getByTestId('payment-check-status');
    await expect(recheck).toBeVisible();
    await expect(recheck).toBeEnabled();
    // No second collection request is offered while one is open.
    await expect(target.getByTestId('payment-pay-action')).toHaveCount(0);
    // Every control on the card is live: nothing is disabled without a reason.
    expect(await target.locator('button:disabled').count()).toBe(0);

    // The student presses it, which re-reads the server state rather than
    // starting anything.
    await recheck.click();
    await expect(target.getByTestId('payment-state-detail')).toBeVisible();

    // Cleanup: let the platform's own reconciliation settle the collection so the
    // harness is left drained (R18.4).
    expect(paymentId, 'the pending payment should have an id').toBeTruthy();
    await reconcileUntilSettled(page, applicationId, paymentId, csrf);
  });

  // ---------------------------------------------------------------------------
  // 5. pending / provider_processing → wait
  // ---------------------------------------------------------------------------
  test('pending, provider_processing: the page says wait, and never offers a retry', async ({
    page,
    gate,
  }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Provider Silent');
    const { applicationId, csrf } = await submittedApplication(page, offering, PHONE.providerSilent);

    await openPaymentPage(page, applicationId);
    await payFromPaymentPage(page, applicationId, PHONE.providerSilent);

    // The collection POST 503'd, so the platform does not know whether the
    // customer was ever prompted. The row stays pending and the phase says the
    // provider is the one being waited on.
    let paymentId = '';
    await expect
      .poll(
        async () => {
          const row = (await readPaymentRows(page.request, applicationId))[0];
          paymentId = row?.id ?? '';
          return `${row?.status}/${row?.phase}`;
        },
        {
          timeout: 90_000,
          message: 'a provider 5xx should read pending/provider_processing',
        },
      )
      .toBe('pending/provider_processing');

    // The server also authors the wait budget, and it is the long one: nagging a
    // student cannot help when the provider has gone quiet.
    const rows = await readPaymentRows(page.request, applicationId);
    expect(rows[0]?.phase_timeout_seconds).toBe(600);

    const target = await openPaymentPage(page, applicationId);
    await expect(target).toHaveAttribute('data-payment-phase', 'provider_processing');
    await expect(target).toHaveAttribute('data-payment-ui-state', 'provider_processing');
    await expect(target.getByTestId('payment-state-badge')).toContainText('With your provider');
    // Nothing to do — and the page says exactly that.
    await expect(target.getByTestId('payment-state-detail')).toContainText(/nothing to do/i);
    // This is the double-charge guard: a second collection request against a
    // provider that is still working is how a student gets charged twice.
    await expect(target.getByTestId('payment-pay-action')).toHaveCount(0);
    await expect(target.getByTestId('payment-resend-prompt')).toHaveCount(0);
    // And the student is not told to enter a PIN for a prompt that never came.
    await expect(target.getByTestId('payment-state-detail')).not.toContainText(/enter your PIN/i);
    // A status re-check is still available, and enabled.
    await expect(target.getByTestId('payment-check-status')).toBeEnabled();
    expect(await target.locator('button:disabled').count()).toBe(0);

    // Cleanup: reconciliation resolves what the browser never could.
    expect(paymentId, 'the pending payment should have an id').toBeTruthy();
    await reconcileUntilSettled(page, applicationId, paymentId, csrf);
  });

  // ---------------------------------------------------------------------------
  // 6. expired → new attempt
  //
  // Declared last on purpose: the sweep it runs is global to the harness DB, and
  // by this point every earlier journey has settled its own collection.
  // ---------------------------------------------------------------------------
  test('expired: a reconciliation-expired attempt offers a fresh one', async ({ page, gate }) => {
    test.setTimeout(240_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Expired Attempt');
    const { applicationId } = await submittedApplication(page, offering, PHONE.promptIssued);

    // Open an attempt and leave it open.
    await openPaymentPage(page, applicationId);
    await payFromPaymentPage(page, applicationId, PHONE.promptIssued);
    await expect
      .poll(
        async () => (await readPaymentRows(page.request, applicationId))[0]?.status ?? 'none',
        { timeout: 90_000, message: 'the attempt should be pending before the sweep' },
      )
      .toBe('pending');

    // `expired` is a platform decision, not a provider outcome: no adapter lever
    // can produce it. This runs the same `PaymentService.expire_stale` that
    // `poll_pending_payments_task` runs every 10 minutes, with the 24 h cutoff
    // compressed to zero because a required test cannot wait a day.
    const expiredCount = await runReconciliationExpirySweep();
    expect(expiredCount, 'the sweep should expire the open attempt').toBeGreaterThanOrEqual(1);
    await expect
      .poll(
        async () => (await readPaymentRows(page.request, applicationId))[0]?.status ?? 'none',
        { timeout: 60_000, message: 'the swept attempt should read expired' },
      )
      .toBe('expired');

    // The platform has now walked away from an open provider collection — which is
    // what `expired` *means*, and the only place in this file where it happens. The
    // simulator is told so explicitly, because otherwise it would go on reporting a
    // collection nobody will ever poll again and the drain gate would fail the one
    // journey whose subject is exactly that (see `closeAbandonedAdapterCollection`).
    const [expiredRow] = await readPaymentRows(page.request, applicationId);
    expect(
      expiredRow?.transaction_reference,
      'the expired row should carry the provider reference it abandoned',
    ).toBeTruthy();
    await closeAbandonedAdapterCollection(String(expiredRow.transaction_reference));

    const target = await openPaymentPage(page, applicationId);
    await expect(target).toHaveAttribute('data-payment-ui-state', 'expired');
    await expect(target).toHaveAttribute('data-payment-phase', 'expired');
    await expect(target.getByTestId('payment-state-badge')).toContainText('Attempt expired');
    // An expiry is not a failure and not a charge: the fee is still owed.
    await expect(target.getByTestId('payment-state-detail')).toContainText(/nothing was charged/i);
    await expect(target.getByTestId('payment-pay-action')).toContainText('Start a new payment');
    expect(await target.locator('button:disabled').count()).toBe(0);

    // The way out works.
    await payFromPaymentPage(page, applicationId, PHONE.paysImmediately);
    await expect
      .poll(
        async () => {
          const rows = await readPaymentRows(page.request, applicationId);
          return rows.some((row) => row.status === 'successful');
        },
        { timeout: 90_000, message: 'the new attempt after expiry should settle' },
      )
      .toBe(true);

    await openPaymentPage(page, applicationId);
    await card(page, applicationId).getByTestId('payment-history-toggle').click();
    const history = card(page, applicationId).getByTestId('payment-history');
    await expect(history.locator('[data-payment-row-status="expired"]')).toHaveCount(1);
    await expect(history.locator('[data-payment-row-status="successful"]')).toHaveCount(1);
  });

  // ---------------------------------------------------------------------------
  // 7. STU-24 — the support affordance is resolved, never hardcoded
  // ---------------------------------------------------------------------------
  test('support copy comes from tenant context, not from the component (STU-24)', async ({
    page,
    gate,
  }) => {
    test.setTimeout(120_000);
    allowHarnessNoise(gate);

    const offering = await configurePaidOffering('Support Context');
    const { applicationId } = await submittedApplication(page, offering, PHONE.paysImmediately);
    await openPaymentPage(page, applicationId);

    const support = page.getByTestId('payment-page-support');
    await expect(support).toBeVisible();
    // The neutral shared portal resolves no tenant, so the student is routed to
    // the in-app contact page — a real path forward, not a school's inbox that
    // may not be theirs, and not an address printed into the component.
    await expect(support).toHaveAttribute('data-support-kind', 'platform_contact_page');
    await expect(support).toHaveAttribute('href', '/contact');

    // No stale platform or example-tenant contact copy anywhere on the page.
    const body = (await page.locator('body').innerText()).toLowerCase();
    for (const stale of ['admissions@beanola.com', 'support@beanola.com', '+260 966', '+260 961']) {
      expect(body, `the payment page should not print "${stale}"`).not.toContain(stale);
    }
    // MIHAS/KATC are example tenants, never a fallback identity for a portal
    // that resolved no tenant.
    expect(body).not.toContain('mihas');
    expect(body).not.toContain('katc');
  });
});
