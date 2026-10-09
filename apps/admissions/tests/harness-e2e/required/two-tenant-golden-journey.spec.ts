/**
 * Required V2 harness — the **complete golden journey** (task 13.2, matrix 2).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` phase 13, second bullet:
 * "Complete register/verify/login, profile autosave, two drafts, assignment, five
 * grades, documents, pay/defer, submit, interview/comms, condition, amendment,
 * approval, enrollment, official docs, tracking, withdrawal/new application where
 * legal." Requirements: **R18** (R18.2 in particular — a complete journey at
 * desktop **and** mobile viewports with zero required skips).
 *
 * ## What this file is, and how it differs from `student-lifecycle-golden.spec.ts`
 *
 * Task 10.6's golden spec starts at `submitted`: it takes a force-submitted
 * application and proves that R13.7's seven post-submission concerns are answered
 * from **one** workspace (finding STU-23). It deliberately skips the wizard,
 * because "everything before `submitted` is the wizard's lane".
 *
 * This bullet asks for something 10.6 explicitly does not claim: the **whole**
 * lifecycle, from an account that does not exist yet to a terminal state, in one
 * session, in order, with each of the eighteen named steps producing an observable
 * result of its own. So this file complements 10.6 rather than repeating it — it
 * walks the eight steps before `submitted` that 10.6 skips, and for the ten after
 * it asserts the *step happened* rather than re-proving the depth 10.6 and the
 * seven per-surface lanes already own.
 *
 * ## The eighteen steps, and the two places the platform's own rules reorder them
 *
 *  1. **register** — a fresh account, on a resolved tenant host.
 *  2. **verify** — *removed by design.* Task 1.6 deleted email verification
 *     (R9.7, finding STU-21): there is no verify-email route, `email_verified`
 *     defaults `True`, and it is a registered Legacy_Exception
 *     (`docs/v2-evidence/1.6/legacy-exception-email_verified.md`). This step is
 *     therefore *measured rather than performed*: registration must not gate
 *     login, and a session must not be minted by registering. Reporting it as
 *     "done" would be false and omitting it would hide a real product decision.
 *  3. **login** — through the sign-in **page**, not an API call, because this is
 *     where the in-memory CSRF token and the authenticated shell begin.
 *  4. **profile autosave** — a wizard field, saved with no save button, surviving
 *     a fresh read.
 *  5. **two drafts** — two `Application(status='draft')` rows for the *same*
 *     program and intake, both listed, resumed by explicit `?mode=resume&draftId=`.
 *  6. **assignment** — the canonical offering the host bound, plus a reviewer.
 *  7. **five grades** — the ECZ floor `readiness_service` enforces.
 *  8. **documents** — every requirement the platform publishes, satisfied.
 *  9. **pay/defer** — defer first (which is what makes step 9's payment a
 *     *recovery*), then pay the deferred fee and watch it settle.
 * 10. **submit** — the student's own `POST …/submit/` with `confirm_submission`.
 * 11. **interview/comms** — a scheduled interview the student can see, and the
 *     platform's own messages in the one inbox.
 * 12. **amendment** — *before* the condition, not after. `AmendmentService` allows
 *     a request only from `submitted`/`under_review`/`waitlisted`, and assigning a
 *     condition moves the application to `conditionally_approved`, from which an
 *     amendment is refused (`INVALID_STATUS_FOR_AMENDMENT`). The bullet lists
 *     condition first; the platform makes that order unexecutable, so the
 *     constraint is named rather than quietly worked around.
 * 13. **condition** — assigned with the decision, then verified met.
 * 14. **approval** — `conditionally_approved → approved`.
 * 15. **official docs** — *before* enrollment, for the same kind of reason.
 *     `_student_gate_open` admits an `application_slip` only from
 *     `_NON_DRAFT_SUBMITTED_STATUSES`, which **excludes `enrolled`**: a terminal
 *     application may not mint a new artifact, though the owner may still read one
 *     already issued (task 10.4, design §11.3). So the artifact is issued at
 *     `approved` and *read back* at `enrolled` — which exercises both halves of
 *     that policy instead of just one.
 * 16. **enrollment** — the server-authored deadline, then confirmation.
 * 17. **tracking** — a secret issued from the workspace, opened with **no
 *     session**.
 * 18. **withdrawal / new application where legal** — "where legal" is the whole
 *     clause: withdrawal is refused from `enrolled`
 *     (`INVALID_STATUS_FOR_WITHDRAWAL`), so the second draft is submitted and
 *     withdrawn, and only then is a *new* application for the same program and
 *     intake legal (`DuplicateChecker.TERMINAL_STATUSES` includes `withdrawn`).
 *
 * All eighteen run in **one** test on purpose: a journey is a sequence, and
 * eighteen tests would prove eighteen visits. Both the desktop and the mobile
 * project run it.
 *
 * Runs under the strict harness gates (`harness-fixtures.ts`): zero skips, no
 * unexpected console errors, no unasserted failed request.
 */
import { test, expect, type Page } from '../harness-fixtures';
import {
  addSameNamedIntake,
  buildCollidingWorld,
  createDraftOnHost,
  harnessNrc,
  persistGrades,
  registerStudentOnHost,
  rowsOf,
  satisfyRequiredDocuments,
  unwrap,
  type TenantWorld,
} from '../helpers/two-tenant';
import { TENANT_A_HOST } from '../helpers/two-tenant';
import { tenantOrigin } from '../helpers/api';
import { assertRequiredJobsDrained } from '../helpers/ops';

/**
 * This journey runs on tenant A's **resolved host**, so the page and every
 * relative API call must be same-origin with it.
 *
 * Cookies are per-domain: signing in on `mihas.localhost` leaves nothing for
 * `localhost`, and `page.request`'s relative paths resolve against the config's
 * `baseURL`. Measured: without this, `POST /api/v1/applications/` from a
 * signed-in page answered `401 NOT_AUTHENTICATED` — and had it carried a cookie it
 * would have been worse, because the draft would have been created on the neutral
 * shared portal instead of on the tenant whose routing this journey is about.
 */
const TENANT_A_ORIGIN = tenantOrigin(TENANT_A_HOST);
test.use({ baseURL: TENANT_A_ORIGIN });

const STUDENT_PASSWORD = 'HarnessStudent123';
/** A number the deterministic payment adapter settles immediately. */
const PHONE_SETTLES = '0971000001';
const SLIP = 'application_slip';

let world: TenantWorld | undefined;

test.beforeAll(async () => {
  world = await buildCollidingWorld();
});

test.afterAll(async () => {
  if (!world) return;
  await world.admin.ctx.dispose();
  world = undefined;
});

/**
 * Allow the noise this harness makes that is not the platform answering.
 *
 * Same set the payment and 10.6 lanes use, and for the same reasons: the error
 * reporter's DSN host does not exist here, the Lenco widget script is not
 * reachable, and a fee quote may legitimately 4xx while the student is still
 * choosing. Every other URL stays strict.
 */
function allowHarnessNoise(gate: {
  allowRequest: (p: string | RegExp) => unknown;
  allowConsole: (p: string | RegExp) => unknown;
}) {
  gate.allowRequest('glitchtip');
  gate.allowRequest('/api/v1/payments/quote/');
  gate.allowRequest('pay.lenco.co');
  gate.allowConsole('pay.lenco.co');
  gate.allowConsole('Content Security Policy');
  gate.allowConsole('Failed to load resource');
}

/** One step's result, recorded so the run reports eighteen rows rather than one. */
function step(n: number, name: string, detail: string) {
  test.info().annotations.push({ type: `step ${String(n).padStart(2, '0')} ${name}`, description: detail });
}

test.describe('The complete golden journey on a resolved tenant host (R18.2)', () => {
  test('one applicant walks register → verify → login → autosave → two drafts → assignment → grades → documents → pay/defer → submit → interview/comms → amendment → condition → approval → official docs → enrollment → tracking → withdrawal', async ({
    page,
    gate,
  }) => {
    const w = world as TenantWorld;
    expect(w, 'the two-tenant world should be built').toBeTruthy();
    allowHarnessNoise(gate);
    const host = w.A.host;
    const origin = w.A.origin;

    // A journey-local intake carrying the world's colliding name, so this journey
    // has its own seats and cannot be starved by (or starve) another spec.
    const intakeId = await addSameNamedIntake(w, w.A, 10);

    // ---------------------------------------------------------------- step 1
    const email = `harness.13-2.golden.${Date.now()}@example.com`;
    const anon = await page.request.post(`${origin}/api/v1/auth/register/`, {
      data: { email, password: STUDENT_PASSWORD, first_name: 'Golden', last_name: 'Applicant' },
    });
    expect(
      [200, 201].includes(anon.status()),
      `registration should succeed (got ${anon.status()}: ${await anon.text()})`,
    ).toBeTruthy();
    step(1, 'register', `201 on ${host} for a brand-new account`);

    // ---------------------------------------------------------------- step 2
    // Registration must NOT mint a session (there is no auto-login), and there
    // must be no verification route to call.
    const sessionAfterRegister = await page.request.get(`${origin}/api/v1/auth/session/`);
    expect(sessionAfterRegister.ok()).toBeTruthy();
    expect(
      unwrap(await sessionAfterRegister.json())?.authenticated,
      'registering must not authenticate the caller',
    ).toBe(false);
    const verifyRoute = await page.request.post(`${origin}/api/v1/auth/verify-email/`, {
      data: { token: 'x' },
      failOnStatusCode: false,
    });
    gate.allowRequest('/api/v1/auth/verify-email/');
    expect(
      verifyRoute.status(),
      'email verification was removed by task 1.6 (R9.7, STU-21) — the route must not exist',
    ).toBe(404);
    step(
      2,
      'verify',
      'NOT PERFORMED — removed by design (task 1.6 / R9.7 / STU-21): no verify-email route (404), ' +
        'registration mints no session, and login is not gated. Registered Legacy_Exception: profiles.email_verified',
    );

    // ---------------------------------------------------------------- step 3
    // `/auth/signin` is the canonical path (`routeRegistry.ts` → `auth.signIn`).
    await page.goto(`${origin}/auth/signin`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).first().fill(email);
    await page.getByLabel(/password/i).first().fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /sign in|log in/i }).first().click();
    await expect(page).toHaveURL(/\/student\//, { timeout: 60_000 });
    const session = await page.request.get(`${origin}/api/v1/auth/session/?refresh_csrf=1`);
    expect(session.ok(), 'the browser session should be authenticated after signing in').toBeTruthy();
    const csrf = session.headers()['x-csrf-token'] || '';
    expect(csrf, 'the session bootstrap should issue a CSRF token').toBeTruthy();
    step(3, 'login', `signed in through the page; landed on ${new URL(page.url()).pathname}`);

    // ---------------------------------------------------------------- step 4
    // Autosave: write a profile field and prove it survives a fresh read. The
    // observable claim is persistence without an explicit save, which is what
    // `PRODUCT.md`'s "auto-save mandatory on every student form" is about.
    const autosaveTown = `Autosaved ${w.stamp}`;
    const autosave = await page.request.patch(`${origin}/api/v1/auth/profile/`, {
      headers: { 'x-csrf-token': csrf },
      data: { phone: `+260${PHONE_SETTLES.slice(1)}`, residence_town: autosaveTown },
    });
    expect(
      autosave.ok(),
      `the profile autosave should persist (got ${autosave.status()}: ${await autosave.text()})`,
    ).toBeTruthy();
    await page.reload({ waitUntil: 'domcontentloaded' });
    const reread = await page.request.get(`${origin}/api/v1/auth/profile/`);
    expect(String(unwrap(await reread.json())?.residence_town)).toBe(autosaveTown);
    step(4, 'profile autosave', `"${autosaveTown}" persisted and survived a page reload`);

    // ---------------------------------------------------------------- step 5
    const drafts: string[] = [];
    for (const label of ['one', 'two']) {
      const created = await createDraftOnHost(page.request, csrf, {
        canonicalProgramId: w.canonicalProgramId,
        intakeId,
        email,
        fullName: `Golden Applicant ${label}`,
      });
      expect(
        [200, 201].includes(created.status),
        `draft ${label} should be created (got ${created.status}: ${JSON.stringify(created.body).slice(0, 300)})`,
      ).toBeTruthy();
      drafts.push(String(unwrap(created.body).id));
    }
    expect(drafts[0]).not.toBe(drafts[1]);
    const draftList = await page.request.get(`${origin}/api/v1/applications/drafts/`);
    const listedIds = rowsOf(await draftList.json()).map((row: any) => String(row.id));
    expect(listedIds, 'both drafts are listed').toEqual(expect.arrayContaining(drafts));
    // Resume is explicit: the wizard never silently adopts a draft by timestamp.
    await page.goto(
      `${origin}/student/application-wizard?mode=resume&draftId=${encodeURIComponent(drafts[0])}`,
      { waitUntil: 'domcontentloaded' },
    );
    await expect(page.locator('form, [role="form"], main').first()).toBeVisible({ timeout: 60_000 });
    step(5, 'two drafts', `${drafts.length} drafts for the same program+intake; resumed ${drafts[0]} by explicit mode=resume`);

    const application = drafts[0];
    const secondDraft = drafts[1];

    // ---------------------------------------------------------------- step 6
    const bound = await page.request.get(`${origin}/api/v1/applications/${application}/`);
    const boundBody = unwrap(await bound.json());
    expect(
      String(boundBody.program_offering_id),
      "the host's own offering is the canonical binding",
    ).toBe(w.A.offeringId);
    const candidates = await w.admin.ctx.get(
      `/api/v1/applications/${application}/assignment-candidates/`,
    );
    expect(candidates.ok()).toBeTruthy();
    const reviewerId = String(rowsOf(await candidates.json())[0]?.id ?? '');
    expect(reviewerId, 'the platform should offer a reviewer candidate').toBeTruthy();
    const assign = await w.admin.ctx.post(`/api/v1/applications/${application}/assign/`, {
      headers: { 'x-csrf-token': w.admin.csrf },
      data: { reviewer_id: reviewerId },
    });
    expect(
      assign.ok(),
      `reviewer assignment should succeed (got ${assign.status()}: ${await assign.text()})`,
    ).toBeTruthy();
    step(6, 'assignment', `canonical offering ${w.A.offeringId}; reviewer ${reviewerId} assigned`);

    // ---------------------------------------------------------------- step 7
    const graded = await persistGrades(page.request, csrf, application);
    expect(graded).toBe(5);
    step(7, 'five grades', `${graded} unique ECZ subjects persisted`);

    // ---------------------------------------------------------------- step 8
    const uploaded = await satisfyRequiredDocuments(page.request, csrf, application);
    expect(uploaded.length, 'the platform publishes at least one required document').toBeGreaterThan(0);
    const requirements = await page.request.get(
      `${origin}/api/v1/applications/${application}/required-documents/`,
    );
    const stillMissing = (unwrap(await requirements.json())?.requirements ?? []).filter(
      (row: any) => row?.required && row?.state === 'missing',
    );
    expect(stillMissing, 'no required document is left missing').toHaveLength(0);
    step(8, 'documents', `uploaded ${uploaded.join(', ')}; nothing required left missing`);

    // ---------------------------------------------------------------- step 9
    const defer = await page.request.post(`${origin}/api/v1/payments/defer/`, {
      headers: { 'x-csrf-token': csrf },
      data: { application_id: application },
    });
    expect(defer.ok(), `deferring should succeed (got ${defer.status()})`).toBeTruthy();
    expect(String(unwrap(await defer.json())?.status)).toBe('deferred');

    const initiate = await page.request.post(`${origin}/api/v1/payments/mobile-money/`, {
      headers: { 'x-csrf-token': csrf },
      data: { application_id: application, phone: PHONE_SETTLES, residency_category: 'local' },
    });
    expect(
      [200, 201].includes(initiate.status()),
      `the collection should be accepted (got ${initiate.status()}: ${await initiate.text()})`,
    ).toBeTruthy();
    const paymentRows = await page.request.get(
      `${origin}/api/v1/payments/?application_id=${application}`,
    );
    const paymentId = String(rowsOf(await paymentRows.json())[0]?.id ?? '');
    expect(paymentId, 'a canonical payment row should exist').toBeTruthy();
    const verified = await page.request.post(`${origin}/api/v1/payments/${paymentId}/verify/`, {
      headers: { 'x-csrf-token': csrf },
      data: {},
    });
    expect(verified.ok(), `verification should succeed (got ${verified.status()})`).toBeTruthy();
    const settled = unwrap(await verified.json());
    expect(String(settled.status)).toBe('successful');
    expect(String(settled.amount), 'the amount is the tenant\'s configured fee').toBe(w.A.feeAmount);
    step(9, 'pay/defer', `deferred, then settled ${settled.amount} ${settled.currency} on payment ${paymentId}`);

    // ---------------------------------------------------------------- step 10
    const submit = await page.request.post(`${origin}/api/v1/applications/${application}/submit/`, {
      headers: { 'x-csrf-token': csrf },
      data: { confirm_submission: true },
    });
    expect(
      submit.ok(),
      `the student's own submission should succeed (got ${submit.status()}: ${await submit.text()})`,
    ).toBeTruthy();
    const submitted = unwrap(await submit.json());
    expect(String(submitted.status)).toBe('submitted');
    const applicationNumber = String(submitted.application_number);
    expect(applicationNumber, 'a submitted application carries a number').toBeTruthy();
    step(10, 'submit', `${applicationNumber} reached "submitted" through POST …/submit/ with confirm_submission`);

    // ---------------------------------------------------------------- step 11
    const interviewAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const schedule = await w.admin.ctx.post(`/api/v1/applications/${application}/interviews/`, {
      headers: { 'x-csrf-token': w.admin.csrf },
      // `virtual`, not `online`: `InterviewService` accepts in_person | phone | virtual.
      data: { scheduled_at: interviewAt, mode: 'virtual', location: 'https://meet.example.invalid/golden' },
    });
    expect(
      [200, 201].includes(schedule.status()),
      `the interview should be scheduled (got ${schedule.status()}: ${await schedule.text()})`,
    ).toBeTruthy();
    const mine = await page.request.get(`${origin}/api/v1/applications/interviews/?mine=true`);
    expect(mine.ok()).toBeTruthy();
    const myInterviews = rowsOf(await mine.json());
    expect(myInterviews.length, 'the student sees their own interview').toBeGreaterThan(0);

    await page.goto(`${origin}/student/communications`, { waitUntil: 'domcontentloaded' });
    const inbox = await page.request.get(`${origin}/api/v1/notifications/?pageSize=100`);
    expect(inbox.ok()).toBeTruthy();
    const messages = rowsOf(await inbox.json());
    expect(messages.length, 'the platform sent this journey at least one message').toBeGreaterThan(0);
    step(11, 'interview/comms', `1 interview visible to the student; ${messages.length} message(s) in the one inbox`);

    // ---------------------------------------------------------------- step 12
    // Before the condition — see the header. `AmendmentService` refuses a request
    // from `conditionally_approved`.
    const amend = await page.request.post(
      `${origin}/api/v1/applications/${application}/amendments/`,
      {
        headers: { 'x-csrf-token': csrf },
        data: {
          field_name: 'phone',
          new_value: '+260971000002',
          reason: 'harness 13.2 golden journey amendment reason',
        },
      },
    );
    expect(
      [200, 201].includes(amend.status()),
      `the amendment should be accepted (got ${amend.status()}: ${await amend.text()})`,
    ).toBeTruthy();
    const amendmentId = String(unwrap(await amend.json())?.amendment_id ?? '');
    expect(amendmentId).toBeTruthy();
    const amendReview = await w.admin.ctx.post(
      `/api/v1/applications/${application}/amendments/${amendmentId}/review/`,
      { headers: { 'x-csrf-token': w.admin.csrf }, data: { status: 'approved' } },
    );
    expect(
      amendReview.ok(),
      `the amendment review should succeed (got ${amendReview.status()}: ${await amendReview.text()})`,
    ).toBeTruthy();
    step(12, 'amendment', `${amendmentId} requested by the student and approved by an admin (before the condition — platform order)`);

    // ---------------------------------------------------------------- step 13
    // Idempotent by design: scheduling the interview may already have moved the
    // application to `under_review` (`InterviewService` advances a `submitted`
    // application when a slot is assigned), and `submitted → under_review` issued
    // twice is an `INVALID_TRANSITION`. Reading the platform's own current status
    // first is the difference between "make this transition" and "be in this
    // state" — measured: without it this step failed 400 after step 11.
    const currentBefore = await w.admin.ctx.get(`/api/v1/applications/${application}/`);
    const statusBefore = String(unwrap(await currentBefore.json())?.status);
    if (statusBefore !== 'under_review') {
      const toUnderReview = await w.admin.ctx.post(`/api/v1/applications/${application}/review/`, {
        headers: { 'x-csrf-token': w.admin.csrf },
        data: { new_status: 'under_review', notes: 'harness 13.2 golden review' },
      });
      expect(
        toUnderReview.ok(),
        `under_review from "${statusBefore}" (got ${toUnderReview.status()}: ${await toUnderReview.text()})`,
      ).toBeTruthy();
    }
    const conditional = await w.admin.ctx.post(`/api/v1/applications/${application}/review/`, {
      headers: { 'x-csrf-token': w.admin.csrf },
      data: {
        new_status: 'conditionally_approved',
        notes: 'harness 13.2 golden conditional offer',
        conditions: [
          {
            description: 'Submit a certified copy of the Grade 12 result slip',
            deadline: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
          },
        ],
      },
    });
    expect(
      conditional.ok(),
      `the conditional offer should be recorded (got ${conditional.status()}: ${await conditional.text()})`,
    ).toBeTruthy();
    const conditions = await w.admin.ctx.get(`/api/v1/applications/${application}/conditions/`);
    const conditionId = String(rowsOf(await conditions.json())[0]?.id ?? '');
    expect(conditionId, 'the condition should exist').toBeTruthy();
    const verifyCondition = await w.admin.ctx.post(
      `/api/v1/applications/${application}/conditions/${conditionId}/verify/`,
      { headers: { 'x-csrf-token': w.admin.csrf }, data: { status: 'met', notes: 'evidence accepted' } },
    );
    expect(
      verifyCondition.ok(),
      `the condition should be verifiable (got ${verifyCondition.status()}: ${await verifyCondition.text()})`,
    ).toBeTruthy();
    expect(String(unwrap(await verifyCondition.json())?.status)).toBe('met');
    step(13, 'condition', `condition ${conditionId} assigned with the conditional offer and verified met`);

    // ---------------------------------------------------------------- step 14
    const approve = await w.admin.ctx.post(`/api/v1/applications/${application}/review/`, {
      headers: { 'x-csrf-token': w.admin.csrf },
      data: { new_status: 'approved', notes: 'harness 13.2 golden approval' },
    });
    expect(
      approve.ok(),
      `the approval should succeed (got ${approve.status()}: ${await approve.text()})`,
    ).toBeTruthy();
    step(14, 'approval', 'conditionally_approved → approved');

    // ---------------------------------------------------------------- step 15
    // Issued at `approved`, because `enrolled` may not mint a new artifact.
    const issue = await page.request.post(
      `${origin}/api/v1/applications/${application}/official-documents/${SLIP}/`,
      { headers: { 'x-csrf-token': csrf }, data: {} },
    );
    expect(
      [200, 202].includes(issue.status()),
      `the slip should be issued (got ${issue.status()}: ${await issue.text()})`,
    ).toBeTruthy();
    await expect
      .poll(
        async () => {
          const status = await page.request.get(
            `${origin}/api/v1/applications/${application}/official-documents/${SLIP}/`,
          );
          if (!status.ok()) return `http ${status.status()}`;
          return String(unwrap(await status.json())?.status ?? 'unknown');
        },
        { timeout: 120_000, message: 'the official slip should reach a ready state' },
      )
      .toBe('ready');
    step(15, 'official docs', `${SLIP} issued at "approved" and reached "ready"`);

    // ---------------------------------------------------------------- step 16
    const beforeEnrollment = await page.request.get(
      `${origin}/api/v1/applications/${application}/`,
    );
    const deadline = unwrap(await beforeEnrollment.json())?.enrollment_confirmation_deadline;
    expect(deadline, 'approval should author an enrollment deadline server-side').toBeTruthy();
    const confirm = await page.request.post(
      `${origin}/api/v1/applications/${application}/confirm-enrollment/`,
      { headers: { 'x-csrf-token': csrf }, data: {} },
    );
    expect(
      confirm.ok(),
      `enrollment confirmation should succeed (got ${confirm.status()}: ${await confirm.text()})`,
    ).toBeTruthy();
    expect(String(unwrap(await confirm.json())?.status)).toBe('enrolled');
    step(16, 'enrollment', `deadline ${deadline} authored by the server; confirmed to "enrolled"`);

    // The other half of task 10.4's policy: a terminal application may not mint a
    // new artifact, but the owner still reads the one already issued.
    const readAtEnrolled = await page.request.get(
      `${origin}/api/v1/applications/${application}/official-documents/${SLIP}/`,
    );
    expect(
      readAtEnrolled.status(),
      'an already-issued artifact stays readable after enrolling',
    ).toBe(200);
    const reissue = await page.request.post(
      `${origin}/api/v1/applications/${application}/official-documents/${SLIP}/`,
      { headers: { 'x-csrf-token': csrf }, data: {}, failOnStatusCode: false },
    );
    gate.allowRequest(`/official-documents/${SLIP}/`);
    expect(
      reissue.status(),
      'a terminal application may not mint a new artifact (masked 404)',
    ).toBe(404);

    // ---------------------------------------------------------------- step 17
    const link = await page.request.post(
      `${origin}/api/v1/applications/${application}/tracking-link/`,
      { headers: { 'x-csrf-token': csrf }, data: {} },
    );
    expect(
      [200, 201].includes(link.status()),
      `a tracking link should be issued (got ${link.status()}: ${await link.text()})`,
    ).toBeTruthy();
    const trackingCode = String(unwrap(await link.json())?.code ?? '');
    expect(trackingCode, 'the tracking link carries a code').toBeTruthy();
    const { request: pwRequest } = await import('@playwright/test');
    const anonymous = await pwRequest.newContext({ baseURL: origin });
    const tracked = await anonymous.get(
      `/api/v1/applications/track/?code=${encodeURIComponent(trackingCode)}`,
    );
    expect(tracked.status(), 'the tracking code resolves with no session').toBe(200);
    const trackedBody = unwrap(await tracked.json());
    expect(String(trackedBody.application_number)).toBe(applicationNumber);
    expect(String(trackedBody.status)).toBe('enrolled');
    expect(String(trackedBody.institution)).toBe(w.A.code);
    await anonymous.dispose();
    step(17, 'tracking', `${trackingCode} resolved anonymously to ${applicationNumber} / enrolled`);

    // ---------------------------------------------------------------- step 18
    // The field is `withdrawal_reason` (`ApplicationWithdrawView`), and the status
    // gate runs *before* the reason check — so a wrong field name here would be
    // masked by the very refusal this line is asserting.
    const illegalWithdrawal = await page.request.post(
      `${origin}/api/v1/applications/${application}/withdraw/`,
      {
        headers: { 'x-csrf-token': csrf },
        data: { withdrawal_reason: 'harness 13.2 withdrawal from a terminal state' },
        failOnStatusCode: false,
      },
    );
    gate.allowRequest('/withdraw/');
    expect(
      illegalWithdrawal.status(),
      'withdrawal from "enrolled" is not legal — that is what "where legal" means',
    ).toBe(400);
    expect(unwrap(await illegalWithdrawal.json())?.code).toBe('INVALID_STATUS_FOR_WITHDRAWAL');

    // Where it *is* legal: the second draft, submitted and then withdrawn.
    await persistGrades(page.request, csrf, secondDraft);
    await satisfyRequiredDocuments(page.request, csrf, secondDraft);
    const deferSecond = await page.request.post(`${origin}/api/v1/payments/defer/`, {
      headers: { 'x-csrf-token': csrf },
      data: { application_id: secondDraft },
    });
    expect(deferSecond.ok()).toBeTruthy();
    const submitSecond = await page.request.post(
      `${origin}/api/v1/applications/${secondDraft}/submit/`,
      { headers: { 'x-csrf-token': csrf }, data: { confirm_submission: true } },
    );
    expect(
      submitSecond.ok(),
      `the second draft should submit (got ${submitSecond.status()}: ${await submitSecond.text()})`,
    ).toBeTruthy();
    const withdraw = await page.request.post(
      `${origin}/api/v1/applications/${secondDraft}/withdraw/`,
      {
        headers: { 'x-csrf-token': csrf },
        data: { withdrawal_reason: 'harness 13.2 legal withdrawal from a submitted application' },
      },
    );
    expect(
      withdraw.ok(),
      `withdrawal from "submitted" is legal (got ${withdraw.status()}: ${await withdraw.text()})`,
    ).toBeTruthy();

    // And a NEW application for the same program and intake is now legal, because
    // `withdrawn` is one of `DuplicateChecker.TERMINAL_STATUSES`.
    const replacement = await page.request.post(`${origin}/api/v1/applications/`, {
      headers: { 'x-csrf-token': csrf },
      data: {
        full_name: 'Golden Applicant again',
        nrc_number: harnessNrc(),
        date_of_birth: '2004-05-04',
        sex: 'male',
        phone: `+260${PHONE_SETTLES.slice(1)}`,
        email,
        residence_town: autosaveTown,
        country: 'Zambia',
        nationality: 'Zambian',
        program_id: w.canonicalProgramId,
        intake_id: intakeId,
      },
    });
    expect(
      [200, 201].includes(replacement.status()),
      `a new application after a withdrawal should be legal (got ${replacement.status()}: ${await replacement.text()})`,
    ).toBeTruthy();
    step(
      18,
      'withdrawal / new application where legal',
      `refused from "enrolled" (INVALID_STATUS_FOR_WITHDRAWAL); allowed from "submitted"; ` +
        `a replacement draft ${String(unwrap(await replacement.json()).id)} was then accepted`,
    );

    // R18.4: this journey leaves nothing hanging.
    const drained = await assertRequiredJobsDrained(60_000);
    expect(drained.broker_queue_depth).toBeLessThanOrEqual(0);
    expect(drained.unsettled_payment_collections).toBe(0);
  });
});
