/**
 * Required V2 harness — enrollment readiness is the server's answer, and
 * confirmation is transactional (task 10.3).
 *
 * Spec: `.kiro/specs/admissions-v2-canonical-rebuild/` task 10.3 — "Make
 * enrollment readiness and confirmation transactional".
 * Requirements: **R13.2** (the deadline and readiness on the list/detail
 * contracts), **R13.9** (enrollment readiness/deadline server-authored and
 * rechecked under the enrollment lock), **R17.1** (transaction boundaries and
 * idempotency for a multi-step command).
 * Findings: **STU-15**, **DATA-03**.
 * Design: §11.2 ("Confirmation locks the application and offer/enrollment
 * record, rechecks status, all mandatory conditions, deadline, capacity, and
 * existing enrollment, then commits idempotently") and §16.1's named journey
 * "Conditions/amendments/enrollment — ... concurrent confirm".
 *
 * This file is the task's `_Evidence:` line: *concurrent confirm, deadline,
 * missing-condition, and success tests*, in the browser.
 *
 * Why the browser is required and not only endpoint tests: **STU-15 is half a
 * missing surface.** The enrollment deadline was absent from both serializers
 * while `ApplicationListItem` was already reading
 * `enrollment_confirmation_deadline` off the list row — so the field was
 * permanently `undefined` and the enrollment card could not render at all. The
 * only rule that survived was a client-side `status === 'approved'` test, which is
 * *narrower* than the backend's: a conditionally approved student who had
 * satisfied every condition was shown nothing to do. An endpoint test can prove
 * the command accepts them; only the browser can prove they are offered it.
 *
 * The four journeys:
 *
 *   1. **success.** An approved offer publishes a deadline and a countdown on
 *      both the dashboard row and the application page, the student confirms, and
 *      the platform reads back as enrolled.
 *   2. **missing condition.** A conditionally approved student with an outstanding
 *      condition is shown the reason and an action instead of a confirm button,
 *      and the command refuses; the school accepts the condition and the same
 *      student is then offered the control and enrolls.
 *   3. **deadline.** An offer whose deadline has passed publishes
 *      `deadline_passed` with a negative countdown, renders the refusal, and the
 *      command answers `DEADLINE_PASSED`.
 *   4. **concurrent confirm.** Six simultaneous confirmations of one application
 *      produce exactly one enrollment — every caller sees `enrolled`, and the
 *      status history holds a single transition.
 *
 * Runs against the isolated local harness (task 0.4) with the strict gates active
 * (`harness-fixtures.ts`): zero skips, no console errors, no unasserted failed
 * requests. Both the desktop and the mobile project run every journey.
 */
import { test, expect, type APIRequestContext, type Page } from '../harness-fixtures';
import {
  assignOffering,
  createDraftApplication,
  createIntake,
  freshContext,
  linkIntake,
  listCanonicalPrograms,
  superAdminContext,
  type AuthedContext,
} from '../helpers/api';
import { expireEnrollmentDeadline } from '../helpers/ops';

/** The student's own application workspace (`routeRegistry` student.status alias). */
const APPLICATION_URL = (applicationId: string) => `/application/${applicationId}`;
const DASHBOARD_URL = '/student/dashboard';
const CONFIRM_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/confirm-enrollment/`;
const CONDITIONS_API = (applicationId: string) =>
  `/api/v1/applications/${applicationId}/conditions/`;
const APPLICATION_API = (applicationId: string) => `/api/v1/applications/${applicationId}/`;

test.describe.configure({ mode: 'serial' });

interface SeededApplicant {
  ctx: APIRequestContext;
  email: string;
  password: string;
  csrf: string;
  applicationId: string;
}

interface SeededWorld {
  admin: AuthedContext;
  institutionId: string;
  canonicalProgramId: string;
  intakeId: string;
  /** Journey 1: an unconditional offer inside its deadline. */
  success: SeededApplicant;
  /** Journey 2: a conditional offer with one outstanding condition. */
  conditional: SeededApplicant;
  conditionId: string;
  /** Journey 3: an offer whose deadline has passed. */
  overdue: SeededApplicant;
  /** Journey 4: an unconditional offer confirmed by six callers at once. */
  concurrent: SeededApplicant;
}

let seeded: SeededWorld | undefined;

function unwrap(json: any): any {
  return json && typeof json === 'object' && 'data' in json ? json.data : json;
}

async function seedApplicant(
  label: string,
  canonicalProgramId: string,
  intakeId: string,
): Promise<SeededApplicant> {
  const ctx = await freshContext();
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
  const email = `harness.${label}.${stamp}@example.com`;
  const password = 'HarnessStudent123';

  const reg = await ctx.post('/api/v1/auth/register/', {
    data: { email, password, first_name: 'Harness', last_name: label },
  });
  expect(reg.ok(), `${label} should register (got ${reg.status()}: ${await reg.text()})`).toBeTruthy();
  const login = await ctx.post('/api/v1/auth/login/', { data: { email, password } });
  expect(login.ok(), `${label} should log in (got ${login.status()})`).toBeTruthy();
  const csrf = login.headers()['x-csrf-token'] || '';
  expect(csrf, 'login should return an X-CSRF-Token header').toBeTruthy();

  const { applicationId } = await createDraftApplication(ctx, csrf, {
    canonicalProgramId,
    intakeId,
    email,
    fullName: `Harness ${label} ${stamp}`,
  });
  return { ctx, email, password, csrf, applicationId };
}

/** Move an application through the platform's own review command. */
async function review(
  admin: AuthedContext,
  applicationId: string,
  body: Record<string, unknown>,
): Promise<any> {
  const response = await admin.ctx.post(`/api/v1/applications/${applicationId}/review/`, {
    headers: { 'x-csrf-token': admin.csrf },
    data: body,
  });
  expect(
    response.ok(),
    `review ${JSON.stringify(body.new_status)} should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
  return unwrap(await response.json());
}

/**
 * Take an application to an offer state through the real state machine.
 *
 * Nothing is written into `applications` directly: an offer the platform did not
 * make would prove only that the column exists. The deadline is computed by
 * `EnrollmentService.compute_deadline` on the transition into the offer status.
 */
async function offer(
  admin: AuthedContext,
  applicant: SeededApplicant,
  status: 'approved' | 'conditionally_approved',
  conditions?: Array<Record<string, unknown>>,
): Promise<void> {
  await review(admin, applicant.applicationId, {
    new_status: 'submitted',
    notes: 'harness 10.3 enrollment-journey setup',
  });
  await review(admin, applicant.applicationId, {
    new_status: 'under_review',
    notes: 'harness 10.3 enrollment-journey setup',
  });
  await review(admin, applicant.applicationId, {
    new_status: status,
    notes: 'harness 10.3 enrollment-journey setup',
    // An unconditional approval is payment-gated (`PAYMENT_UNVERIFIED`), and the
    // fee is not this task's subject. `force` is the platform's own documented
    // override for exactly that — an audited admin decision, not a bypass of the
    // enrollment gates these journeys are about.
    ...(status === 'approved' ? { force: true, reason: 'harness 10.3 setup' } : {}),
    ...(conditions ? { conditions } : {}),
  });
}

async function seedWorld(): Promise<SeededWorld> {
  if (seeded) return seeded;
  const admin = await superAdminContext();
  const stamp = `${Date.now()}`.slice(-8);

  const institutions = unwrap(
    await (await admin.ctx.get('/api/v1/admin/institutions/?pageSize=5')).json(),
  );
  const rows: any[] = Array.isArray(institutions)
    ? institutions
    : Array.isArray(institutions?.results)
      ? institutions.results
      : [];
  const institution = rows[0];
  expect(institution?.id, 'the harness should have at least one institution').toBeTruthy();

  const canonicals = await listCanonicalPrograms(admin);
  expect(
    canonicals.length,
    'the harness catalogue should publish at least one canonical program',
  ).toBeGreaterThan(0);
  const canonicalProgramId = canonicals[0].id;
  const { intakeId } = await createIntake(admin, {
    name: `Enrollment Readiness Intake ${stamp}`,
    year: new Date().getFullYear() + 1,
  });
  const offering = await assignOffering(admin, institution.id, {
    canonical_program_id: canonicalProgramId,
    name: `Enrollment Readiness Offering ${stamp}`,
    code: `ER${stamp}`,
  });
  await linkIntake(admin, {
    program_id: offering.offeringId,
    intake_id: intakeId,
    max_capacity: 100,
  });

  const success = await seedApplicant('enrolsuccess', canonicalProgramId, intakeId);
  const conditional = await seedApplicant('enrolcond', canonicalProgramId, intakeId);
  const overdue = await seedApplicant('enroloverdue', canonicalProgramId, intakeId);
  const concurrent = await seedApplicant('enrolrace', canonicalProgramId, intakeId);

  await offer(admin, success, 'approved');
  await offer(admin, overdue, 'approved');
  await offer(admin, concurrent, 'approved');

  const deadline = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await offer(admin, conditional, 'conditionally_approved', [
    {
      description: 'Certified copy of your final transcript',
      condition_type: 'document',
      deadline,
    },
  ]);

  const conditionsResponse = await admin.ctx.get(CONDITIONS_API(conditional.applicationId));
  expect(
    conditionsResponse.ok(),
    `conditions read should succeed (got ${conditionsResponse.status()})`,
  ).toBeTruthy();
  const conditions = unwrap(await conditionsResponse.json());
  expect(Array.isArray(conditions) && conditions.length === 1, 'one condition should exist').toBeTruthy();

  seeded = {
    admin,
    institutionId: institution.id,
    canonicalProgramId,
    intakeId,
    success,
    conditional,
    conditionId: conditions[0].id,
    overdue,
    concurrent,
  };
  return seeded;
}

test.beforeAll(async () => {
  await seedWorld();
});

test.afterAll(async () => {
  if (!seeded) return;
  await seeded.success.ctx.dispose();
  await seeded.conditional.ctx.dispose();
  await seeded.overdue.ctx.dispose();
  await seeded.concurrent.ctx.dispose();
});

async function loginAs(page: Page, applicant: SeededApplicant): Promise<string> {
  const login = await page.request.post('/api/v1/auth/login/', {
    data: { email: applicant.email, password: applicant.password },
  });
  expect(
    login.ok(),
    `${applicant.email} should log in (got ${login.status()}: ${await login.text()})`,
  ).toBeTruthy();
  const session = await page.request.get('/api/v1/auth/session/?refresh_csrf=1');
  expect(session.ok(), 'session bootstrap should succeed').toBeTruthy();
  const csrf = session.headers()['x-csrf-token'] || '';
  expect(csrf, 'the session should issue a CSRF token').toBeTruthy();
  return csrf;
}

async function openApplication(page: Page, applicationId: string): Promise<void> {
  await page.goto(APPLICATION_URL(applicationId), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /^Application #/ }).first()).toBeVisible({
    timeout: 30_000,
  });
}

/** The readiness the server published on the detail read. */
async function readReadiness(page: Page, applicationId: string): Promise<any> {
  const response = await page.request.get(APPLICATION_API(applicationId));
  expect(
    response.ok(),
    `application read should succeed (got ${response.status()}: ${await response.text()})`,
  ).toBeTruthy();
  const payload = unwrap(await response.json());
  const application = payload?.application ?? payload;
  expect(application?.enrollment, 'the detail read must publish an enrollment readiness').toBeTruthy();
  return application.enrollment;
}

// ---------------------------------------------------------------------------
// 1. Success (Required_Evidence)
// ---------------------------------------------------------------------------
test('an approved student sees a server-authored deadline and confirms their place', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.success;
  const csrf = await loginAs(page, applicant);

  // The contract STU-15 said was missing: a deadline and a readiness on the read.
  const readiness = await readReadiness(page, applicant.applicationId);
  expect(readiness.state).toBe('confirmable');
  expect(readiness.can_confirm).toBe(true);
  expect(readiness.deadline, 'the offer carries a server-computed deadline').toBeTruthy();
  expect(readiness.deadline_passed).toBe(false);
  expect(readiness.seconds_remaining).toBeGreaterThan(0);
  expect(readiness.blockers).toEqual([]);
  expect(readiness.definition, 'the state ships the platform\u2019s own words').toBeTruthy();

  // The dashboard row renders the card at all — the field it reads finally has a
  // value, on both viewports.
  await page.goto(DASHBOARD_URL, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId('enrollment-confirmable').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Confirm enrollment by/i);
  await expect(card).toContainText(/left to confirm/i);

  // And the application page offers the control with the countdown.
  await openApplication(page, applicant.applicationId);
  const section = page.getByTestId('enrollment-confirmable');
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(section).toContainText(/left to confirm/i);
  await page.getByRole('button', { name: /^Confirm Enrollment$/i }).click();
  // The dialog's own commit control is labelled `Confirm`.
  await page.getByRole('button', { name: /^Confirm$/ }).click();

  // The platform reads back as enrolled, and the readiness says the place is
  // confirmed rather than merely "not confirmable".
  await expect
    .poll(
      async () => {
        const response = await page.request.get(APPLICATION_API(applicant.applicationId));
        if (!response.ok()) return null;
        const payload = unwrap(await response.json());
        return (payload?.application ?? payload)?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('enrolled');

  const after = await readReadiness(page, applicant.applicationId);
  expect(after.state).toBe('confirmed');
  expect(after.can_confirm).toBe(false);
  expect(after.existing_enrollment.this_application).toBe(true);

  // Idempotent: a retried confirmation does not tell the student their confirmed
  // place is invalid (design §11.2 "commits idempotently").
  const replay = await page.request.post(CONFIRM_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(replay.status(), 'a repeated confirmation is a success, not an error').toBe(200);
  expect(unwrap(await replay.json()).status).toBe('enrolled');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 2. Missing condition (Required_Evidence)
// ---------------------------------------------------------------------------
test('a conditional offer is blocked until its condition is accepted, then enrolls', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.conditional;
  const csrf = await loginAs(page, applicant);

  const blockedReadiness = await readReadiness(page, applicant.applicationId);
  expect(blockedReadiness.state).toBe('blocked');
  expect(blockedReadiness.can_confirm).toBe(false);
  expect(blockedReadiness.conditions.outstanding).toBe(1);
  expect(blockedReadiness.conditions.satisfied).toBe(false);
  expect(blockedReadiness.blockers.map((b: any) => b.code)).toContain('CONDITIONS_NOT_MET');
  // A blocked student is never dead-ended (6.5's rule).
  expect(blockedReadiness.allowed_actions.length).toBeGreaterThan(0);

  // On screen: the reason and an action, not a missing button.
  await openApplication(page, applicant.applicationId);
  const blockedSection = page.getByTestId('enrollment-blocked');
  await expect(blockedSection).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('enrollment-blocker')).toContainText(/accepted or waived/i);
  await expect(page.getByRole('button', { name: /^Confirm Enrollment$/i })).toHaveCount(0);

  // The command agrees with the screen — this journey's asserted error path (R18.4).
  gate.allowRequest(CONFIRM_API(applicant.applicationId));
  const refused = await page.request.post(CONFIRM_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(refused.status(), 'an outstanding condition refuses confirmation').toBe(400);
  expect((await refused.json()).code).toBe('CONDITIONS_NOT_MET');

  // The school accepts the condition.
  const accepted = await world.admin.ctx.post(
    `${CONDITIONS_API(applicant.applicationId)}${world.conditionId}/review/`,
    {
      headers: { 'x-csrf-token': world.admin.csrf },
      data: { outcome: 'met' },
    },
  );
  expect(
    accepted.ok(),
    `accepting the condition should succeed (got ${accepted.status()}: ${await accepted.text()})`,
  ).toBeTruthy();

  // The other half of STU-15: the backend has always allowed a conditionally
  // approved offer to enroll once its conditions are resolved, and this surface
  // only ever offered confirmation for `approved`. Now it is offered.
  const confirmable = await readReadiness(page, applicant.applicationId);
  expect(confirmable.status).toBe('conditionally_approved');
  expect(confirmable.state).toBe('confirmable');
  expect(confirmable.can_confirm).toBe(true);
  expect(confirmable.conditions.accepted).toBe(1);

  await openApplication(page, applicant.applicationId);
  await expect(page.getByTestId('enrollment-confirmable')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Confirm Enrollment$/i }).click();
  // The dialog's own commit control is labelled `Confirm`.
  await page.getByRole('button', { name: /^Confirm$/ }).click();

  await expect
    .poll(
      async () => {
        const response = await page.request.get(APPLICATION_API(applicant.applicationId));
        if (!response.ok()) return null;
        const payload = unwrap(await response.json());
        return (payload?.application ?? payload)?.status;
      },
      { timeout: 30_000 },
    )
    .toBe('enrolled');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 3. Deadline (Required_Evidence)
// ---------------------------------------------------------------------------
test('an offer past its deadline publishes the refusal and will not confirm', async ({
  page,
  gate,
}) => {
  const world = seeded!;
  const applicant = world.overdue;
  const csrf = await loginAs(page, applicant);

  // The offer starts inside its deadline — the platform computed it on the
  // transition into `approved`, 14 days out.
  const open = await readReadiness(page, applicant.applicationId);
  expect(open.can_confirm, 'the offer starts confirmable').toBe(true);
  expect(open.seconds_remaining).toBeGreaterThan(0);

  // Compress the *wait*, not the behaviour: the field is server-authored with no
  // operator write route, so the only lever is the platform's own column, set the
  // same way `runReconciliationExpirySweep` compresses a 24 h cutoff to zero.
  await expireEnrollmentDeadline(applicant.applicationId, 48);

  const readiness = await readReadiness(page, applicant.applicationId);
  expect(readiness.deadline_passed).toBe(true);
  expect(readiness.state).toBe('blocked');
  expect(readiness.can_confirm).toBe(false);
  expect(readiness.seconds_remaining).toBeLessThan(0);
  expect(readiness.blockers.map((b: any) => b.code)).toContain('DEADLINE_PASSED');

  await openApplication(page, applicant.applicationId);
  await expect(page.getByTestId('enrollment-blocked')).toBeVisible({ timeout: 30_000 });
  // A spent deadline is described as spent, never as time remaining.
  await expect(page.getByTestId('enrollment-blocked')).toContainText(/Deadline .*passed/i);
  await expect(page.getByRole('button', { name: /^Confirm Enrollment$/i })).toHaveCount(0);

  // This journey's asserted error path (R18.4).
  gate.allowRequest(CONFIRM_API(applicant.applicationId));
  const refused = await page.request.post(CONFIRM_API(applicant.applicationId), {
    headers: { 'x-csrf-token': csrf },
  });
  expect(refused.status(), 'a passed deadline refuses confirmation').toBe(400);
  expect((await refused.json()).code).toBe('DEADLINE_PASSED');

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});

// ---------------------------------------------------------------------------
// 4. Concurrent confirm (Required_Evidence)
// ---------------------------------------------------------------------------
test('six simultaneous confirmations produce exactly one enrollment', async ({ page, gate }) => {
  const world = seeded!;
  const applicant = world.concurrent;
  const csrf = await loginAs(page, applicant);

  const before = await readReadiness(page, applicant.applicationId);
  expect(before.can_confirm, 'the race starts from a confirmable offer').toBe(true);

  // Fire them together from the authenticated browser context. The application
  // row lock serializes them, and the idempotent recognition of an already
  // enrolled application means every caller observes the committed state.
  const responses = await Promise.all(
    Array.from({ length: 6 }, () =>
      page.request.post(CONFIRM_API(applicant.applicationId), {
        headers: { 'x-csrf-token': csrf },
      }),
    ),
  );

  const statuses = responses.map(response => response.status());
  expect(
    statuses.every(status => status === 200),
    `every caller should see success, got ${JSON.stringify(statuses)}`,
  ).toBeTruthy();
  const bodies = await Promise.all(responses.map(response => response.json()));
  expect(bodies.every(body => unwrap(body).status === 'enrolled')).toBeTruthy();

  // But the transition happened exactly once: one history row, so one student
  // number, one notification, one audit trail. Read from the student's own
  // timeline (`GET /applications/history/`, owner-scoped) and narrowed to this
  // application.
  const history = await page.request.get('/api/v1/applications/history/?pageSize=100');
  expect(history.ok(), `history read should succeed (got ${history.status()})`).toBeTruthy();
  const historyPayload = unwrap(await history.json());
  const rows: any[] = Array.isArray(historyPayload)
    ? historyPayload
    : (historyPayload?.results ?? []);
  const enrolledRows = rows.filter(
    row =>
      String(row.application_id) === String(applicant.applicationId) &&
      row.new_status === 'enrolled',
  );
  expect(
    enrolledRows.length,
    `exactly one enrolled transition, got ${enrolledRows.length}`,
  ).toBe(1);

  const after = await readReadiness(page, applicant.applicationId);
  expect(after.state).toBe('confirmed');

  // And the student's own page shows the confirmed place, with no lingering
  // control that would invite a seventh attempt.
  await openApplication(page, applicant.applicationId);
  await expect(page.getByRole('button', { name: /^Confirm Enrollment$/i })).toHaveCount(0);

  expect(gate.consoleErrors, 'no console errors').toEqual([]);
});
